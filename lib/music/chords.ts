// Core music-theory engine: chord parsing, transposition, and piano voicings.
// Kept dependency-free and pure so it runs on both server and client.

export const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  // enharmonic edge cases people actually type
  "E#": 5, "B#": 0, Cb: 11, Fb: 4,
};

// Interval formulas (semitones from the root) for each chord quality.
// Ordered roughly longest-suffix-first at match time so "maj7" beats "maj".
const QUALITIES: Record<string, number[]> = {
  "": [0, 4, 7],
  "maj": [0, 4, 7],
  "M": [0, 4, 7],
  "m": [0, 3, 7],
  "min": [0, 3, 7],
  "-": [0, 3, 7],
  "5": [0, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "+": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
  "sus": [0, 5, 7],
  "6": [0, 4, 7, 9],
  "m6": [0, 3, 7, 9],
  "min6": [0, 3, 7, 9],
  "69": [0, 4, 7, 9, 14],
  "6/9": [0, 4, 7, 9, 14],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "M7": [0, 4, 7, 11],
  "maj9": [0, 4, 7, 11, 14],
  "m7": [0, 3, 7, 10],
  "min7": [0, 3, 7, 10],
  "-7": [0, 3, 7, 10],
  "mMaj7": [0, 3, 7, 11],
  "mM7": [0, 3, 7, 11],
  "dim7": [0, 3, 6, 9],
  "m7b5": [0, 3, 6, 10],
  "ø": [0, 3, 6, 10],
  "ø7": [0, 3, 6, 10],
  "aug7": [0, 4, 8, 10],
  "7#5": [0, 4, 8, 10],
  "7b5": [0, 4, 6, 10],
  "9": [0, 4, 7, 10, 14],
  "m9": [0, 3, 7, 10, 14],
  "min9": [0, 3, 7, 10, 14],
  "add9": [0, 4, 7, 14],
  "madd9": [0, 3, 7, 14],
  "7sus4": [0, 5, 7, 10],
  "7sus2": [0, 2, 7, 10],
  "9sus4": [0, 5, 7, 10, 14],
  "11": [0, 7, 10, 14, 17],
  "m11": [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
  "m13": [0, 3, 7, 10, 14, 21],
  "maj13": [0, 4, 7, 11, 14, 21],
  "7#9": [0, 4, 7, 10, 15],
  "7b9": [0, 4, 7, 10, 13],
  "add11": [0, 4, 7, 17],
};

// Interval short-names for showing what notes/tones a chord contains.
const DEGREE_NAMES: Record<number, string> = {
  0: "R", 1: "b9", 2: "9", 3: "b3", 4: "3", 5: "11", 6: "b5",
  7: "5", 8: "#5", 9: "6", 10: "b7", 11: "7", 13: "b9", 14: "9",
  15: "#9", 17: "11", 21: "13",
};

export interface ParsedChord {
  raw: string;
  root: string;       // normalized note name, e.g. "F#"
  rootPc: number;     // pitch class 0-11
  quality: string;    // matched suffix key
  bass?: string;      // slash bass note name
  bassPc?: number;
  intervals: number[];
  valid: boolean;
}

const ROOT_RE = /^([A-Ga-g])([#b♯♭]?)/;

function normalizeAccidental(a: string): string {
  return a.replace("♯", "#").replace("♭", "b");
}

/** Parse a chord symbol like "F#m7b5/A" into structured data. */
export function parseChord(raw: string): ParsedChord {
  const input = raw.trim();
  const empty: ParsedChord = {
    raw, root: "", rootPc: -1, quality: "", intervals: [], valid: false,
  };
  const m = ROOT_RE.exec(input);
  if (!m) return empty;

  const root = m[1].toUpperCase() + normalizeAccidental(m[2] || "");
  const rootPc = NOTE_TO_PC[root];
  if (rootPc === undefined) return empty;

  let rest = input.slice(m[0].length);

  // Slash bass
  let bass: string | undefined;
  let bassPc: number | undefined;
  const slash = rest.split("/");
  if (slash.length === 2) {
    const bm = ROOT_RE.exec(slash[1]);
    if (bm) {
      const bn = bm[1].toUpperCase() + normalizeAccidental(bm[2] || "");
      if (NOTE_TO_PC[bn] !== undefined) {
        bass = bn;
        bassPc = NOTE_TO_PC[bn];
        rest = slash[0];
      }
    }
  }

  // Match the longest known quality suffix.
  const suffix = rest.replace("♭", "b").replace("♯", "#");
  let bestKey = "";
  for (const key of Object.keys(QUALITIES)) {
    if (suffix === key && key.length >= bestKey.length) bestKey = key;
  }
  // If no exact match, try prefix match (handles trailing junk gracefully).
  if (bestKey === "" && suffix !== "") {
    for (const key of Object.keys(QUALITIES)) {
      if (key !== "" && suffix.startsWith(key) && key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }

  const intervals = QUALITIES[bestKey] ?? QUALITIES[""];
  return {
    raw, root, rootPc, quality: bestKey, bass, bassPc,
    intervals, valid: true,
  };
}

/** Is this token plausibly a chord (vs. a lyric word)? */
export function isChord(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  const p = parseChord(t);
  if (!p.valid) return false;
  // guard against lyric words like "Be", "Add", "A" that happen to start with a note letter
  const after = t.replace(ROOT_RE, "");
  const bassPart = after.split("/")[0];
  // Accept if suffix is empty (bare note) or a recognized quality token.
  return bassPart === "" || bassPart in QUALITIES || /^[m0-9+#b°ø/susadimjMg-]+$/i.test(bassPart);
}

function pcToName(pc: number, preferFlat: boolean): string {
  const n = ((pc % 12) + 12) % 12;
  return preferFlat ? FLAT_NOTES[n] : SHARP_NOTES[n];
}

/** Transpose a single chord symbol by N semitones, preserving suffix + slash. */
export function transposeChord(raw: string, semitones: number, preferFlat = false): string {
  const p = parseChord(raw);
  if (!p.valid) return raw;
  const newRoot = pcToName(p.rootPc + semitones, preferFlat);
  const suffix = p.quality;
  let out = newRoot + suffix;
  if (p.bassPc !== undefined) out += "/" + pcToName(p.bassPc + semitones, preferFlat);
  return out;
}

export interface PianoVoicing {
  /** MIDI-ish note numbers within one span, root-position, for drawing on a keyboard. */
  midi: number[];
  /** Note names in order. */
  names: string[];
  /** Interval degree labels (R, 3, 5, b7 ...). */
  degrees: string[];
  bass?: string;
}

/**
 * Build a simple, playable close-voiced piano chord starting near middle C (60).
 * Returns absolute note numbers so a keyboard component can highlight keys.
 */
export function pianoVoicing(raw: string, preferFlat = false): PianoVoicing | null {
  const p = parseChord(raw);
  if (!p.valid) return null;
  const base = 60 + p.rootPc; // root at/above middle C
  const midi: number[] = [];
  const names: string[] = [];
  const degrees: string[] = [];

  if (p.bassPc !== undefined) {
    const b = 48 + p.bassPc; // bass an octave below
    midi.push(b);
    names.push(pcToName(p.bassPc, preferFlat));
    degrees.push("bass");
  }

  for (const iv of p.intervals) {
    const note = base + iv;
    midi.push(note);
    names.push(pcToName(note, preferFlat));
    degrees.push(DEGREE_NAMES[iv] ?? String(iv));
  }
  return { midi, names, degrees, bass: p.bass };
}
