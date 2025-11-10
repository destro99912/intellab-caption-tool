// app/api/hashtags/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // use node runtime for server-side SDKs / longer fetch timeouts

const ALLOWED_PLATFORMS = new Set(["instagram", "tiktok", "youtube", "facebook"]);

type Agg = {
  posts: number;
  likesSum: number;
  commentsSum: number;
  likesN: number;
  commentsN: number;
};

// Helper: build Apify dataset items URL from datasetId + token
function apifyDatasetUrl(datasetId: string, token: string, limit = 200, offset = 0) {
  const base = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items`;
  const params = new URLSearchParams({ token, clean: "true", format: "json", limit: String(limit), offset: String(offset) });
  return `${base}?${params.toString()}`;
}

// Helper: try multiple known shapes to extract a numeric metric
function extractNumber(shape: any, keys: string[]) {
  for (const k of keys) {
    const v = shape?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      if (!Number.isNaN(n)) return n;
    }
    // deep path like 'edge_media_preview_like.count'
    if (k.includes(".")) {
      const parts = k.split(".");
      let cur = shape;
      for (const p of parts) cur = cur?.[p];
      if (typeof cur === "number" && !Number.isNaN(cur)) return cur;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  let platformParam = (url.searchParams.get("platform") || "instagram").toLowerCase();
  const platform = ALLOWED_PLATFORMS.has(platformParam) ? platformParam : platformParam;
  const count = Math.max(1, Math.min(Number(url.searchParams.get("count") || "20"), 200));
  const sample = Math.max(50, Math.min(Number(url.searchParams.get("sample") || String(count * 10)), 5000));

  if (!q) {
    return NextResponse.json({ error: true, message: "Missing query param 'q'" }, { status: 400 });
  }

  // Currently only Instagram via Apify is implemented
  if (platform !== "instagram") {
    return NextResponse.json({
      error: true,
      message: `Platform '${platform}' not implemented. Only 'instagram' is supported at this time.`,
      provider: "none",
    }, { status: 501 });
  }

  // Read env-driven dataset config
  const datasetId = process.env.APIFY_DATASET_ID || url.searchParams.get("datasetId") || null;
  const token = process.env.APIFY_TOKEN || null;

  if (!datasetId || !token) {
    return NextResponse.json({ error: true, message: "APIFY_DATASET_ID and APIFY_TOKEN must be configured", provider: "none" }, { status: 500 });
  }

  // Fetch with timeout + simple retry/backoff
  const pageLimit = 200; // Apify dataset page size
  const maxPages = Math.ceil(sample / pageLimit);
  const needle = q.toLowerCase();

  const matchedPosts: any[] = [];

  const controller = new AbortController();
  const timeoutMs = 10000;

  try {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageLimit;
      const url = apifyDatasetUrl(datasetId, token, pageLimit, offset);

      // local fetch with timeout
      const attemptFetch = async (attempt = 0): Promise<Response> => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs + attempt * 2000);
        try {
          const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
          if (res.status >= 500 || res.status === 429) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
              return attemptFetch(attempt + 1);
            }
            return res; // will be handled below
          }
          return res;
        } finally {
          clearTimeout(timer);
        }
      };

      const res = await attemptFetch(0);
      if (!res.ok) {
        // upstream error -> surface provider unavailable
        const status = res.status;
        return NextResponse.json({ error: true, message: "Upstream provider unavailable", provider: "Apify", status }, { status: 502 });
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const post of data) {
        const caption = String(post?.caption || "").toLowerCase();
        const tags: string[] = Array.isArray(post?.hashtags) ? post.hashtags : [];
        const tagHit = tags.some((t) => String(t || "").toLowerCase().includes(needle));
        if (caption.includes(needle) || tagHit) {
          matchedPosts.push(post);
        }
      }

      // stop early if we already collected enough posts
      if (matchedPosts.length >= sample) break;
    }

    // Normalize & aggregate
    const map = new Map<string, Agg>();
    const postsOut: any[] = [];

    for (const post of matchedPosts.slice(0, sample)) {
      const rawTags: any[] = Array.isArray(post?.hashtags) ? post.hashtags : [];

      const likes = extractNumber(post, ["likesCount", "likes", "like_count", "edge_media_preview_like.count", "edge_liked_by?.count"]);
      const comments = extractNumber(post, ["commentsCount", "comments", "commentCount", "edge_media_preview_comment.count", "edge_media_to_comment?.count"]);

      // produce normalized post for 'posts' array
      const normalizedTags: string[] = rawTags
        .map((t) => String(t || "").trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean);

      postsOut.push({
        caption: post?.caption ?? null,
        hashtags: normalizedTags,
        url: post?.url ?? post?.permalink ?? null,
        imageUrl: post?.imageUrl ?? post?.displayUrl ?? post?.thumbnailUrl ?? null,
        likes: typeof likes === "number" ? likes : null,
        comments: typeof comments === "number" ? comments : null,
        ownerUsername: post?.ownerUsername ?? post?.username ?? post?.owner?.username ?? null,
      });

      // aggregate per normalized tag
      for (const t of normalizedTags) {
        const key = t;
        const cur = map.get(key) || { posts: 0, likesSum: 0, commentsSum: 0, likesN: 0, commentsN: 0 };
        cur.posts += 1;
        if (typeof likes === "number") {
          cur.likesSum += likes;
          cur.likesN += 1;
        }
        if (typeof comments === "number") {
          cur.commentsSum += comments;
          cur.commentsN += 1;
        }
        map.set(key, cur);
      }
    }

    const rows = Array.from(map.entries())
      .sort((a, b) => b[1].posts - a[1].posts)
      .slice(0, count)
      .map(([key, agg]) => {
        return {
          hashtag: `#${key}`,
          posts: agg.posts,
          avgLikes: agg.likesN ? Math.round(agg.likesSum / agg.likesN) : null,
          avgComments: agg.commentsN ? Math.round(agg.commentsSum / agg.commentsN) : null,
        };
      });

    // summary: average across non-null entries
    const summary = {
      totalHashtags: rows.length,
      totalPosts: rows.reduce((a, r) => a + (r.posts ?? 0), 0),
      averageLikes:
        rows.length > 0
          ? Math.round(
              rows.reduce((a, r) => a + (r.avgLikes ?? 0), 0) /
                Math.max(1, rows.filter((r) => r.avgLikes != null).length)
            )
          : 0,
      averageComments:
        rows.length > 0
          ? Math.round(
              rows.reduce((a, r) => a + (r.avgComments ?? 0), 0) /
                Math.max(1, rows.filter((r) => r.avgComments != null).length)
            )
          : 0,
    };

    return NextResponse.json({
      query: q,
      meta: { platform: "instagram", provider: "Apify", datasetId: datasetId },
      summary,
      rows,
      posts: postsOut,
    });
  } catch (err: any) {
    // Avoid leaking secrets; surface a safe message
    console.error("hashtags route error:", err?.message ?? err);
    return NextResponse.json({ error: true, message: "Upstream provider unavailable" }, { status: 502 });
  } finally {
    controller.abort();
  }
}
