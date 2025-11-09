import { NextResponse } from "next/server";

type ReqBody = {
  terms: string[];
  country?: string;   // "US", "AE", etc (we map to location_code outside or via a helper)
  lang?: string;      // "en", "ar", etc.
};

// Minimal location map. Expand as needed.
const LOCATION_CODES: Record<string, number> = {
  US: 2840,
  AE: 2784,
  GB: 2826,
  IN: 356,
  PK: 586,
  // add more if you need
};

export async function POST(req: Request) {
  try {
    const { terms, country = "US", lang = "en" } = (await req.json()) as ReqBody;

    if (!Array.isArray(terms) || terms.length === 0) {
      return NextResponse.json({ error: "terms must be a non-empty string array" }, { status: 400 });
    }

    const location_code = LOCATION_CODES[country] ?? LOCATION_CODES.US;

    // DataForSEO expects an array of tasks in the body
    const payload = [
      {
        keywords: terms,            // IMPORTANT: array of strings
        location_code,              // e.g., 2840 for US
        language_code: lang,        // "en"
        sort_by: "relevance",
      },
    ];

    const login = process.env.DATAFORSEO_LOGIN!;
    const password = process.env.DATAFORSEO_PASSWORD!;
    if (!login || !password) {
      return NextResponse.json({ error: "DataForSEO credentials missing" }, { status: 500 });
    }

    const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${login}:${password}`).toString("base64"),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // ---- Robust extraction ----
    const task = data?.tasks?.[0];
    const result0 = task?.result?.[0];

    // Some responses return an array in `items`, some return a single object.
    let rawItems: any[] = [];
    if (Array.isArray(result0?.items)) {
      rawItems = result0.items;
    } else if (result0 && typeof result0 === "object") {
      rawItems = [result0];
    }

    // Normalize to what the UI expects
    const items = rawItems.map((k) => ({
      keyword: k.keyword ?? "",
      search_volume: Number(k.search_volume ?? 0),
      cpc: Number(k.cpc ?? 0),
      competition: k.competition ?? null,
      monthly_searches: Array.isArray(k.monthly_searches) ? k.monthly_searches : [],
    }));

    const response = {
      meta: {
        language_code: result0?.language_code ?? lang,
        location_code: result0?.location_code ?? location_code,
        terms_count: terms.length,
      },
      items,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("seo-metrics error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
