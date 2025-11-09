// app/api/tools/hashtags/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge"; // optional, works on Node too

type Body = {
  caption?: string;
  count?: number;
  country?: string;
  lang?: string;
  platform?: string;
};

export async function POST(req: Request) {
  let body: Body | null = null;

  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const caption = body?.caption?.trim();
  const count =
    typeof body?.count === "number" && body.count > 0 && body.count <= 50
      ? Math.floor(body.count)
      : 20;

  if (!caption) {
    return NextResponse.json(
      { error: "Invalid request payload: `caption` is required." },
      { status: 400 }
    );
  }

  // --- Simple baseline hashtag generator (placeholder) ---
  // 1) tokenize caption
  const base = caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // 2) build tags from words + a few generic boosters
  const boosters = ["trending", "viral", "instagood", "reels", "explore"];
  const candidates = Array.from(new Set([...base, ...boosters]))
    .slice(0, 80)
    .map((w) => `#${w.replace(/^#+/, "")}`);

  // pad with bigrams if short
  if (candidates.length < count) {
    for (let i = 0; i < base.length - 1 && candidates.length < count; i++) {
      const bi = `#${base[i]}${base[i + 1]}`;
      if (!candidates.includes(bi)) candidates.push(bi);
    }
  }

  const hashtags = candidates.slice(0, count);

  return NextResponse.json({
    hashtags,
    meta: {
      count: hashtags.length,
      country: body?.country ?? "GLB",
      lang: body?.lang ?? "en",
      platform: body?.platform ?? "instagram",
    },
  });
}
