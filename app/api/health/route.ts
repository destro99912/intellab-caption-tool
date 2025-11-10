import { NextResponse } from "next/server";

// Lightweight health endpoint for liveness/readiness checks.
// No external IO, no auth, and explicit no-store caching.
export const runtime = "edge";

export async function GET() {
  return new NextResponse(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
