"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ApiResponse =
  | { hashtags: string[]; meta?: { count: number } }
  | { error: string };

const COUNTRIES = [
  { code: "GLB", label: "Global / Worldwide (All Countries)" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "PK", label: "Pakistan" },
  { code: "US", label: "United States" },
];

const LANGS = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "ur", label: "Urdu" },
];

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X (Twitter)" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
];

export default function HashtagGeneratorPage() {
  // search controls
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("GLB");
  const [lang, setLang] = useState("en");
  const [platform, setPlatform] = useState("instagram");

  // generate params
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<"hashtags" | "people">("hashtags");

  const canSubmit = useMemo(
    () => query.trim().length > 0 && !loading && activeTab === "hashtags",
    [query, loading, activeTab]
  );

  async function handleGenerate() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/tools/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: query,
          count,
          country,
          lang,
          platform,
        }),
      });
      const data: ApiResponse = await res.json();
      if (!res.ok) {
        const message = "error" in data ? data.error : `Request failed (${res.status})`;
        setError(message);
        return;
      }
      if ("hashtags" in data && Array.isArray(data.hashtags)) {
        setResults(data.hashtags);
      } else {
        setError("Unexpected response shape from API.");
      }
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh">
      {/* faux top bar to resemble the reference */}
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="h-3 w-3 rounded-full bg-orange-500" />
            <span>Intellab</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/pricing" className="text-sm hover:underline">
              Pricing
            </Link>
            <Link
              href="/auth/signin"
              className="rounded-full bg-black px-4 py-1.5 text-sm text-white"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>

      {/* search row */}
      <div className="border-b bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <div className="mx-auto max-w-7xl px-4 py-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="flex items-center gap-2 rounded-xl border px-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="cotton basket"
              className="w-full bg-transparent py-2 outline-none"
            />
          </div>

          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-xl border px-3 py-2"
            aria-label="Country"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-xl border px-3 py-2"
            aria-label="Language"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-xl border px-3 py-2"
            aria-label="Platform"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* tabs */}
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-6">
            <button
              className={`py-3 border-b-2 ${
                activeTab === "hashtags" ? "border-black" : "border-transparent text-gray-500"
              }`}
              onClick={() => setActiveTab("hashtags")}
            >
              # Hashtags
            </button>
            <button
              className={`py-3 border-b-2 ${
                activeTab === "people" ? "border-black" : "border-transparent text-gray-500"
              }`}
              onClick={() => setActiveTab("people")}
            >
              People
            </button>

            <div className="ml-auto flex items-center gap-3">
              <label className="text-sm text-gray-600">Count</label>
              <input
                type="number"
                min={5}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-24 rounded-lg border px-3 py-1.5"
              />
              <button
                onClick={handleGenerate}
                disabled={!canSubmit}
                className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mx-auto max-w-7xl px-4 py-6 grid gap-4 md:grid-cols-3">
        {[
          { label: "Total Hashtags", value: results.length ? results.length : 0 },
          { label: "Total Posts", value: "—" },
          { label: "Total Search Volume", value: "—" },
          { label: "Average Trend", value: "—" },
          { label: "Average CPC (USD)", value: "—" },
          { label: "Average Competition", value: "—" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="text-sm text-gray-500">{kpi.label}</div>
            <div className="mt-1 text-2xl font-semibold">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* results */}
      <div className="mx-auto max-w-7xl px-4 pb-12">
        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === "hashtags" ? (
          <div className="rounded-xl border bg-white">
            <div className="flex items-center gap-4 border-b px-4 py-3 text-sm text-gray-500">
              <div className="w-10">#</div>
              <div className="flex-1">Hashtag</div>
              <div className="w-32 text-right">Posts</div>
              <div className="w-40 text-right">Search Volume</div>
              <div className="w-28 text-right">Trend</div>
              <div className="w-32 text-right">CPC (USD)</div>
              <div className="w-32 text-right">Competition</div>
            </div>
            {results.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                Enter a topic and click <strong>Generate</strong> to see hashtags.
              </div>
            ) : (
              <ul>
                {results.map((tag, i) => (
                  <li
                    key={tag}
                    className="flex items-center gap-4 border-b px-4 py-2 last:border-b-0"
                  >
                    <div className="w-10 text-gray-500">{i + 1}</div>
                    <div className="flex-1 font-medium">{tag}</div>
                    <div className="w-32 text-right">—</div>
                    <div className="w-40 text-right">—</div>
                    <div className="w-28 text-right">—</div>
                    <div className="w-32 text-right">—</div>
                    <div className="w-32 text-right">—</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
            People results coming soon…
          </div>
        )}
      </div>
    </div>
  );
}
