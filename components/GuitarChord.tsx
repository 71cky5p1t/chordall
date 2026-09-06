"use client";

import { useEffect, useState } from "react";
import { parseChord } from "@/lib/music/chords";

// chords-db key names, indexed by pitch class.
const PC_TO_KEY = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Map our chord-quality tokens to chords-db suffix names.
const QUAL_TO_SUFFIX: Record<string, string> = {
  "": "major", maj: "major", M: "major",
  m: "minor", min: "minor", "-": "minor",
  dim: "dim", dim7: "dim7",
  aug: "aug", "+": "aug", aug7: "aug7", "7#5": "aug7",
  sus2: "sus2", sus4: "sus4", sus: "sus4",
  "7sus4": "7sus4", "7sus2": "sus2", "9sus4": "7sus4",
  "6": "6", m6: "m6", min6: "m6", "69": "69", "6/9": "69",
  "7": "7", "7b5": "7b5", "7b9": "7b9", "7#9": "7#9",
  maj7: "maj7", M7: "maj7", maj9: "maj9", maj13: "maj13",
  m7: "m7", min7: "m7", "-7": "m7", m7b5: "m7b5", "ø": "m7b5", "ø7": "m7b5",
  mMaj7: "mmaj7", mM7: "mmaj7",
  "9": "9", m9: "m9", min9: "m9",
  add9: "add9", madd9: "madd9",
  "11": "11", m11: "m11", "13": "13", add11: "11",
  "5": "major",
};

interface Position {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
}
interface GuitarDb {
  chords: Record<string, { suffix: string; positions: Position[] }[]>;
}

// Lazy-load the (~1MB) chord DB once, only when guitar mode is actually used.
let dbPromise: Promise<GuitarDb> | null = null;
function loadDb(): Promise<GuitarDb> {
  if (!dbPromise) {
    dbPromise = import("@tombatossals/chords-db/lib/guitar.json").then(
      (m) => (m.default ?? m) as unknown as GuitarDb,
    );
  }
  return dbPromise;
}

function lookup(db: GuitarDb, chord: string): Position | null {
  const p = parseChord(chord);
  if (!p.valid) return null;
  const key = PC_TO_KEY[p.rootPc];
  const entries = db.chords[key];
  if (!entries) return null;
  const wantMinor = p.intervals.includes(3) && !p.intervals.includes(4);
  const suffix = QUAL_TO_SUFFIX[p.quality] ?? (wantMinor ? "minor" : "major");
  const found =
    entries.find((e) => e.suffix === suffix) ??
    entries.find((e) => e.suffix === (wantMinor ? "minor" : "major"));
  return found?.positions?.[0] ?? null;
}

/** SVG guitar chord fingering diagram. */
export function GuitarChord({ chord }: { chord: string }) {
  const [db, setDb] = useState<GuitarDb | null>(null);
  useEffect(() => {
    let alive = true;
    loadDb().then((d) => alive && setDb(d));
    return () => {
      alive = false;
    };
  }, []);

  if (!db) return <div className="h-[112px] w-[100px] animate-pulse rounded bg-bg-elev-2" />;
  const pos = lookup(db, chord);
  if (!pos) return <div className="text-[11px] text-text-faint">no shape</div>;

  const STRINGS = 6;
  const ROWS = 5;
  const SX = 15; // string spacing
  const FY = 16; // fret spacing
  const PADX = 12;
  const TOP = 22; // space above nut for open/mute markers
  const width = PADX * 2 + (STRINGS - 1) * SX;
  const nutY = TOP;
  const showNut = pos.baseFret === 1;

  const stringX = (i: number) => PADX + i * SX;
  const fretY = (f: number) => nutY + (f - 0.5) * FY;

  // Barre spans: for each barre fret, the min..max string pressed there.
  const barres = pos.barres.map((bf) => {
    const idxs = pos.frets.map((f, i) => (f === bf ? i : -1)).filter((i) => i >= 0);
    return { fret: bf, from: Math.min(...idxs), to: Math.max(...idxs) };
  });

  return (
    <svg
      viewBox={`0 0 ${width + (showNut ? 0 : 14)} ${TOP + ROWS * FY + 6}`}
      width={width + (showNut ? 0 : 14)}
      height={TOP + ROWS * FY + 6}
      className="block"
      role="img"
      aria-label={`${chord} guitar chord`}
    >
      {/* base-fret label for higher-position chords */}
      {!showNut && (
        <text x={0} y={fretY(1) + 3} fontSize="10" fill="var(--text-dim)" fontFamily="var(--font-mono)">
          {pos.baseFret}fr
        </text>
      )}
      {/* fret lines */}
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <line
          key={`f${r}`}
          x1={stringX(0)}
          y1={nutY + r * FY}
          x2={stringX(STRINGS - 1)}
          y2={nutY + r * FY}
          stroke={r === 0 && showNut ? "#e7e9f0" : "#3a4056"}
          strokeWidth={r === 0 && showNut ? 3 : 1}
        />
      ))}
      {/* strings */}
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={`s${i}`} x1={stringX(i)} y1={nutY} x2={stringX(i)} y2={nutY + ROWS * FY} stroke="#3a4056" strokeWidth={1} />
      ))}
      {/* barres */}
      {barres.map((b, i) => (
        <rect
          key={`b${i}`}
          x={stringX(b.from) - 4}
          y={fretY(b.fret) - 5}
          width={stringX(b.to) - stringX(b.from) + 8}
          height={10}
          rx={5}
          fill="var(--accent)"
        />
      ))}
      {/* open / muted markers + finger dots */}
      {pos.frets.map((f, i) => {
        const x = stringX(i);
        if (f === -1) {
          return (
            <text key={`m${i}`} x={x} y={14} textAnchor="middle" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font-mono)">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={`o${i}`} cx={x} cy={10} r={4} fill="none" stroke="var(--text-dim)" strokeWidth={1.3} />;
        }
        const isBarre = barres.some((b) => b.fret === f && i >= b.from && i <= b.to);
        const finger = pos.fingers[i];
        return (
          <g key={`d${i}`}>
            {!isBarre && <circle cx={x} cy={fretY(f)} r={5.5} fill="var(--accent)" />}
            {finger > 0 && (
              <text x={x} y={fretY(f) + 3.2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#0c0d12" fontFamily="var(--font-mono)">
                {finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
