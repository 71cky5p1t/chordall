// Transition generator: bridge one song's ending key into the next song's key
// with a short, musically-sensible connecting progression. This is the feature
// that makes Chordall more than a chord viewer.

import { parseChord } from "./chords";
import { detectKey, diatonicChords, noteName, flatKey, type DetectedKey, type Mode } from "./key";

export interface TransitionStep {
  chord: string;
  role: string; // e.g. "pivot (IV of A / I of B)", "V7 of B", "→ next song"
}

export interface Transition {
  fromKey: string;
  toKey: string;
  relationship: string;
  description: string;
  steps: TransitionStep[];
  /** Just the chords to play, in order. */
  chords: string[];
}

const INTERVAL_NAMES: Record<number, string> = {
  0: "same tonic",
  1: "up a half step",
  2: "up a whole step",
  3: "up a minor third",
  4: "up a major third",
  5: "up a fourth",
  6: "a tritone away",
  7: "up a fifth",
  8: "down a major third",
  9: "down a minor third",
  10: "down a whole step",
  11: "down a half step",
};

function keyLabel(k: DetectedKey): string {
  return `${k.tonic}${k.mode === "minor" ? " minor" : " major"}`;
}

/** Dominant-seventh chord a fifth above the given tonic (the V7 that pulls to it). */
function dominantOf(tonicPc: number, mode: Mode): { chord: string; root: number } {
  const domPc = (tonicPc + 7) % 12;
  const flat = flatKey(tonicPc, mode);
  return { chord: noteName(domPc, flat) + "7", root: domPc };
}

function tonicChord(k: DetectedKey): string {
  const flat = flatKey(k.tonicPc, k.mode);
  return noteName(k.tonicPc, flat) + (k.mode === "minor" ? "m" : "");
}

/** Find a chord diatonic to both keys to use as a smooth pivot. */
function findPivot(from: DetectedKey, to: DetectedKey): string | null {
  const fromChords = diatonicChords(from.tonicPc, from.mode);
  const toSet = new Set(diatonicChords(to.tonicPc, to.mode).map((c) => normRootQual(c)));
  // Prefer subdominant/predominant flavors (index 3=IV, 1=ii, 5=vi) for a graceful pivot.
  const order = [3, 1, 5, 2, 0, 4, 6];
  for (const i of order) {
    const c = fromChords[i];
    if (toSet.has(normRootQual(c))) return c;
  }
  return null;
}

function normRootQual(sym: string): string {
  const p = parseChord(sym);
  return p.valid ? `${p.rootPc}:${p.quality || "maj"}` : sym;
}

export interface GenerateArgs {
  fromKey: DetectedKey;
  toKey: DetectedKey;
  /** The literal first chord of the next song, if known — we aim to land here. */
  toFirstChord?: string;
}

export function generateTransition({ fromKey, toKey, toFirstChord }: GenerateArgs): Transition {
  const semis = ((toKey.tonicPc - fromKey.tonicPc) % 12 + 12) % 12;
  const relationship = describeRelationship(fromKey, toKey, semis);
  const landing = toFirstChord && parseChord(toFirstChord).valid ? toFirstChord : tonicChord(toKey);

  const steps: TransitionStep[] = [];

  if (fromKey.tonicPc === toKey.tonicPc && fromKey.mode === toKey.mode) {
    // Same key: a simple ii–V turnaround refreshes the ear without modulating.
    const dia = diatonicChords(fromKey.tonicPc, fromKey.mode);
    steps.push({ chord: dia[1], role: "ii — sets up the turnaround" });
    steps.push({ chord: dominantOf(toKey.tonicPc, toKey.mode).chord, role: "V7 — pulls home" });
  } else {
    const pivot = findPivot(fromKey, toKey);
    if (pivot) {
      steps.push({
        chord: pivot,
        role: `pivot — shared by ${fromKey.tonic} and ${toKey.tonic}`,
      });
    }
    const dom = dominantOf(toKey.tonicPc, toKey.mode);
    steps.push({ chord: dom.chord, role: `V7 of ${toKey.tonic} — leans into the new key` });
  }

  steps.push({ chord: landing, role: "→ downbeat of the next song" });

  const description = buildDescription(fromKey, toKey, relationship, steps);

  return {
    fromKey: keyLabel(fromKey),
    toKey: keyLabel(toKey),
    relationship,
    description,
    steps,
    chords: steps.map((s) => s.chord),
  };
}

function describeRelationship(from: DetectedKey, to: DetectedKey, semis: number): string {
  if (from.tonicPc === to.tonicPc) {
    if (from.mode === to.mode) return "same key";
    return from.mode === "major" ? "parallel minor" : "parallel major";
  }
  // relative major/minor
  if (from.mode === "major" && to.mode === "minor" && semis === 9) return "relative minor";
  if (from.mode === "minor" && to.mode === "major" && semis === 3) return "relative major";
  return INTERVAL_NAMES[semis] ?? `${semis} semitones up`;
}

function buildDescription(
  from: DetectedKey,
  to: DetectedKey,
  relationship: string,
  steps: TransitionStep[],
): string {
  const play = steps.map((s) => s.chord).slice(0, -1).join(" → ");
  const target = steps[steps.length - 1].chord;
  return (
    `Going from ${keyLabel(from)} to ${keyLabel(to)} (${relationship}). ` +
    `When the first song resolves, play ${play} to slide into ${target}, ` +
    `then start the next song on the downbeat.`
  );
}

/**
 * Convenience: derive keys directly from two songs' chord lists and bridge them.
 */
export function transitionBetweenSongs(
  fromChords: string[],
  toChords: string[],
): Transition | null {
  const fromKey = detectKey(fromChords);
  const toKey = detectKey(toChords);
  if (!fromKey || !toKey) return null;
  const toFirstChord = toChords.find((c) => parseChord(c).valid);
  return generateTransition({ fromKey, toKey, toFirstChord });
}
