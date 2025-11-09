// app/api/tools/seo-metrics/route.ts
import { NextResponse } from "next/server";

/**
 * POST body shape:
 * {
 *   "terms": string[],              // e.g. ["cotton basket","nursery storage"]
 *   "country": string | undefined,  // e.g. "US" | "AE" | "PK" | "GLB"
 *   "lang": string | undefined      // e.g. "en"
 * }
 *
 * Response:
 * {
 *   "meta": {...},
 *   "items": [{ keyword, search_volume, cpc, competition, trend }]
 * }
 */

export const runtime = "edge"; // works on Node too

type ReqBody = {
  terms?: string[];
  country?: string;
  lang?: string;
};

// Minimal country → location_code map
const LOCATION_CODES: Record<string, number> = {
  US: 2840,
  AE: 2784,
  PK: 2758,
  IN: 2356,
  GB: 2826,
  CA: 2124,
  AU: 2036,
  // fallback below
};

function resolveLocationCode(country?: string): number {
  if (!country || country === "GLB" || country === "Global") {
    // DataForSEO requires a location. Use US as sane default.
    return 2840;
  }
  const upper = country.toUpperCase();
  return LOCATION_CODES[upper] ?? 2840;
}

function resolveLanguageCode(lang?: string): string {
  // DataForSEO expects BCP-47 like "en", "ar", "ur", etc.
  return (lang || "en").toLowerCase();
}

function basicAuth(login: string, password: string) {
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function calcTrend(monthly?: { year: number; month: number; search_volume: number }[]) {
  if (!monthly || monthly.length === 0) return null;
  // Compute a simple 0–100 score using the last up-to-12 months relative to max.
  const last12 = monthly.slice(-12);
  const vals = last12.map((m) => m.search_volume || 0);
  const max = Math.max(...vals, 0);
  if (max === 0) return 0;
  // Weighted average emphasizing recent months a bit more
  const weights = vals.map((_, i) => i + 1); // 1..n
  const weighted =
    vals.reduce((acc, v, i) => acc + v * weights[i], 0) /
    weights.reduce((a, b) => a + b, 0);
  return Math.round((weighted / max) * 100);
}

export async function POST(req: Request) {
  const { terms, country, lang } = (await req.json().catch(() => ({}))) as ReqBody;

  if (!terms || !Array.isArray(terms) || terms.length === 0) {
    return NextResponse.json(
      { error: "Please provide a non-empty 'terms' array." },
      { status: 400 }
    );
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const baseUrl = process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com";

  if (!login || !password) {
    return NextResponse.json(
      { error: "Server is missing DataForSEO credentials." },
      { status: 500 }
    );
  }

  const location_code = resolveLocationCode(country);
  const language_code = resolveLanguageCode(lang);

  // DataForSEO: /v3/keywords_data/google_ads/search_volume/live
  // Body is an array of tasks
  const payload = [
    {
      keywords: terms,
      location_code,
      language_code,
    },
  ];

  try {
    const res = await fetch(`${baseUrl}/v3/keywords_data/google_ads/search_volume/live`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(login, password),
      },
      body: JSON.stringify(payload),
      // edge runtime needs explicit cache behavior off
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "DataForSEO request failed", status: res.status, details: text },
        { status: 502 }
      );
    }

    const data = (await res.json()) as any;

    const items: {
      keyword: string;
      search_volume: number | null;
      cpc: number | null;
      competition: number | null;
      trend: number | null;
    }[] = [];

    const task = data?.tasks?.[0];
    const result = task?.result?.[0];
    const rows = result?.items ?? [];

    for (const row of rows) {
      items.push({
        keyword: row.keyword ?? "",
        search_volume: row.search_volume ?? null,
        cpc: row.cpc ?? null,
        competition: row.competition ?? null,
        trend: calcTrend(row.monthly_searches),
      });
    }

    return NextResponse.json({
      meta: {
        location_code,
        language_code,
        terms_count: terms.length,
      },
      items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected server error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
