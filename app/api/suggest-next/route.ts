import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveByQuery } from "@/lib/resolve-song";
import { MODEL, createLowEffort } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_COUNTRY =
  "Hard rule: exclude true country music entirely — no Nashville/mainstream country, " +
  "honky-tonk, bro-country, or country artists.";

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
    return Array.isArray(arr)
      ? arr
          .filter((x) => x && typeof x.title === "string" && typeof x.artist === "string")
          .map((x) => ({ title: x.title.trim(), artist: x.artist.trim() }))
      : [];
  } catch {
    return [];
  }
}

/**
 * "More ideas" for Suggest-next: ask Claude for songs that flow well after the
 * current one (similar vibe/era, same or closely related key), excluding ones
 * already shown, then resolve each to a real chart with chords so the client
 * can compute the transition.
 */
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Claude API key not configured. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 501 },
    );
  }
  let body: { title?: string; artist?: string; key?: string; exclude?: string[]; allowCountry?: boolean; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const artist = (body.artist ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing title" }, { status: 400 });
  const key = (body.key ?? "").trim();
  const exclude = (body.exclude ?? []).filter((s) => typeof s === "string").slice(0, 60);
  const count = Math.min(Math.max(body.count ?? 6, 3), 8);

  const client = new Anthropic();
  let suggestions: Suggestion[] = [];
  try {
    const msg = await createLowEffort(client, {
      model: MODEL,
      max_tokens: 900,
      system:
        "You are a setlist curator for a pianist/guitarist playing live. Suggest real, " +
        "well-known songs that are easy to find chord charts for. " +
        (body.allowCountry ? "Any genre is welcome, country included. " : NO_COUNTRY + " ") +
        'Respond with ONLY a JSON array like [{"title":"Song","artist":"Artist"}], no prose.',
      messages: [
        {
          role: "user",
          content:
            `The current song is "${title}"${artist ? ` by ${artist}` : ""}${key ? ` (key of ${key})` : ""}. ` +
            `Suggest ${count + 2} songs that would flow naturally NEXT in a live set: similar mood, era and tempo, ` +
            `ideally in the same key or a closely related one (relative major/minor, or a fourth/fifth away). ` +
            `Variety of artists.` +
            (exclude.length ? ` Do NOT suggest any of these: ${exclude.join("; ")}.` : "") +
            " Return only the JSON array.",
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    suggestions = extractJsonArray(text);
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    console.error("[chordall ai] suggest-next failed", { model: MODEL, status: err.status, name: err.name, message: err.message });
    return NextResponse.json({ error: `Claude request failed: ${err.message ?? String(e)}`, model: MODEL }, { status: 424 });
  }

  // Drop anything the client already showed (case-insensitive title match), then
  // resolve in parallel and keep the first `count` that produced a real chart.
  const seen = new Set(exclude.map((s) => s.toLowerCase()));
  const fresh = suggestions.filter((s) => !seen.has(s.title.toLowerCase()) && s.title.toLowerCase() !== title.toLowerCase());
  const resolved = await Promise.all(fresh.map((s) => resolveByQuery(s.title, s.artist)));
  const items = resolved.filter((r): r is NonNullable<typeof r> => !!r).slice(0, count);
  if (items.length === 0) {
    return NextResponse.json({ error: "Couldn’t find charts for any suggestions — try again." }, { status: 424 });
  }
  return NextResponse.json({ items });
}
