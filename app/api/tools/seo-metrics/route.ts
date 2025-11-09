import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CORS headers (harmless for same-origin) */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Minimal OPTIONS to satisfy any preflight */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Minimal POST to prove the route is wired */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    return new NextResponse(
      JSON.stringify({
        ok: true,
        message: "POST reached /api/tools/seo-metrics",
        received: body,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      }
    );
  } catch (err: any) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}
