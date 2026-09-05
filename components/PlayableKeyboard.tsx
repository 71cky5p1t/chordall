"use client";

import { useRef, useState } from "react";
import { scalePitchClasses, noteName, type Mode } from "@/lib/music/key";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isBlack = (pc: number) => !WHITE_PCS.includes(((pc % 12) + 12) % 12);

// One shared AudioContext, created on first user tap (browsers require a gesture).
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function playMidi(midi: number) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.95);
}

/**
 * Interactive 2-octave keyboard for a key's scale. Scale notes are highlighted;
 * tapping any key plays its pitch. Used as the floating reference in perform mode.
 */
export function PlayableKeyboard({
  tonicPc,
  mode,
  preferFlat = false,
  octaves = 2,
}: {
  tonicPc: number;
  mode: Mode;
  preferFlat?: boolean;
  octaves?: number;
}) {
  const scale = new Set(scalePitchClasses(tonicPc, mode));
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Start on the white key at/below the tonic; span N octaves, end on a white key.
  let start = 48 + tonicPc;
  while (isBlack(start)) start--;
  let end = start + 12 * octaves + (tonicPc % 12 === 0 ? 0 : 1);
  while (isBlack(end)) end++;

  const whiteKeys: number[] = [];
  for (let m = start; m <= end; m++) if (!isBlack(m)) whiteKeys.push(m);

  const W = 30;
  const H = 74;
  const BW = 18;
  const BH = 46;
  const width = whiteKeys.length * W;
  const whiteIndex = (midi: number) => whiteKeys.indexOf(midi);
  const inScale = (m: number) => scale.has(((m % 12) + 12) % 12);

  const press = (m: number) => {
    playMidi(m);
    setPressed((prev) => new Set(prev).add(m));
    clearTimeout(timers.current[m]);
    timers.current[m] = setTimeout(() => {
      setPressed((prev) => {
        const n = new Set(prev);
        n.delete(m);
        return n;
      });
    }, 220);
  };

  const blackKeys = Array.from({ length: end - start + 1 }, (_, k) => start + k).filter(isBlack);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 -14 ${width} ${H + 14}`}
        width={width}
        height={H + 14}
        style={{ touchAction: "none" }}
        role="img"
        aria-label="playable scale keyboard"
      >
        {whiteKeys.map((m, i) => {
          const on = inScale(m);
          const down = pressed.has(m);
          return (
            <g key={`w${m}`}>
              <rect
                x={i * W}
                y={0}
                width={W - 1}
                height={H}
                rx={3}
                fill={down ? "#ffcf87" : on ? "var(--accent)" : "#f4f5f8"}
                stroke="#0c0d12"
                strokeWidth={0.6}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(m);
                }}
              />
              {on && (
                <text
                  x={i * W + (W - 1) / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#0c0d12"
                  fontFamily="var(--font-mono)"
                  pointerEvents="none"
                >
                  {noteName(m, preferFlat)}
                </text>
              )}
            </g>
          );
        })}
        {blackKeys.map((m) => {
          const leftWhite = whiteIndex(m - 1);
          if (leftWhite < 0) return null;
          const x = (leftWhite + 1) * W - BW / 2;
          const on = inScale(m);
          const down = pressed.has(m);
          return (
            <g key={`b${m}`}>
              <rect
                x={x}
                y={0}
                width={BW}
                height={BH}
                rx={2}
                fill={down ? "#ffcf87" : on ? "var(--accent)" : "#161821"}
                stroke="#0c0d12"
                strokeWidth={0.6}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(m);
                }}
              />
              {on && (
                <text
                  x={x + BW / 2}
                  y={-4}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="var(--accent)"
                  fontFamily="var(--font-mono)"
                  pointerEvents="none"
                >
                  {noteName(m, preferFlat)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
