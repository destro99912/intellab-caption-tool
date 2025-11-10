// app/api/hashtags/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // edge can't use fetch streaming reliably for big datasets

const ALLOWED_PLATFORMS = new Set(["instagram"]);
const DEFAULT_LIMIT = 20;

// --- helpers ---------------------------------------------------------------
const getEnv = (k: string) => process.env[k]?.trim() || "";

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s#_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ApifyItem = {
  url?: string;
  imageUrl?: string | null;
  caption?: string | null;
  likes?: number | null;
  comments?: number | null;
  ownerUsername?: string | null;
  hashtags?: string[] | null; // some datasets expose an array
  location?: { city?: string | null; country?: string | null } | null;
  lang?: string | null;
};

// find tags in a caption text
function extractTagsFromCaption(caption: string): string[] {
  const tags = new Set<string>();
  const rx = /#([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = rx.exec(caption))) tags.add(m[1].toLowerCase());
  return [...tags];
}

function pickImage(it: ApifyItem) {
  return it.imageUrl || null;
}

function likeNum(n: unknown) {
  return typeof n === "number" && isFinite(n) ? n : 0;
}
function comNum(n: unknown) {
  return typeof n === "number" && isFinite(n) ? n : 0;
}

// --- route ----------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  const q = norm(qRaw);
  const region = (url.searchParams.get("region") || "global").toLowerCase();
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || url.searchParams.get("count")) || DEFAULT_LIMIT, 100));
  const platformParam = (url.searchParams.get("platform") || "instagram").toLowerCase();
  const platform = ALLOWED_PLATFORMS.has(platformParam) ? platformParam : "instagram";

  // env checks
  const DATASET_ID = getEnv("APIFY_DATASET_ID");
  const APIFY_TOKEN = getEnv("APIFY_TOKEN");
  if (!DATASET_ID || !APIFY_TOKEN) {
    return NextResponse.json(
      { error: true, message: "APIFY_DATASET_ID and APIFY_TOKEN must be configured", provider: "none" },
      { status: 500 }
    );
  }

  // fetch raw items (we fetch more than needed, then filter)
  const apifyUrl = new URL(`https://api.apify.com/v2/datasets/${DATASET_ID}/items`);
  apifyUrl.searchParams.set("token", APIFY_TOKEN);
  apifyUrl.searchParams.set("clean", "true");
  apifyUrl.searchParams.set("format", "json");
  apifyUrl.searchParams.set("limit", "1000"); // pull a page for server-side filtering
  apifyUrl.searchParams.set("skipHidden", "true");

  const res = await fetch(apifyUrl.toString(), { headers: { "accept": "application/json" }, cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { error: true, message: `Upstream error ${res.status}`, provider: "apify" },
      { status: 502 }
    );
  }
  const raw: ApifyItem[] = await res.json();

  // --- filtering & mapping -------------------------------------------------
  const qWords = q ? q.split(" ") : [];
  const matchesQuery = (it: ApifyItem) => {
    if (!q) return true;
    const caption = norm(it.caption || "");
    const tags = (it.hashtags ?? extractTagsFromCaption(caption)).map((t) => t.toLowerCase());
    // match if any qWord equals a tag OR appears in caption with a preceding '#'
    return qWords.some(
      (w) => tags.includes(w) || caption.includes(`#${w}`) || caption.split(/\s+/).includes(w)
    );
  };

  const matchesRegion = (it: ApifyItem) => {
    if (region === "global") return true;
    const city = norm(it.location?.city || "");
    const country = norm(it.location?.country || "");
    return city.includes(region) || country.includes(region);
  };

  const matchesLang = (it: ApifyItem) => {
    if (!lang) return true;
    return (it.lang || "").toLowerCase() === lang;
  };

  const filtered = raw.filter((it) => matchesQuery(it) && matchesRegion(it) && matchesLang(it));

  // tally by tag
  type Bucket = {
    tag: string;
    count: number;
    totalLikes: number;
    totalComments: number;
    samples: number;
    samplePosts: {
      url: string | undefined;
      imageUrl: string | null;
      caption: string | null;
      likes: number;
      comments: number;
      ownerUsername: string | null;
    }[];
  };

  const buckets = new Map<string, Bucket>();

  for (const it of filtered) {
    const caption = it.caption || "";
    const tags = (it.hashtags ?? extractTagsFromCaption(caption)).map((t) => t.toLowerCase());
    const likes = likeNum(it.likes);
    const comments = comNum(it.comments);

    for (const tag of tags) {
      if (!tag) continue;
      const b = buckets.get(tag) || {
        tag,
        count: 0,
        totalLikes: 0,
        totalComments: 0,
        samples: 0,
        samplePosts: [],
      };
      b.count += 1;
      b.totalLikes += likes;
      b.totalComments += comments;

      if (b.samples < 3) {
        b.samplePosts.push({
          url: it.url,
          imageUrl: pickImage(it),
          caption: it.caption || null,
          likes,
          comments,
          ownerUsername: it.ownerUsername || null,
        });
        b.samples += 1;
      }
      buckets.set(tag, b);
    }
  }

  // rank by frequency then by average likes
  const ranked = [...buckets.values()]
    .map((b) => ({
      tag: b.tag,
      platform,
      posts: b.count,
      avgLikes: b.count ? Math.round(b.totalLikes / b.count) : 0,
      avgComments: b.count ? Math.round(b.totalComments / b.count) : 0,
      samples: b.samplePosts,
    }))
    .sort((a, b) => (b.posts - a.posts) || (b.avgLikes - a.avgLikes))
    .slice(0, limit);

  // response summary
  const summary = {
    totalPosts: filtered.length,
    totalTags: buckets.size,
    averageLikes: ranked.length ? Math.round(ranked.reduce((a, r) => a + r.avgLikes, 0) / ranked.length) : 0,
    averageComments: ranked.length ? Math.round(ranked.reduce((a, r) => a + r.avgComments, 0) / ranked.length) : 0,
  };

  return NextResponse.json({
    ok: true,
    query: { q: qRaw, region, lang, platform, limit },
    meta: { provider: "apify", datasetId: DATASET_ID, generatedAt: new Date().toISOString() },
    summary,
    items: ranked,
  });
}
