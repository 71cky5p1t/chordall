// What the listen log says about how songs get played: in sittings
// ("sessions"), and which songs keep following each other ("chains").

import type { Listen, PlayedSong } from "@/components/HistoryProvider";

/** More than this between two songs and it's a new sitting. */
export const SESSION_GAP_MS = 45 * 60 * 1000;

export interface Session {
  start: number;
  end: number;
  songs: PlayedSong[]; // in the order played, repeats dropped
}

export function sessions(listens: Listen[], songs: PlayedSong[]): Session[] {
  const byKey = new Map(songs.map((s) => [s.key, s]));
  const out: Session[] = [];
  let cur: Listen[] = [];
  const flush = () => {
    const seen = new Set<string>();
    const list: PlayedSong[] = [];
    for (const l of cur) {
      const s = byKey.get(l.key);
      if (s && !seen.has(l.key)) {
        seen.add(l.key);
        list.push(s);
      }
    }
    if (list.length >= 2) out.push({ start: cur[0].at, end: cur[cur.length - 1].at, songs: list });
    cur = [];
  };
  for (const l of listens) {
    if (cur.length && l.at - cur[cur.length - 1].at > SESSION_GAP_MS) flush();
    cur.push(l);
  }
  if (cur.length) flush();
  return out.reverse(); // newest first
}

export interface Chain {
  from: PlayedSong;
  to: PlayedSong;
  times: number;
  lastAt: number;
}

/** Song pairs played one straight after the other, at least `min` times. */
export function chains(listens: Listen[], songs: PlayedSong[], min = 2): Chain[] {
  const byKey = new Map(songs.map((s) => [s.key, s]));
  const pairs = new Map<string, { from: string; to: string; times: number; lastAt: number }>();
  for (let i = 1; i < listens.length; i++) {
    const a = listens[i - 1];
    const b = listens[i];
    if (a.key === b.key || b.at - a.at > SESSION_GAP_MS) continue;
    const id = `${a.key}>${b.key}`;
    const p = pairs.get(id) ?? { from: a.key, to: b.key, times: 0, lastAt: 0 };
    p.times++;
    p.lastAt = b.at;
    pairs.set(id, p);
  }
  return [...pairs.values()]
    .filter((p) => p.times >= min && byKey.has(p.from) && byKey.has(p.to))
    .map((p) => ({ from: byKey.get(p.from)!, to: byKey.get(p.to)!, times: p.times, lastAt: p.lastAt }))
    .sort((a, b) => b.times - a.times || b.lastAt - a.lastAt);
}

/** Songs you've played right after this one, most often first. */
export function playedAfter(key: string, listens: Listen[], songs: PlayedSong[]): Chain[] {
  return chains(listens, songs, 1).filter((c) => c.from.key === key);
}

/** A history entry as a setlist song. */
export function asSetlistSong(s: PlayedSong) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { key, plays, firstAt, lastAt, moods, ...song } = s;
  return song;
}
