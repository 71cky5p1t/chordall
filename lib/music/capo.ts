// A capo chart's chords are guitar shapes: the song really sounds `capo`
// semitones higher. Pianists want those real chords (the original key);
// guitarists keep the shapes they'd actually finger.

import { transposeChord } from "./chords";
import { flatKey, noteName, type DetectedKey } from "./key";
import type { Instrument } from "@/components/SettingsProvider";

/** Semitones to add so a chart reads in the original key on this instrument. */
export function capoShift(capo: number | undefined, instrument: Instrument): number {
  return instrument === "piano" && capo && capo > 0 ? capo : 0;
}

interface PlayableSong {
  chords: string[];
  capo?: number;
  detectedKey?: DetectedKey | null;
}

/** A saved song's chords as they'll be shown when it opens. */
export function playedChords(song: PlayableSong, defaultTranspose: number, instrument: Instrument): string[] {
  const by = defaultTranspose + capoShift(song.capo, instrument);
  return song.chords.map((c) => transposeChord(c, by, false));
}

/** A saved song's key as it'll be shown when it opens. */
export function playedKeyLabel(song: PlayableSong, defaultTranspose: number, instrument: Instrument): string | null {
  const key = song.detectedKey;
  if (!key) return null;
  const by = defaultTranspose + capoShift(song.capo, instrument);
  const pc = ((key.tonicPc + by) % 12 + 12) % 12;
  return `${noteName(pc, flatKey(pc, key.mode))}${key.mode === "minor" ? "m" : ""}`;
}
