// "Jazzify": reharmonise a song's chords with tasteful jazz voicings, in five
// escalating degrees. Everything is keyed to the detected key so substitutions
// are functional rather than random. Chords the writer already made rich
// (7ths, 9ths, slash bass) are left alone at every level.
//
//   1 Mild      plain triads -> 7ths by scale degree (I maj7, ii m7, V 7, vii° m7b5)
//   2 Warm      + secondary dominants in repeated-chord slots (C C F -> C C7 F)
//   3 Smooth    + walking-bass inversions (G7/F -> Cmaj7/E, Cmaj7/E -> Fmaj7)
//   4 Rich      + 9ths and 13ths (Imaj9, iim9, V13 into the tonic)
//   5 Full jazz + tritone substitutions on V->I (G7 -> Db7 -> C) and altered
//                secondary dominants (7b9 into minor targets)

import { parseChord, SHARP_NOTES, FLAT_NOTES } from "./chords";
import { flatKey, type DetectedKey } from "./key";
import type { ParsedSong, Segment } from "@/lib/chordpro/parse";

export const JAZZ_LEVELS = ["Base", "Mild", "Warm", "Smooth", "Rich", "Full jazz"] as const;
export const MAX_JAZZ = 5;

interface Cfg {
  sevenths: boolean;
  secondaryDominants: boolean;
  walkingBass: boolean;
  ninths: boolean;
  tritoneSubs: boolean;
  altDominants: boolean;
}

function cfgFor(level: number): Cfg {
  const l = Math.max(0, Math.min(MAX_JAZZ, level));
  return {
    sevenths: l >= 1,
    secondaryDominants: l >= 2,
    walkingBass: l >= 3,
    ninths: l >= 4,
    tritoneSubs: l >= 5,
    altDominants: l >= 5,
  };
}

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

/** Pick the 7th-extension for a plain triad by its degree in the key. */
function seventh(info: Info, key: DetectedKey, next: Info | null): string {
  const deg = ((info.rootPc - key.tonicPc) % 12 + 12) % 12;
  const nextIsTonic = !!next?.valid && ((next.rootPc - key.tonicPc) % 12 + 12) % 12 === 0;

  if (key.mode === "major") {
    if (info.isDim) return deg === 11 ? "m7b5" : "dim7";
    if (info.isMinor) return "m7";
    switch (deg) {
      case 0: return "maj7";
      case 5: return "maj7";
      case 8: return "maj7"; // bVI
      default: return "7"; // V, bVII, secondary dominants, etc.
    }
  }
  if (info.isDim) return deg === 2 ? "m7b5" : "dim7";
  if (info.isMinor) return "m7";
  switch (deg) {
    case 3: return "maj7"; // bIII
    case 8: return "maj7"; // bVI
    default: return "7"; // V, bVII, etc.
  }
}

/**
 * Level 4+: lift 7ths to 9ths. A V resolving home becomes a 13th in major
 * keys, or the classic 7b9 in minor keys.
 */
function ninth(q: string, nextIsTonic: boolean, minorKey: boolean): string {
  switch (q) {
    case "maj7": return "maj9";
    case "m7": return "m9";
    case "7": return nextIsTonic ? (minorKey ? "7b9" : "13") : "9";
    case "9": return "13";
    default: return q; // m7b5, dim7 stay
  }
}

interface Out {
  root: string;
  quality: string;
  bassPc?: number;
  rootPc: number;
  changed: boolean;
  secondary?: boolean;
  targetMinor?: boolean;
}

function build(o: Out, flat: boolean): string {
  return o.root + o.quality + (o.bassPc !== undefined ? "/" + nameOf(o.bassPc, flat) : "");
}

