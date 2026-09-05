// Server helper: turn a title/artist into a ready-to-play setlist item
// (with chords + detected key), reusing the on-disk cache. Used by the AI
// setlist generator so it can hand back songs the transition engine can chew on.

import { searchAll, fetchSong } from "@/lib/providers";
import type { SearchResult } from "@/lib/providers/types";
import { parseSong } from "@/lib/chordpro/parse";
import { detectKey } from "@/lib/music/key";
import { readCachedSong, writeCachedSong } from "@/lib/song-cache";

const CHORD_TYPES = new Set(["Chords", "Ukulele Chords", "Piano"]);

export interface ResolvedSong {
  provider: string;
  songId: string;
  url: string;
  title: string;
  artist: string;
  chords: string[];
  detectedKey: ReturnType<typeof detectKey>;
  sourceKey?: string;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pick the best chord chart for a title/artist from search results. */
function pickBest(results: SearchResult[], title: string, artist: string): SearchResult | null {
  const wantArtist = norm(artist);
  const scored = results
    .filter((r) => CHORD_TYPES.has(r.type ?? ""))
    .map((r) => {
      let score = (r.votes ?? 0) * (r.rating ?? 0);
      if (wantArtist && norm(r.artist).includes(wantArtist)) score *= 3;
      if (norm(r.title) === norm(title)) score *= 1.5;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.r ?? null;
}

export async function resolveSong(
  provider: string,
  id: string,
  url: string,
): Promise<ResolvedSong | null> {
  let song = await readCachedSong(provider, id);
  if (!song) {
    try {
      song = await fetchSong(provider, id, url);
      await writeCachedSong(song);
    } catch {
      return null;
    }
  }
  const parsed = parseSong(song.content);
  if (parsed.chords.length === 0) return null;
  return {
    provider: song.provider,
    songId: song.id,
    url: song.url,
    title: song.title,
    artist: song.artist,
    chords: parsed.chords,
    detectedKey: detectKey(parsed.chords),
    sourceKey: song.key,
  };
}

/** Search by title/artist, then resolve the best matching chord chart. */
export async function resolveByQuery(title: string, artist: string): Promise<ResolvedSong | null> {
  const query = artist ? `${title} ${artist}` : title;
  const { results } = await searchAll(query);
  const best = pickBest(results, title, artist);
  if (!best) return null;
  return resolveSong(best.provider, best.id, best.url);
}

export interface ChartLink {
  provider: string;
  id: string;
  url: string;
  title: string;
  artist: string;
}

/**
 * Lightweight resolve: just find the best chord chart's link (search only, no
 * content fetch) so the player can load it on click. Used for browse categories.
 */
export async function findChartLink(title: string, artist: string): Promise<ChartLink | null> {
  const query = artist ? `${title} ${artist}` : title;
  const { results } = await searchAll(query);
  const best = pickBest(results, title, artist);
  if (!best) return null;
  return { provider: best.provider, id: best.id, url: best.url, title: best.title, artist: best.artist };
}
