'use client';

import { useEffect, useMemo, useState } from 'react';

type Item = {
  tag?: string;
  url?: string;
  imageUrl?: string | null;
  caption?: string;
  ownerUsername?: string;
  likes?: number;
  comments?: number;
  hashtags?: string[];
};

type ApiResponse = {
  ok: boolean;
  query: { q: string; region: string; lang: string; platform: string; limit: number };
  meta: { provider: string; datasetId?: string; generatedAt?: string };
  summary?: any;
  items: Item[];
  error?: boolean;
  message?: string;
};

function useSearchParam(name: string) {
  return useMemo(() => {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    return (u.searchParams.get(name) || '').trim();
  }, [typeof window === 'undefined' ? '' : window.location.search]);
}

export default function HashtagsPage() {
  const q = useSearchParam('q') || 'travel';
  const platform = useSearchParam('platform') || 'instagram';
  const limit = useSearchParam('limit') || '10';

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/hashtags?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(
            platform
          )}&limit=${encodeURIComponent(limit)}`
        );
        const json: ApiResponse = await res.json();
        if (!alive) return;
        if (!json.ok) {
          setErr(json.message || 'Request failed');
        } else {
          setData(json);
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'Network error');
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [q, platform, limit]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold mb-2">Hashtag Explorer</h1>
      <p className="text-sm text-gray-500 mb-6">
        Query: <code className="font-mono">{q}</code> • Platform:{' '}
        <code className="font-mono">{platform}</code> • Limit:{' '}
        <code className="font-mono">{limit}</code>
      </p>

      {loading && <div className="animate-pulse text-gray-600">Loading…</div>}
      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700">
          {err}
        </div>
      )}

      {data?.items?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.items.map((it, i) => (
            <li key={i} className="rounded-xl border p-4 hover:shadow-sm transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {it.tag || '#tag'}
                </span>
                <span className="text-xs text-gray-400">
                  ❤️ {it.likes ?? 0} · 💬 {it.comments ?? 0}
                </span>
              </div>

              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageUrl}
                  alt={it.tag || 'post'}
                  className="mb-3 aspect-video w-full rounded-md object-cover"
                />
              ) : null}

              <p className="text-sm line-clamp-4 whitespace-pre-wrap">{it.caption}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {it.hashtags?.slice(0, 6).map((h, j) => (
                  <span
                    key={j}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    #{h}
                  </span>
                ))}
              </div>

              {it.url && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-blue-600 hover:underline"
                >
                  Open post ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !loading &&
        !err && (
          <div className="text-gray-600">
            No items returned. Try a different query in the URL, e.g.{' '}
            <code className="rounded bg-gray-100 px-1">/hashtags?q=nyc&platform=instagram</code>
          </div>
        )
      )}
    </main>
  );
}
