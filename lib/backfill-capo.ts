interface SavedSong {
  provider: string;
  songId: string;
  url: string;
  capo?: number;
}

/**
 * Songs saved before capo was stored don't know theirs, so their key would
 * disagree with the sheet. Look each one up once, one at a time because the
 * source rejects parallel requests. A failure just retries on the next visit.
 */
export async function backfillCapo<T extends SavedSong>(
  songs: T[],
  signal: AbortSignal,
  found: (song: T, capo: number) => void,
) {
  for (const song of songs) {
    if (song.capo !== undefined) continue;
    const p = new URLSearchParams({ provider: song.provider, id: song.songId, url: song.url });
    try {
      const res = await fetch(`/api/song?${p.toString()}`, { signal });
      if (!res.ok) continue;
      const json = await res.json();
      if (signal.aborted) return;
      found(song, json.meta?.capo ?? 0);
    } catch {
      if (signal.aborted) return;
    }
  }
}
