"use client";

import { scalePitchClasses, noteName, type Mode } from "@/lib/music/key";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isBlack = (pc: number) => !WHITE_PCS.includes(((pc % 12) + 12) % 12);

/**
 * One-octave keyboard from the tonic, highlighting the notes in the key's scale
 * so you can see at a glance which white/black keys belong to it.
 */
export function PianoScale({
  tonicPc,
  mode,
  preferFlat = false,
}: {
  tonicPc: number;
  mode: Mode;
  preferFlat?: boolean;
}) {
  const scale = new Set(scalePitchClasses(tonicPc, mode));
  // Begin on the white key at/below the tonic so a black-key tonic still has a
  // neighbour to anchor to, and end on a white key past the octave.
  let start = 60 + tonicPc;
  while (isBlack(start)) start--;
  let end = 60 + tonicPc + 12;
  while (isBlack(end)) end++;

  const whiteKeys: number[] = [];
  for (let m = start; m <= end; m++) if (!isBlack(m)) whiteKeys.push(m);

  const W = 15;
  const H = 54;
  const BW = 9;
  const BH = 33;
  const PAD = 8;
  const width = whiteKeys.length * W;
  const whiteIndex = (midi: number) => whiteKeys.indexOf(midi);

  const inScale = (m: number) => scale.has(((m % 12) + 12) % 12);

  return (
    <svg
      viewBox={`${-PAD} -13 ${width + PAD * 2} ${H + 27}`}
      width={width + PAD * 2}
      height={H + 27}
      className="block"
      role="img"
      aria-label="scale keyboard"
    >
      {whiteKeys.map((m, i) => {
        const on = inScale(m);
        return (
          <g key={`w${m}`}>
            <rect
              x={i * W}
              y={0}
              width={W - 1}
              height={H}
              rx={2}
              fill={on ? "var(--accent)" : "#f4f5f8"}
              stroke="#0c0d12"
              strokeWidth={0.5}
            />
            {on && (
              <text
                x={i * W + (W - 1) / 2}
                y={H + 11}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-dim)"
                fontFamily="var(--font-mono)"
              >
                {noteName(m, preferFlat)}
              </text>
            )}
          </g>
        );
      })}
      {Array.from({ length: end - start + 1 }, (_, k) => start + k)
        .filter(isBlack)
        .map((m) => {
          const leftWhite = whiteIndex(m - 1);
          if (leftWhite < 0) return null;
          const x = (leftWhite + 1) * W - BW / 2;
          const on = inScale(m);
          return (
            <g key={`b${m}`}>
              <rect
                x={x}
                y={0}
                width={BW}
                height={BH}
                rx={1.5}
                fill={on ? "var(--accent)" : "#161821"}
                stroke="#0c0d12"
                strokeWidth={0.5}
              />
              {on && (
                <text
                  x={x + BW / 2}
                  y={-4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--accent)"
                  fontFamily="var(--font-mono)"
                >
                  {noteName(m, preferFlat)}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
