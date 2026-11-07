"use client";

import { clamp, SPEED_MAX, SPEED_MIN } from "./SettingsProvider";

const STEP = 6;

/** Floating auto-scroll controls, shared by the player and perform mode. */
export function ScrollDock({
  playing,
  speed,
  onToggle,
  onSpeed,
  onRewind,
}: {
  playing: boolean;
  speed: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onRewind: () => void;
}) {
  const bump = (delta: number) => onSpeed(clamp(speed + delta, SPEED_MIN, SPEED_MAX));
  return (
    <div className="tap-zone pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border-strong bg-bg-elev-2/90 p-1 shadow-lg backdrop-blur">
        <button type="button" onClick={() => bump(-STEP)} disabled={speed <= SPEED_MIN} aria-label="Scroll slower" className="dock-btn disabled:opacity-30">
          −
        </button>
        <span className="w-7 text-center font-mono text-xs text-text-dim tabular-nums" aria-label={`Speed ${speed}`}>
          {speed}
        </span>
        <button type="button" onClick={() => bump(STEP)} disabled={speed >= SPEED_MAX} aria-label="Scroll faster" className="dock-btn disabled:opacity-30">
          +
        </button>
        <button type="button" onClick={onRewind} aria-label="Rewind half a page" className="dock-btn">
          ↑
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? "Pause auto-scroll" : "Start auto-scroll"}
          className="dock-btn gap-1.5 bg-accent px-4 text-bg active:brightness-90"
        >
          {playing ? "❚❚" : "▶"}
          <span className="text-sm">{playing ? "Pause" : "Scroll"}</span>
        </button>
      </div>
    </div>
  );
}
