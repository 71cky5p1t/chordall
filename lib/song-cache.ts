// Simple on-disk cache for fetched songs so we never hit a provider twice for
// the same tab. Stored as JSON files under .songcache/ (gitignored). Server-only.

import { promises as fs } from "fs";
import path from "path";
import type { FetchedSong } from "@/lib/providers/types";

// Configurable so it can point at a mounted Docker volume in production.
const CACHE_DIR = process.env.CHORDALL_CACHE_DIR || path.join(process.cwd(), ".songcache");

function keyFor(provider: string, id: string): string {
  const safe = `${provider}__${id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function readCachedSong(
  provider: string,
  id: string,
): Promise<FetchedSong | null> {
  if (!id) return null;
  try {
    const raw = await fs.readFile(keyFor(provider, id), "utf8");
    return JSON.parse(raw) as FetchedSong;
  } catch {
    return null;
  }
}

export async function writeCachedSong(song: FetchedSong): Promise<void> {
  if (!song.id) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(keyFor(song.provider, song.id), JSON.stringify(song), "utf8");
  } catch {
    /* caching is best-effort; ignore write failures */
  }
}
