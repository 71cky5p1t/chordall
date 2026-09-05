import { NextRequest, NextResponse } from "next/server";
import { fetchSong } from "@/lib/providers";
import { parseSong } from "@/lib/chordpro/parse";
import { detectKey } from "@/lib/music/key";
import { readCachedSong, writeCachedSong } from "@/lib/song-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const provider = sp.get("provider");
  const id = sp.get("id") ?? "";
  const url = sp.get("url") ?? "";
  if (!provider || (!id && !url)) {
    return NextResponse.json({ error: "missing provider/id/url" }, { status: 400 });
  }
  try {
    // Serve from the on-disk cache when we've fetched this tab before.
    let song = await readCachedSong(provider, id);
    let cached = true;
    if (!song) {
      song = await fetchSong(provider, id, url, req.signal);
      cached = false;
      await writeCachedSong(song);
    }
    const parsed = parseSong(song.content);
    const detected = detectKey(parsed.chords);
    return NextResponse.json({
      cached,
      meta: {
        provider: song.provider,
        id: song.id,
        url: song.url,
        title: song.title,
        artist: song.artist,
        key: song.key,
        capo: song.capo,
        tuning: song.tuning,
        difficulty: song.difficulty,
        versions: song.versions ?? [],
        currentVersion: song.currentVersion,
      },
      parsed,
      detectedKey: detected,
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }
}
