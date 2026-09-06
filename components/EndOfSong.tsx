"use client";

import { useEffect, useRef, useState } from "react";
import type { Transition } from "@/lib/music/transition";
import type { SetlistItem } from "@/lib/setlist-types";
import { ChordDiagram } from "./ChordDiagram";

/**
 * Bottom-of-song panel: shows the bridge into the next song, a Next button, and
 * an optional auto-advance countdown that starts when the panel scrolls into view.
 * `onGo` is generic — the player navigates, perform mode advances in place.
 */
export function EndOfSong({
  next,
  transition,
  autoAdvance,
  seconds,
  onGo,
  label = "Next song →",
}: {
  next: SetlistItem;
  transition: Transition;
  autoAdvance: boolean;
  seconds: number;
  onGo: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!autoAdvance) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setCountdown((c) => (c === null ? seconds : c));
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoAdvance, seconds]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      onGo();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, onGo]);

  return (
    <div ref={ref} className="mt-10 rounded-2xl border border-accent-3/40 bg-accent-3/5 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-accent-3">
        ⇄ Transition into the next song
      </div>
      <div className="mt-1 text-lg font-semibold">
        {next.title} <span className="text-text-dim">— {next.artist}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {transition.steps.map((s, k) => (
          <div key={k} className="flex flex-col items-start gap-1">
            <span
              className={`rounded-md px-2 py-1 font-mono text-base font-bold ${
                k === transition.steps.length - 1 ? "bg-accent-3 text-bg" : "bg-bg-elev-2 text-accent"
              }`}
            >
              {s.chord}
            </span>
            <ChordDiagram chord={s.chord} />
            <span className="max-w-[9rem] text-[10px] leading-tight text-text-faint">{s.role}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-text-dim">{transition.description}</p>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={onGo} className="rounded-lg bg-accent-3 px-4 py-2 font-semibold text-bg hover:brightness-110">
          {label}
        </button>
        {countdown !== null && (
          <span className="text-sm text-text-dim">
            auto-advancing in {countdown}s ·{" "}
            <button onClick={() => setCountdown(null)} className="underline">cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}
