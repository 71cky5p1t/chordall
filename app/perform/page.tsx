"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ParsedSong } from "@/lib/chordpro/parse";
import type { DetectedKey, Mode } from "@/lib/music/key";
import { flatKey, noteName } from "@/lib/music/key";
import { transposeChord } from "@/lib/music/chords";
import { transitionBetweenSongs } from "@/lib/music/transition";
import { ChordSheet } from "@/components/ChordSheet";
import { EndOfSong } from "@/components/EndOfSong";
import { PlayableKeyboard } from "@/components/PlayableKeyboard";
import { useAutoScroll } from "@/components/use-auto-scroll";
import { animateScrollBy } from "@/lib/scroll";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";

interface SongResponse {
  parsed: ParsedSong;
  detectedKey: DetectedKey | null;
  meta: { key?: string; capo?: number };
}

export default function PerformPage() {
  const { items } = useSetlist();
  const { settings } = useSettings();

  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<SongResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(settings.defaultTranspose);
  const [textNudge, setTextNudge] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(28);
  const [showKeys, setShowKeys] = useState(false);
  const appliedFor = useRef<number>(-1);

  useAutoScroll(playing, speed);

  const current = items[idx];

  // Load the current song whenever the index changes.
  useEffect(() => {
    if (!current) return;
    const ctrl = new AbortController();
    const p = new URLSearchParams({ provider: current.provider, id: current.songId, url: current.url });
    setData(null);
    setError(null);
    window.scrollTo(0, 0);
    fetch(`/api/song?${p.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "failed to load");
        setData(json);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
  }, [current]);

  // Apply the default transpose once per song (after settings have hydrated).
  useEffect(() => {
    if (data && appliedFor.current !== idx) {
      appliedFor.current = idx;
      setSemitones(settings.defaultTranspose);
    }
  }, [data, idx, settings.defaultTranspose]);

  const keyInfo = useMemo(() => {
    const k = data?.detectedKey;
    if (!k) return null;
    const pc = ((k.tonicPc + semitones) % 12 + 12) % 12;
    const preferFlat = flatKey(pc, k.mode);
    return { tonicPc: pc, preferFlat, label: `${noteName(pc, preferFlat)}${k.mode === "minor" ? "m" : ""}`, mode: k.mode as Mode };
  }, [data, semitones]);
  const preferFlat = keyInfo?.preferFlat ?? semitones < 0;

  const effectiveChords = useMemo(
    () => (data ? data.parsed.chords.map((c) => transposeChord(c, semitones, preferFlat)) : []),
    [data, semitones, preferFlat],
  );

  const next = items[idx + 1] ?? null;
  const endTransition =
    next && effectiveChords.length
      ? transitionBetweenSongs(
          effectiveChords,
          next.chords.map((c) => transposeChord(c, settings.defaultTranspose, false)),
        )
      : null;

  const fontSize = Math.max(12, Math.round(17 * settings.fontScale) + textNudge);

  const go = (to: number) => {
    if (to < 0 || to >= items.length) return;
    setPlaying(false);
    setIdx(to);
  };
  const rewindHalf = () => {
    const wasPlaying = playing;
    setPlaying(false);
    animateScrollBy(-Math.round(window.innerHeight / 2)).then(() => wasPlaying && setPlaying(true));
  };
  const bumpSpeed = (d: number) => {
    setPlaying(true);
    setSpeed((s) => Math.min(90, Math.max(8, s + d)));
  };

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Nothing to perform yet</h1>
        <p className="mt-2 text-text-dim">Add songs to your setlist first.</p>
        <Link href="/setlist" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-bg">
          Go to setlist
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Performance top bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
          <Link href="/setlist" className="rounded-lg bg-bg-elev-2 px-3 py-1.5 font-medium hover:bg-bg-elev" aria-label="Exit performance">
            ✕ Exit
          </Link>
          <span className="font-mono text-text-faint tabular-nums">
            {idx + 1}/{items.length}
          </span>
          <div className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{current?.title}</span>
            <span className="text-text-dim"> — {current?.artist}</span>
          </div>
          <button
            onClick={() => setShowKeys((s) => !s)}
            disabled={!keyInfo}
            title="Show a playable keyboard for this key"
            className={`rounded-lg border px-2.5 py-1 font-mono font-semibold tabular-nums transition disabled:opacity-40 ${
              showKeys ? "border-accent bg-accent text-bg" : "border-accent/50 text-accent hover:bg-accent/10"
            }`}
          >
            {keyInfo?.label ?? "—"} ⌨
          </button>
        </div>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 text-sm">
          <div className="flex items-center gap-1.5">
            <button onClick={() => go(idx - 1)} disabled={idx === 0} className="rounded bg-bg-elev-2 px-2 py-1 hover:bg-bg-elev disabled:opacity-30">◀ Prev</button>
            <button onClick={() => go(idx + 1)} disabled={idx >= items.length - 1} className="rounded bg-bg-elev-2 px-2 py-1 hover:bg-bg-elev disabled:opacity-30">Next ▶</button>
          </div>
          <Stepper label="Transpose" onDown={() => setSemitones((s) => s - 1)} onUp={() => setSemitones((s) => s + 1)} value={semitones > 0 ? `+${semitones}` : String(semitones)} />
          <Stepper label="Text" onDown={() => setTextNudge((f) => f - 1)} onUp={() => setTextNudge((f) => f + 1)} value={String(fontSize)} />
          <button
            onClick={() => setPlaying((p) => !p)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${playing ? "bg-accent text-bg" : "bg-bg-elev-2 hover:bg-bg-elev"}`}
          >
            {playing ? "❚❚" : "▶"} Scroll
          </button>
          <input type="range" min={8} max={90} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-24 accent-accent" />
        </div>

        {showKeys && keyInfo && (
          <div className="border-t border-border bg-bg-elev/60 px-4 py-2">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <span className="shrink-0 text-xs text-text-faint">
                {keyInfo.label} scale · tap to hear
              </span>
              <div className="min-w-0 flex-1">
                <PlayableKeyboard tonicPc={keyInfo.tonicPc} mode={keyInfo.mode} preferFlat={keyInfo.preferFlat} />
              </div>
              <button onClick={() => setShowKeys(false)} className="shrink-0 text-text-faint hover:text-text" aria-label="Hide keyboard">✕</button>
            </div>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
            Couldn’t load this song: {error}
            <button onClick={() => go(idx + 1)} className="ml-2 underline">skip →</button>
          </div>
        )}
        {!data && !error && <p className="text-text-dim">Loading song…</p>}

        {data && (
          <>
            <ChordSheet
              song={data.parsed}
              semitones={semitones}
              preferFlat={preferFlat}
              fontSize={fontSize}
              showPiano={settings.pianoVoicings}
              legible={settings.legibleFont}
            />

            {next && endTransition ? (
              <EndOfSong
                next={next}
                transition={endTransition}
                autoAdvance={settings.autoAdvance}
                seconds={settings.autoAdvanceSeconds}
                onGo={() => go(idx + 1)}
              />
            ) : (
              <div className="mt-10 rounded-2xl border border-border bg-bg-elev p-6 text-center">
                <div className="text-lg font-semibold">🎉 End of set</div>
                <p className="mt-1 text-text-dim">That was the last song.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <button onClick={() => go(0)} className="rounded-lg bg-accent px-4 py-2 font-semibold text-bg">Start over</button>
                  <Link href="/setlist" className="rounded-lg border border-border px-4 py-2 text-text-dim hover:text-text">Back to setlist</Link>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom tap zones */}
      <button onClick={() => bumpSpeed(6)} aria-label="Scroll faster" className="fixed bottom-4 left-4 z-30 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur active:scale-95">
        + Speed
      </button>
      <button onClick={rewindHalf} aria-label="Rewind half a page" className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur active:scale-95">
        ↑ Back
      </button>
      <button onClick={() => bumpSpeed(-6)} aria-label="Scroll slower" className="fixed bottom-4 right-4 z-30 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur active:scale-95">
        − Speed
      </button>
    </div>
  );
}

function Stepper({ label, onDown, onUp, value }: { label: string; onDown: () => void; onUp: () => void; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-faint">{label}</span>
      <button onClick={onDown} className="h-6 w-6 rounded bg-bg-elev-2 hover:bg-bg-elev">−</button>
      <span className="w-8 text-center font-mono tabular-nums">{value}</span>
      <button onClick={onUp} className="h-6 w-6 rounded bg-bg-elev-2 hover:bg-bg-elev">+</button>
    </div>
  );
}
