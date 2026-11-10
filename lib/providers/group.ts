// Collapse a flat result list into one entry per song. Sources list every
// transcription as its own row, so a search for one song is otherwise that song
// fifty times over.

export interface SongGroup<T> {
  key: string;
  /** The row a tap opens: the first in input order, so callers rank beforehand. */
  best: T;
  /** Every transcription, `best` first, in input order. */
  versions: T[];
}

/**
 * Case, accents and punctuation vary between transcriptions of the same song
 * ("Don't Stop Believin'" / "Dont Stop Believin"). Keeps letters of any script,
 * so non-Latin titles don't normalise away to nothing and collide.
 */
function norm(s: string): string {
  const key = s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return key || s.trim().toLowerCase();
}

/** One key per song, whichever transcription of it. */
export function songKey(title: string, artist: string): string {
  return `${norm(title)}|${norm(artist)}`;
}

export function groupSongs<T extends { title: string; artist: string }>(
  rows: T[],
): SongGroup<T>[] {
  const groups = new Map<string, SongGroup<T>>();
  for (const row of rows) {
    const key = songKey(row.title, row.artist);
    const group = groups.get(key);
    if (group) group.versions.push(row);
    else groups.set(key, { key, best: row, versions: [row] });
  }
  return [...groups.values()];
}
