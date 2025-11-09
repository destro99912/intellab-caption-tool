// app/api/tools/hashtags/route.ts
import { NextResponse } from "next/server";

type Platform = "instagram" | "tiktok" | "youtube" | "twitter" | "linkedin" | "facebook";
type Tone = "friendly" | "bold" | "informative" | "playful" | "luxury" | "urgent";

type RequestBody = {
  topic: string;
  platform?: Platform;
  tone?: Tone;
  maxHashtags?: number;         // default by platform
  includeEmojis?: boolean;      // default true for most platforms
  keywords?: string[];          // optional explicit keywords
};

type Result = {
  topic: string;
  platform: Platform;
  tone: Tone;
  caption: string;
  hashtags: string[];
  variations: {
    caption: string;
    hashtags: string[];
  }[];
};

const PLATFORM_LIMITS: Record<Platform, number> = {
  instagram: 25,  // hard cap (UI can enforce 25, IG allows up to 30)
  tiktok: 20,
  youtube: 12,    // for YT description area, keep it modest
  twitter: 6,     // X tends to do better with fewer
  linkedin: 10,
  facebook: 15,
};

const PLATFORM_STYLES: Record<Platform, { preferEmojis: boolean; addLineBreaks: boolean }> = {
  instagram: { preferEmojis: true, addLineBreaks: true },
  tiktok:    { preferEmojis: true, addLineBreaks: true },
  youtube:   { preferEmojis: false, addLineBreaks: true },
  twitter:   { preferEmojis: true, addLineBreaks: false },
  linkedin:  { preferEmojis: false, addLineBreaks: false },
  facebook:  { preferEmojis: true, addLineBreaks: true },
};

const TONE_EMOJIS: Record<Tone, string[]> = {
  friendly:    ["😊","✨","🤝","👍","🌟"],
  bold:        ["🔥","🚀","⚡","💥","🏆"],
  informative: ["🧠","📌","📘","🔍","✅"],
  playful:     ["😄","🎉","🥳","🤩","😸"],
  luxury:      ["💎","✨","🏛️","🥂","🖤"],
  urgent:      ["⏰","⚠️","📣","🛎️","❗"],
};

const CTA_FRAGMENTS = [
  "Save this for later",
  "Tag a friend who needs this",
  "Follow for more like this",
  "What do you think?",
  "Drop your thoughts below",
  "Share this with your team",
  "Need a part 2?",
];

const HOOKS = [
  "Quick tip:",
  "Pro move:",
  "Real talk:",
  "Heads up:",
  "Don’t miss:",
  "If you’re into this, read on:",
];

function toSlugWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

function titleCase(words: string[]): string {
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function buildKeywordSet(topic: string, keywords?: string[]): string[] {
  const base = toSlugWords(topic);
  const extra = (keywords ?? []).flatMap(k => toSlugWords(k));
  const all = dedupe([...base, ...extra]);
  // expand slight variants
  const expanded = all.flatMap(w => {
    const variants = [w];
    if (w.endsWith("ing")) variants.push(w.slice(0, -3));
    if (!w.endsWith("s")) variants.push(w + "s");
    if (!w.endsWith("er")) variants.push(w + "er");
    return variants;
  });
  return dedupe([...all, ...expanded]).slice(0, 25);
}

function platformBoilerplate(platform: Platform, words: string[]): string[] {
  // Some generic discovery terms depending on the platform & common social niches
  const common = [
    "tips", "tricks", "guide", "howto", "lifehacks",
    "viral", "trending", "mustsee", "daily", "shorts",
  ];
  const brandy = ["brand", "business", "creator", "growth", "marketing"];

  switch (platform) {
    case "instagram":
      return [...common, "reels", "instagood", "explore", ...brandy];
    case "tiktok":
      return [...common, "foryou", "fyp", "learnontiktok", ...brandy];
    case "youtube":
      return [...common, "youtubeshorts", "creator", "howto", ...brandy];
    case "twitter":
      return [...common, "buildinpublic", "thread", "x", ...brandy];
    case "linkedin":
      return [...common, "careers", "leadership", "insights", "b2b", ...brandy];
    case "facebook":
      return [...common, "community", "share", "follow", ...brandy];
  }
}

function toHashtag(word: string): string {
  const clean = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!clean) return "";
  return "#" + clean;
}

