"use client";

import { useMemo, useState } from "react";

/** Flexible row shape for both analytics and social posts */
type Row = {
  // analytics fields (mock/provider)
  hashtag?: string;
  posts?: number | null;
  searchVolume?: number | null;
  trend?: number | null;
  cpc?: number | null;
  competition?: number | null;

  // social post fields (Apify/etc.)
  caption?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  hashtags?: string[] | null;
  likes?: number | null;
  comments?: number | null;
  ownerUsername?: string | null;

  // misc variants from providers
  [key: string]: any;
};

type Summary = {
  totalHashtags?: number;
  totalPosts?: number;
  totalSearchVolume?: number;
  averageTrend?: number;
  averageCPC?: number;
  averageCompetition?: number;
  [key: string]: any;
};

type Aggregated = {
  hashtag: string;
  posts: number;
  avgLikes?: number | null;
  avgComments?: number | null;
  // pass-through analytics if present
  searchVolume?: number | null;
  trend?: number | null;
  cpc?: number | null;
  competition?: number | null;
};

export default function HashtagGeneratorPage() {
  const [q, setQ] = useState("cotton basket");
  const [region, setRegion] = useState("global");
  const [lang, setLang] = useState("en");
  const [platform, setPlatform] = useState("instagram");
  const [count, setCount] = useState(20);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [providerMeta, setProviderMeta] = useState<{ provider?: string; datasetId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NEW: view selector (Numbers vs Posts)
  const [view, setView] = useState<"numbers" | "posts">("numbers");

  /** === helpers === */
  const fmt = (n?: number | null) =>
    n == null || Number.isNaN(n)
      ? "—"
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

  const firstImage = (r: Row): string | null => {
    if (r.imageUrl) return r.imageUrl;
    if (Array.isArray(r.imageUrls) && r.imageUrls.length) return r.imageUrls[0];
    if (Array.isArray(r.images) && r.images.length) {
      const v = r.images[0];
      if (typeof v === "string") return v;
      if (v?.url) return v.url;
      if (v?.src) return v.src;
    }
    return r.thumbnailUrl ?? r.displayUrl ?? r.thumbnail_src ?? r.display_url ?? null;
  };
  const likeCount = (r: Row) => r.likes ?? r.likesCount ?? r.likeCount ?? null;
  const commentCount = (r: Row) =>
    r.comments ?? r.commentsCount ?? r.commentCount ?? null;
  const ownerName = (r: Row) =>
    r.ownerUsername ?? r?.owner?.username ?? r.username ?? null;

  // Detect if provider returns analytics fields (rows) or we have post objects
  const hasAnalyticsMetrics = useMemo(() => {
    const r = rows[0] ?? posts[0];
    return !!r && (
      typeof (r as any)?.searchVolume === "number" ||
      typeof (r as any)?.cpc === "number" ||
      typeof (r as any)?.competition === "number" ||
      typeof (r as any)?.trend === "number"
    );
  }, [rows, posts]);

  // Aggregate into numbers per hashtag when we have post-style data
  const aggregated: Aggregated[] = useMemo(() => {
    // Case A: provider already returns analytics rows -> map them to a clean table
    if (hasAnalyticsMetrics) {
      return rows
        .filter((r) => r?.hashtag)
        .map((r) => ({
          hashtag: r.hashtag!,
          posts: typeof r.posts === "number" ? r.posts! : 0,
          searchVolume: r.searchVolume ?? null,
          trend: r.trend ?? null,
          cpc: r.cpc ?? null,
          competition: r.competition ?? null,
        }));
    }

    // Case B: we have post objects -> count per hashtag + avg likes/comments
    const map = new Map<
      string,
      { posts: number; likesSum: number; likesN: number; commentsSum: number; commentsN: number }
    >();

    const source = posts.length > 0 ? posts : rows;

    for (const r of source) {
      const hs: string[] =
        Array.isArray(r.hashtags) ? r.hashtags : Array.isArray((r as any).tags) ? (r as any).tags : [];
      if (!hs || !hs.length) continue;

      const likes = likeCount(r);
      const comments = commentCount(r);

      for (const hRaw of hs) {
        const h = String(hRaw).replace(/^#/, "").toLowerCase().trim();
        if (!h) continue;
        const cur = map.get(h) || { posts: 0, likesSum: 0, likesN: 0, commentsSum: 0, commentsN: 0 };
        cur.posts += 1;
        if (typeof likes === "number") {
          cur.likesSum += likes;
          cur.likesN += 1;
        }
        if (typeof comments === "number") {
          cur.commentsSum += comments;
          cur.commentsN += 1;
        }
        map.set(h, cur);
      }
    }

    const out: Aggregated[] = [];
    for (const [hashtag, v] of map) {
      out.push({
        hashtag: `#${hashtag}`,
        posts: v.posts,
        avgLikes: v.likesN ? v.likesSum / v.likesN : null,
        avgComments: v.commentsN ? v.commentsSum / v.commentsN : null,
      });
    }
    // sort by posts desc
    out.sort((a, b) => b.posts - a.posts);
    return out.slice(0, 200); // keep bound
  }, [rows, hasAnalyticsMetrics]);

  async function onGenerate() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        q,
        region,
        lang,
        platform,
        count: String(count),
      });

      const res = await fetch(`/api/hashtags?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.message || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      if (data?.error) {
        throw new Error(data?.message || "Provider error");
      }
      setSummary(data.summary ?? null);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setProviderMeta(data.meta ?? null);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Hashtag Generator</h1>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="keyword"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="region (global/US/…)"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="lang (en)"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        />
        <select
          className="border rounded px-3 py-2"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="facebook">Facebook</option>
        </select>
        <input
          className="border rounded px-3 py-2"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        {/* View toggle */}
        <select
          className="border rounded px-3 py-2"
          value={view}
          onChange={(e) => setView(e.target.value as "numbers" | "posts")}
          title="View"
        >
          <option value="numbers">Numbers</option>
          <option value="posts">Posts</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
        {providerMeta?.provider && (
          <div className="text-xs text-gray-600 px-2 py-1 border rounded">Provider: {providerMeta.provider}</div>
        )}
      </div>

      {error && <div className="text-red-600 text-sm">Error: {error}</div>}

      {/* Summary (only appears if provider sends analytics summary) */}
      {summary && hasAnalyticsMetrics && view === "numbers" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {"totalHashtags" in summary && (
            <div className="border rounded p-4">
              <div className="text-sm opacity-70">Total Hashtags</div>
              <div className="text-xl font-semibold">{fmt(summary.totalHashtags)}</div>
            </div>
          )}
          {"totalSearchVolume" in summary && (
            <div className="border rounded p-4">
              <div className="text-sm opacity-70">Total Search Volume</div>
              <div className="text-xl font-semibold">{fmt(summary.totalSearchVolume)}</div>
            </div>
          )}
          {"averageCPC" in summary && (
            <div className="border rounded p-4">
              <div className="text-sm opacity-70">Average CPC (USD)</div>
              <div className="text-xl font-semibold">{fmt(summary.averageCPC)}</div>
            </div>
          )}
          {"averageTrend" in summary && (
            <div className="border rounded p-4">
              <div className="text-sm opacity-70">Average Trend</div>
              <div className="text-xl font-semibold">{fmt(summary.averageTrend)}</div>
            </div>
          )}
          {"averageCompetition" in summary && (
            <div className="border rounded p-4">
              <div className="text-sm opacity-70">Average Competition</div>
              <div className="text-xl font-semibold">{fmt(summary.averageCompetition)}</div>
            </div>
          )}
        </div>
      )}

      {/* NUMBERS TABLE (default) */}
      {view === "numbers" && (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Hashtag</th>
                <th className="text-left p-2">Posts</th>
                {/* analytics columns (if provider has them) */}
                {hasAnalyticsMetrics && (
                  <>
                    <th className="text-left p-2">Search Volume</th>
                    <th className="text-left p-2">Trend</th>
                    <th className="text-left p-2">CPC (USD)</th>
                    <th className="text-left p-2">Competition</th>
                  </>
                )}
                {/* aggregated metrics (when posts → numbers) */}
                {!hasAnalyticsMetrics && (
                  <>
                    <th className="text-left p-2">Avg Likes</th>
                    <th className="text-left p-2">Avg Comments</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {aggregated.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">{r.hashtag}</td>
                  <td className="p-2">{fmt(r.posts)}</td>

                  {hasAnalyticsMetrics ? (
                    <>
                      <td className="p-2">{fmt(r.searchVolume)}</td>
                      <td className="p-2">{fmt(r.trend)}</td>
                      <td className="p-2">{fmt(r.cpc)}</td>
                      <td className="p-2">{fmt(r.competition)}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">{fmt(r.avgLikes)}</td>
                      <td className="p-2">{fmt(r.avgComments)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* POSTS GRID (optional) */}
      {view === "posts" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((r, i) => {
            const imgSrc = firstImage(r);
            return (
              <article key={i} className="border rounded overflow-hidden flex flex-col">
                {imgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgSrc}
                    alt="Post"
                    className="w-full h-48 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                    No image
                  </div>
                )}

                <div className="p-3 space-y-2">
                  <div className="text-xs text-gray-500">
                    {ownerName(r) ? `@${ownerName(r)}` : "—"}
                  </div>
                  <p className="text-sm line-clamp-4 whitespace-pre-wrap">
                    {r.caption || "—"}
                  </p>
                  {Array.isArray(r.hashtags) && r.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {r.hashtags.slice(0, 6).map((h: string, idx: number) => (
                        <span key={idx} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          #{h}
                        </span>
                      ))}
                      {r.hashtags.length > 6 && (
                        <span className="text-xs text-gray-500">+{r.hashtags.length - 6}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-600 pt-1">
                    <span>❤️ {fmt(likeCount(r))}</span>
                    <span>💬 {fmt(commentCount(r))}</span>
                  </div>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-blue-600 hover:underline pt-1"
                    >
                      Open post ↗
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && rows.length === 0 && posts.length === 0 && (
        <p className="text-sm text-gray-500">No results yet.</p>
      )}
    </main>
  );
}
