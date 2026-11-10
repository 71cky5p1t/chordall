import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, createLowEffort, aiErrorText } from "@/lib/ai";
import { MOODS } from "@/lib/moods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SONGS = 60;

interface SongIn {
  key: string;
  title: string;
  artist: string;
}

/** Sort played songs into a fixed set of moods, so the same mood groups them. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { songs?: SongIn[] } | null;
  const songs = (body?.songs ?? [])
    .filter((s) => s && typeof s.key === "string" && typeof s.title === "string" && typeof s.artist === "string")
    .slice(0, MAX_SONGS);
  if (songs.length === 0) return NextResponse.json({ moods: {} });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Claude API key not configured. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 501 },
    );
  }

  const list = songs.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}`).join("\n");
  const allowed = new Set<string>(MOODS);
  try {
    const msg = await createLowEffort(new Anthropic(), {
      model: MODEL,
      max_tokens: 4000,
      system:
        "You sort songs by how they feel to play and hear. Use only these moods: " +
        MOODS.join(", ") +
        ". Give each song one or two that fit best, from what you know of the recording. " +
        'Respond with ONLY a JSON object mapping the song number to its moods, like {"1":["Mellow","Romantic"]}, no prose.',
      messages: [{ role: "user", content: list }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>) : {};
    const moods: Record<string, string[]> = {};
    songs.forEach((s, i) => {
      const got = parsed[String(i + 1)];
      const clean = Array.isArray(got) ? got.filter((m): m is string => allowed.has(m)).slice(0, 2) : [];
      if (clean.length) moods[s.key] = clean;
    });
    return NextResponse.json({ moods });
  } catch (e) {
    const err = e as { status?: number };
    console.error("[chordall ai] moods failed", { model: MODEL, status: err.status, message: aiErrorText(e) });
    // Not a 502: Cloudflare swaps those for its own page and hides this message.
    return NextResponse.json({ error: `Couldn’t sort moods: ${aiErrorText(e)}` }, { status: 424 });
  }
}
