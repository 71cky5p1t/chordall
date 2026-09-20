import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveByQuery } from "@/lib/resolve-song";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Default to Opus 5; override with CHORDALL_AI_MODEL (e.g. claude-haiku-4-5 to save cost).
const MODEL = process.env.CHORDALL_AI_MODEL || "claude-opus-5";

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

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Claude API key not configured. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 501 },
    );
  }

  let body: { mood?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const mood = (body.mood ?? "").trim();
  const count = Math.min(Math.max(body.count ?? 6, 2), 10);
  if (!mood) return NextResponse.json({ error: "missing mood" }, { status: 400 });

  const client = new Anthropic();

  let suggestions: Suggestion[] = [];
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      output_config: { effort: "low" },
      system:
        "You are a setlist curator for a musician who plays piano and guitar. " +
        "Given a mood or theme, choose real, well-known, widely-covered songs that are " +
        "easy to find chord charts for. Order them so the set flows well (energy, key, tempo). " +
        "Respond with ONLY a JSON array of objects like " +
        `[{"title":"Song","artist":"Artist"}], no prose, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Build a ${count}-song setlist for this mood/theme: "${mood}". Return only the JSON array.`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    suggestions = extractJsonArray(text).slice(0, count);
  } catch (e) {
    // Surface the real upstream error. NOTE: not a 502 — Cloudflare replaces
    // origin 502/504s with its own page, which hides the message we return.
    const err = e as { status?: number; message?: string; name?: string };
    console.error("[chordall ai] Claude request failed", { model: MODEL, status: err.status, name: err.name, message: err.message });
    const hint =
      err.status === 401 ? " (invalid API key)" :
      err.status === 404 ? ` (model "${MODEL}" not found / no access)` :
      err.status === 429 ? " (rate limited)" : "";
    return NextResponse.json(
      { error: `Claude request failed${hint}: ${err.message ?? String(e)}`, model: MODEL, status: err.status ?? null },
      { status: 424 },
    );
  }

  if (suggestions.length === 0) {
    return NextResponse.json({ error: "Claude returned no usable songs. Try rephrasing the mood." }, { status: 424 });
  }

  // Resolve each suggestion to a real chord chart (in parallel).
  const resolved = await Promise.all(
    suggestions.map(async (s) => {
      const item = await resolveByQuery(s.title, s.artist);
      return { suggestion: s, item };
    }),
  );

  const items = resolved.filter((r) => r.item).map((r) => r.item);
  const missing = resolved.filter((r) => !r.item).map((r) => r.suggestion);

  return NextResponse.json({ mood, items, missing });
}
