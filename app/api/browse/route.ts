import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { findChartLink } from "@/lib/resolve-song";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.CHORDALL_AI_MODEL || "claude-opus-5";

// The user never wants true country in auto-suggestions.
const NO_COUNTRY =
  "Hard rule: exclude true country music entirely — no Nashville/mainstream country, " +
  "honky-tonk, bro-country, or country artists. Pop, rock, soul, folk-pop, indie, " +
  "electronic, musical-theatre and singer-songwriter material are all welcome.";

const CATEGORIES: Record<string, string> = {
  musicals: "beloved songs and ballads from stage and screen musicals (Broadway, West End, and movie musicals)",
  "1950s": "widely-loved popular songs originally released in the 1950s",
  "1960s": "widely-loved popular songs originally released in the 1960s",
  "1970s": "widely-loved popular songs originally released in the 1970s",
  "1980s": "widely-loved popular songs originally released in the 1980s",
  "1990s": "widely-loved popular songs originally released in the 1990s",
  "2000s": "widely-loved popular songs originally released in the 2000s",
};

interface Suggestion {
  title: string;
  artist: string;
}

function extractJsonArray(text: string): Suggestion[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.title === "string" && typeof x.artist === "string")
      .map((x) => ({ title: x.title.trim(), artist: x.artist.trim() }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? "";
  const desc = CATEGORIES[category];
  if (!desc) return NextResponse.json({ error: "unknown category" }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Claude API key not configured. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 501 },
    );
  }

  const client = new Anthropic();
  let suggestions: Suggestion[] = [];
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      output_config: { effort: "low" },
      system:
        "You are a music curator for a pianist/guitarist. Suggest real, famous songs " +
        "that are easy to find chord charts for. " +
        NO_COUNTRY +
        ' Respond with ONLY a JSON array like [{"title":"Song","artist":"Artist"}], no prose.',
      messages: [
        { role: "user", content: `Suggest 12 ${desc}. Variety of artists. Return only the JSON array.` },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    suggestions = extractJsonArray(text).slice(0, 12);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: `Claude request failed: ${err.message ?? String(e)}` }, { status: 502 });
  }

  if (suggestions.length === 0) {
    return NextResponse.json({ error: "No songs came back. Try again." }, { status: 502 });
  }

  const resolved = await Promise.all(
    suggestions.map(async (s) => ({ suggestion: s, link: await findChartLink(s.title, s.artist) })),
  );
  const items = resolved.filter((r) => r.link).map((r) => r.link);

  return NextResponse.json({ category, items });
}