/** Reharmonise an ordered chord list at the given level. Returns new symbols (same length). */
export function jazzifyChords(chords: string[], key: DetectedKey | null, level = 3): string[] {
  const cfg = cfgFor(level);
  if (level <= 0) return chords.slice();

  const infos = chords.map(analyze);
  const flat = key ? flatKey(key.tonicPc, key.mode) : false;
  const out: Out[] = infos.map((i, idx) => ({
    root: i.valid ? i.root : chords[idx],
    quality: i.quality,
    bassPc: i.bassPc,
    rootPc: i.rootPc,
    changed: false,
  }));
  const deg = (pc: number) => (key ? ((pc - key.tonicPc) % 12 + 12) % 12 : -1);

  // Pass 1: secondary dominants in repeated slots.
  if (cfg.secondaryDominants) {
    for (let i = 0; i + 2 < infos.length; i++) {
      const a = infos[i], b = infos[i + 1], c = infos[i + 2];
      if (!a.valid || !b.valid || !c.valid) continue;
      const same = a.rootPc === b.rootPc && a.quality === b.quality && a.bassPc === b.bassPc;
      if (same && c.rootPc !== b.rootPc && b.plain) {
        const domPc = (c.rootPc + 7) % 12;
        out[i + 1] = { root: nameOf(domPc, flat), quality: "7", rootPc: domPc, changed: true, secondary: true, targetMinor: c.isMinor };
        infos[i + 1] = analyze(out[i + 1].root + "7");
      }
    }
  }

  // Pass 2: 7ths (and 9ths at level 4+).
  if (cfg.sevenths) {
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (!info.valid) continue;
      const nextIsTonic = !!infos[i + 1]?.valid && deg(infos[i + 1].rootPc) === 0;
      if (out[i].secondary) {
        // Level 5: colour the secondary dominant by where it's going.
        if (cfg.altDominants) out[i].quality = out[i].targetMinor ? "7b9" : "9";
        continue;
      }
      if (!info.plain) continue;
      let q = key ? seventh(info, key, infos[i + 1] ?? null) : info.isDim ? "m7b5" : info.isMinor ? "m7" : "maj7";
      if (cfg.ninths) q = ninth(q, nextIsTonic, key?.mode === "minor");
      out[i].quality = q;
      out[i].changed = true;
    }
  }

  // Pass 3: V->I treatment — tritone sub (level 5) or walking bass (level 3+),
  // plus I/3 -> IV. Only where the writer didn't already choose a bass.
  if (key && (cfg.walkingBass || cfg.tritoneSubs)) {
    for (let i = 0; i + 1 < out.length; i++) {
      const cur = infos[i], nxt = infos[i + 1];
      if (!cur.valid || !nxt.valid) continue;
      const curIsV = deg(cur.rootPc) === 7 && cur.isMajor && !out[i].secondary;
      const nxtIsI = deg(nxt.rootPc) === 0;
      const curIsI = deg(cur.rootPc) === 0 && cur.isMajor;
      const nxtIsIV = deg(nxt.rootPc) === 5 && nxt.isMajor;

      if (curIsV && nxtIsI && cur.bassPc === undefined) {
        if (cfg.tritoneSubs) {
          // G7 -> Db7 -> C : chromatic bass, no inversion needed.
          const subPc = (cur.rootPc + 6) % 12;
          out[i] = { root: nameOf(subPc, true), quality: cfg.ninths ? "9" : "7", rootPc: subPc, changed: true };
        } else if (cfg.walkingBass && nxt.bassPc === undefined) {
          // V7/b7 -> I/3 : bass falls a half step (G7/F -> Cmaj7/E)
          out[i].quality = cfg.ninths ? "9" : "7";
          out[i].bassPc = (cur.rootPc + 10) % 12;
          out[i + 1].bassPc = (nxt.rootPc + (nxt.isMinor ? 3 : 4)) % 12;
        }
      } else if (cfg.walkingBass && curIsI && nxtIsIV && cur.bassPc === undefined && out[i].bassPc === undefined) {
        // I/3 -> IV : bass walks up a half step (Cmaj7/E -> Fmaj7)
        out[i].bassPc = (cur.rootPc + 4) % 12;
      }
    }
  }

  return out.map((o, i) => (infos[i].valid ? build(o, flat) : chords[i]));
}

/** Return a copy of the song with every chord reharmonised at `level` (0 = unchanged). */
export function jazzifySong(song: ParsedSong, key: DetectedKey | null, level = 3): ParsedSong {
  if (level <= 0) return song;

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

  const jazzed = jazzifyChords(symbols, key, level);
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
