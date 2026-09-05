// Key detection + diatonic helpers, used for transpose defaults and transitions.

import { parseChord, SHARP_NOTES, FLAT_NOTES } from "./chords";

export type Mode = "major" | "minor";

export interface DetectedKey {
  tonicPc: number;
  tonic: string;
  mode: Mode;
  confidence: number; // 0..1 relative correlation strength
}

// Krumhansl-Schmuckler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(hist: number[], profile: number[], shift: number): number {
  const rotated = profile.map((_, i) => profile[(i - shift + 12) % 12]);
  const meanH = hist.reduce((a, b) => a + b, 0) / 12;
  const meanP = rotated.reduce((a, b) => a + b, 0) / 12;
  let num = 0, dh = 0, dp = 0;
  for (let i = 0; i < 12; i++) {
    const a = hist[i] - meanH;
    const b = rotated[i] - meanP;
    num += a * b;
    dh += a * a;
    dp += b * b;
  }
  const denom = Math.sqrt(dh * dp);
  return denom === 0 ? 0 : num / denom;
}

/** Estimate the key from a sequence of chord symbols. */
export function detectKey(chordSymbols: string[]): DetectedKey | null {
  const hist = new Array(12).fill(0);
  let counted = 0;

  chordSymbols.forEach((sym, idx) => {
    const p = parseChord(sym);
    if (!p.valid) return;
    counted++;
    // Weight root and bass more; first/last chords of a song matter more.
    const positional = idx === 0 || idx === chordSymbols.length - 1 ? 2 : 1;
    hist[p.rootPc] += 3 * positional;
    for (const iv of p.intervals) hist[(p.rootPc + iv) % 12] += 1 * positional;
    if (p.bassPc !== undefined) hist[p.bassPc] += 1.5 * positional;
  });

  if (counted === 0) return null;

  let best: DetectedKey | null = null;
  const scores: number[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as Mode[]) {
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const score = correlate(hist, profile, tonic);
      scores.push(score);
      if (!best || score > best.confidence) {
        best = { tonicPc: tonic, tonic: "", mode, confidence: score };
      }
    }
  }
  if (!best) return null;

  const preferFlat = flatKey(best.tonicPc, best.mode);
  best.tonic = (preferFlat ? FLAT_NOTES : SHARP_NOTES)[best.tonicPc];
  // normalize confidence to 0..1 against spread of scores
  const min = Math.min(...scores), max = Math.max(...scores);
  best.confidence = max === min ? 0.5 : (best.confidence - min) / (max - min);
  return best;
}

// Keys conventionally written with flats.
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db
const FLAT_MINOR = new Set([2, 7, 0, 5, 10]); // Dm, Gm, Cm, Fm, Bbm
export function flatKey(tonicPc: number, mode: Mode): boolean {
  return mode === "major" ? FLAT_MAJOR.has(tonicPc) : FLAT_MINOR.has(tonicPc);
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_QUALITIES = ["", "m", "m", "", "", "m", "dim"];
const MINOR_QUALITIES = ["m", "dim", "", "m", "m", "", ""];

/** The seven diatonic triads of a key, as chord symbols. */
export function diatonicChords(tonicPc: number, mode: Mode): string[] {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const quals = mode === "major" ? MAJOR_QUALITIES : MINOR_QUALITIES;
  const flat = flatKey(tonicPc, mode);
  const names = flat ? FLAT_NOTES : SHARP_NOTES;
  return scale.map((deg, i) => names[(tonicPc + deg) % 12] + quals[i]);
}

export function noteName(pc: number, preferFlat = false): string {
  return (preferFlat ? FLAT_NOTES : SHARP_NOTES)[((pc % 12) + 12) % 12];
}

/** Pitch classes making up the key's scale, tonic first. */
export function scalePitchClasses(tonicPc: number, mode: Mode): number[] {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  return scale.map((d) => (tonicPc + d) % 12);
}
