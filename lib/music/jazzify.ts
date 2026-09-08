// "Jazzify": reharmonise a song's chords with tasteful jazz voicings.
//
// Three passes, all keyed to the detected key so substitutions are functional
// rather than random:
//   1. Secondary dominants — when a chord repeats and then moves, the repeat
//      becomes V7 of the next chord (C C F -> C C7 F).
//   2. Extensions — plain triads become 7ths/9ths by scale degree
//      (I->maj7, ii->m7, V->7/9, vii°->m7b5, minor-key V->7b9 ...).
//   3. Walking bass — inversions that make the bass step smoothly
//      (V7/b7 -> Imaj7/3, and I/3 -> IV).
// Chords the writer already made rich (7ths, 9ths, slash bass) are left alone.

import { parseChord, SHARP_NOTES, FLAT_NOTES } from "./chords";
import { flatKey, type DetectedKey } from "./key";
import type { ParsedSong, Segment } from "@/lib/chordpro/parse";

const PLAIN = new Set(["", "maj", "M", "m", "min", "-", "dim", "5"]);

interface Info {
  valid: boolean;
  root: string; // original spelling, e.g. "F#"
  rootPc: number;
  quality: string;
  bassPc?: number;
  isMajor: boolean;
  isMinor: boolean;
  isDim: boolean;
  plain: boolean;
}

function analyze(sym: string): Info {
  const p = parseChord(sym);
  if (!p.valid) {
    return { valid: false, root: "", rootPc: -1, quality: "", isMajor: false, isMinor: false, isDim: false, plain: false };
  }
  const iv = p.intervals;
  const isDim = p.quality.startsWith("dim") || (iv.includes(3) && iv.includes(6) && !iv.includes(7));
  const isMinor = !isDim && iv.includes(3) && !iv.includes(4);
  const isMajor = !isDim && !isMinor; // includes power chords
  return {
    valid: true,
    root: p.root,
    rootPc: p.rootPc,
    quality: p.quality,
    bassPc: p.bassPc,
    isMajor,
    isMinor,
    isDim,
    plain: PLAIN.has(p.quality),
  };
}

const nameOf = (pc: number, flat: boolean) => (flat ? FLAT_NOTES : SHARP_NOTES)[((pc % 12) + 12) % 12];

/** Pick the extension for a plain triad by its degree in the key. */
function extension(info: Info, key: DetectedKey, next: Info | null): string {
  const deg = ((info.rootPc - key.tonicPc) % 12 + 12) % 12;
  const nextIsTonic = !!next?.valid && ((next.rootPc - key.tonicPc) % 12 + 12) % 12 === 0;

  if (key.mode === "major") {
    if (info.isDim) return deg === 11 ? "m7b5" : "dim7";
    if (info.isMinor) return "m7";
    // major-type
    switch (deg) {
      case 0: return "maj7";
      case 5: return "maj7";
      case 7: return nextIsTonic ? "9" : "7";
      case 8: return "maj7"; // bVI
      default: return "7"; // bVII, secondary dominants, etc.
    }
  }
  // minor key
  if (info.isDim) return deg === 2 ? "m7b5" : "dim7";
  if (info.isMinor) return "m7";
  switch (deg) {
    case 3: return "maj7"; // bIII
    case 7: return nextIsTonic ? "7b9" : "7"; // V
    case 8: return "maj7"; // bVI
    default: return "7"; // bVII etc.
  }
}

interface Out {
  root: string;
  quality: string;
  bassPc?: number;
  rootPc: number;
  changed: boolean;
}

function build(o: Out, flat: boolean): string {
  return o.root + o.quality + (o.bassPc !== undefined ? "/" + nameOf(o.bassPc, flat) : "");
}

