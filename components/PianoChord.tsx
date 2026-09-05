"use client";

import { pianoVoicing } from "@/lib/music/chords";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isBlack = (pc: number) => !WHITE_PCS.includes(((pc % 12) + 12) % 12);

/** Small piano keyboard highlighting a chord's voicing. */
export function PianoChord({ chord, preferFlat = false }: { chord: string; preferFlat?: boolean }) {
  const voicing = pianoVoicing(chord, preferFlat);
  if (!voicing) return null;

  const active = new Set(voicing.midi);
  const min = Math.min(...voicing.midi);
  const max = Math.max(...voicing.midi);
  // Expand to whole octaves and give a little padding.
  let startMidi = min - 2;
  let endMidi = max + 2;
  while (isBlack(startMidi)) startMidi--;
  while (isBlack(endMidi)) endMidi++;

  const whiteKeys: number[] = [];
  for (let m = startMidi; m <= endMidi; m++) if (!isBlack(m)) whiteKeys.push(m);

  const W = 16;
  const H = 62;
  const BW = 10;
  const BH = 38;
  const width = whiteKeys.length * W;

  const whiteIndex = (midi: number) => whiteKeys.indexOf(midi);

  return (
    <div className="fadein">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width={width}
        height={H}
        className="block"
        role="img"
        aria-label={`${chord} piano voicing`}
      >
        {/* white keys */}
        {whiteKeys.map((m, i) => {
          const on = active.has(m);
          return (
            <rect
              key={`w${m}`}
              x={i * W}
              y={0}
              width={W - 1}
              height={H}
              rx={2}
              fill={on ? "var(--accent)" : "#f4f5f8"}
              stroke="#0c0d12"
              strokeWidth={0.5}
            />
          );
        })}
        {/* black keys */}
        {Array.from({ length: endMidi - startMidi + 1 }, (_, k) => startMidi + k)
          .filter(isBlack)
          .map((m) => {
            const leftWhite = whiteIndex(m - 1);
            if (leftWhite < 0) return null;
            const x = (leftWhite + 1) * W - BW / 2;
            const on = active.has(m);
            return (
              <rect
                key={`b${m}`}
                x={x}
                y={0}
                width={BW}
                height={BH}
                rx={1.5}
                fill={on ? "var(--accent)" : "#161821"}
                stroke="#0c0d12"
                strokeWidth={0.5}
              />
            );
          })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-text-dim">
        {voicing.names.map((n, i) => (
          <span key={i} className="tabular-nums">
            {n}
            <span className="text-text-faint">·{voicing.degrees[i]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