function scoreHashtag(h: string, platform: Platform): number {
  // Simple heuristic: shorter & more general tags get slightly higher baseline,
  // platform-specific favorites get a bump.
  let score = 0;
  const len = h.length;
  if (len <= 8) score += 2;
  if (len <= 12) score += 1;

  const popular = [
    "#reels","#foryou","#fyp","#viral","#trending","#howto",
    "#youtubeshorts","#instagood","#marketing","#growth"
  ];
  if (popular.includes(h)) score += 2;

  if (platform === "twitter" && len <= 12) score += 1;
  if (platform === "linkedin" && /(#b2b|#leadership|#insights)/i.test(h)) score += 1;

  return score;
}

function generateHashtags(topic: string, platform: Platform, maxHashtags: number, keywords?: string[]): string[] {
  const words = buildKeywordSet(topic, keywords);
  const boiler = platformBoilerplate(platform, words);

  const raw = dedupe([
    ...words,
    ...boiler,
    ...words.flatMap(w => [`${w}tips`, `${w}guide`, `${w}hacks`]),
  ]);

  const tags = raw
    .map(toHashtag)
    .filter(Boolean)
    .map(h => h.toLowerCase());

  // Deduplicate, score and sort
  const scored = dedupe(tags).map(h => ({ h, s: scoreHashtag(h, platform) }));
  scored.sort((a, b) => b.s - a.s);

  // Ensure topic-primary tags are kept near the top
  const topicRoot = toSlugWords(topic).slice(0, 2).map(toHashtag);
  const prioritized = [
    ...topicRoot.filter(Boolean),
    ...scored.map(x => x.h).filter(h => !topicRoot.includes(h)),
  ];

  return prioritized.slice(0, maxHashtags);
}

function pick<T>(arr: T[], n: number): T[] {
  const c = arr.slice();
  const out: T[] = [];
  while (c.length && out.length < n) {
    const idx = Math.floor(Math.random() * c.length);
    out.push(c.splice(idx, 1)[0]);
  }
  return out;
}

function buildCaption(topic: string, tone: Tone, platform: Platform, includeEmojis: boolean, hashtags: string[]): string {
  const words = toSlugWords(topic);
  const title = titleCase(words);
  const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
  const cta = CTA_FRAGMENTS[Math.floor(Math.random() * CTA_FRAGMENTS.length)];

  const emojis = includeEmojis ? pick(TONE_EMOJIS[tone], 2).join(" ") + " " : "";

  const lines: string[] = [];
  lines.push(`${emojis}${hook} ${title}`);
  
  // Brief value line (keep it generic but useful)
  const valueLineByTone: Record<Tone, string> = {
    friendly:    `Here’s a quick breakdown to help you out.`,
    bold:        `Use this now to level up fast.`,
    informative: `Key points summarized for easy action.`,
    playful:     `This one’s fun *and* useful.`,
    luxury:      `Elevate your taste with these essentials.`,
    urgent:      `Act now—this won’t last long.`,
  };
  lines.push(valueLineByTone[tone]);

  const style = PLATFORM_STYLES[platform];
  const joiner = style.addLineBreaks ? "\n\n" : " ";

  // Don’t cram all hashtags into caption for platforms where separate block looks cleaner
  const hashBlock = hashtags.join(" ");
  lines.push(cta);

  return lines.join(joiner) + (hashBlock ? `${joiner}${hashBlock}` : "");
}

function sanitizePlatform(p?: string): Platform {
  const v = (p ?? "instagram").toLowerCase();
  if (["instagram","tiktok","youtube","twitter","linkedin","facebook"].includes(v)) {
    return v as Platform;
  }
  return "instagram";
}

function sanitizeTone(t?: string): Tone {
  const v = (t ?? "friendly").toLowerCase();
  if (["friendly","bold","informative","playful","luxury","urgent"].includes(v)) {
    return v as Tone;
  }
  return "friendly";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const platform = sanitizePlatform(body.platform);
    const tone = sanitizeTone(body.tone);
    const limit = Math.max(
      1,
      Math.min(
        body.maxHashtags ?? PLATFORM_LIMITS[platform],
        PLATFORM_LIMITS[platform]
      )
    );

    const includeEmojis =
      body.includeEmojis ?? PLATFORM_STYLES[platform].preferEmojis;

    const hashtags = generateHashtags(body.topic, platform, limit, body.keywords);
    const caption = buildCaption(body.topic, tone, platform, includeEmojis, hashtags);

    // Create 2 lightweight variations (shuffle + tweak CTA)
    const variations = Array.from({ length: 2 }).map(() => {
      const shuffled = hashtags.slice().sort(() => Math.random() - 0.5);
      const altCaption = buildCaption(body.topic, tone, platform, includeEmojis, shuffled);
      return { caption: altCaption, hashtags: shuffled };
    });

    const result: Result = {
      topic: body.topic,
      platform,
      tone,
      caption,
      hashtags,
      variations,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Hashtag API error:", err);
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}