/** Reharmonise an ordered chord list. Returns new symbols (same length). */
export function jazzifyChords(chords: string[], key: DetectedKey | null): string[] {
  const infos = chords.map(analyze);
  const flat = key ? flatKey(key.tonicPc, key.mode) : false;
  const out: Out[] = infos.map((i, idx) => ({
    root: i.root,
    quality: i.quality,
    bassPc: i.bassPc,
    rootPc: i.rootPc,
    changed: false,
    ...(i.valid ? {} : { root: chords[idx] }),
  }));

  // Pass 1: secondary dominants in repeated slots.
  for (let i = 0; i + 2 < infos.length; i++) {
    const a = infos[i], b = infos[i + 1], c = infos[i + 2];
    if (!a.valid || !b.valid || !c.valid) continue;
    const same = a.rootPc === b.rootPc && a.quality === b.quality && a.bassPc === b.bassPc;
    if (same && c.rootPc !== b.rootPc && b.plain) {
      const domPc = (c.rootPc + 7) % 12;
      out[i + 1] = { root: nameOf(domPc, flat), quality: "7", rootPc: domPc, changed: true };
      infos[i + 1] = { ...analyze(out[i + 1].root + "7") };
    }
  }

  // Pass 2: extensions.
  if (key) {
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (!info.valid || !info.plain || out[i].changed) continue;
      out[i].quality = extension(info, key, infos[i + 1] ?? null);
      out[i].changed = true;
    }
  } else {
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (!info.valid || !info.plain) continue;
      out[i].quality = info.isDim ? "m7b5" : info.isMinor ? "m7" : "maj7";
      out[i].changed = true;
    }
  }

  // Pass 3: walking bass (only where the writer didn't already choose a bass).
  if (key) {
    const deg = (pc: number) => ((pc - key.tonicPc) % 12 + 12) % 12;
    for (let i = 0; i + 1 < out.length; i++) {
      const cur = infos[i], nxt = infos[i + 1];
      if (!cur.valid || !nxt.valid) continue;
      const curIsV = deg(cur.rootPc) === 7 && cur.isMajor;
      const nxtIsI = deg(nxt.rootPc) === 0;
      const curIsI = deg(cur.rootPc) === 0 && cur.isMajor;
      const nxtIsIV = deg(nxt.rootPc) === 5 && nxt.isMajor;

      if (curIsV && nxtIsI && cur.bassPc === undefined && nxt.bassPc === undefined) {
        // V7/b7 -> I/3 : bass falls a half step (G7/F -> Cmaj7/E)
        if (/^(7|9|13)/.test(out[i].quality) || out[i].quality === "7b9") out[i].quality = "7";
        out[i].bassPc = (cur.rootPc + 10) % 12;
        out[i + 1].bassPc = (nxt.rootPc + (nxt.isMinor ? 3 : 4)) % 12;
      } else if (curIsI && nxtIsIV && cur.bassPc === undefined && out[i].bassPc === undefined) {
        // I/3 -> IV : bass walks up a half step (Cmaj7/E -> Fmaj7)
        out[i].bassPc = (cur.rootPc + 4) % 12;
      }
    }
  }

  return out.map((o, i) => (infos[i].valid ? build(o, flat) : chords[i]));
}

/** Return a copy of the song with every chord reharmonised. */
export function jazzifySong(song: ParsedSong, key: DetectedKey | null): ParsedSong {
  // Flatten chord-bearing segments in reading order so passes can see context.
  const refs: { s: number; l: number; g: number }[] = [];
  const symbols: string[] = [];
  song.sections.forEach((sec, s) =>
    sec.lines.forEach((line, l) =>
      line.segments.forEach((seg, g) => {
        if (seg.chord) {
          refs.push({ s, l, g });
          symbols.push(seg.chord);
        }
      }),
    ),
  );

  const jazzed = jazzifyChords(symbols, key);
  const lookup = new Map<string, string>();
  refs.forEach((r, i) => lookup.set(`${r.s}-${r.l}-${r.g}`, jazzed[i]));

  const sections = song.sections.map((sec, s) => ({
    ...sec,
    lines: sec.lines.map((line, l) => ({
      ...line,
      segments: line.segments.map((seg, g): Segment => {
        const nc = lookup.get(`${s}-${l}-${g}`);
        return nc ? { ...seg, chord: nc } : seg;
      }),
    })),
  }));

  return { sections, chords: jazzed };
}
