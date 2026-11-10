"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ParsedSong } from "@/lib/chordpro/parse";
import type { DetectedKey, Mode } from "@/lib/music/key";
import { flatKey, noteName } from "@/lib/music/key";
import { transposeChord } from "@/lib/music/chords";
import { capoShift, playedChords } from "@/lib/music/capo";
import { transitionBetweenSongs } from "@/lib/music/transition";
import { ChordSheet } from "@/components/ChordSheet";
import { EndOfSong } from "@/components/EndOfSong";
import { PlayableKeyboard } from "@/components/PlayableKeyboard";
import { useJazzify } from "@/components/use-jazzify";
import { useAutoScroll } from "@/components/use-auto-scroll";
import { useWakeLock } from "@/components/use-wake-lock";
import { useAutoHide } from "@/components/use-auto-hide";
import { useHoldPosition } from "@/components/use-hold-position";
import { ScrollDock } from "@/components/ScrollDock";
import { Rocker } from "@/components/Rocker";
import { animateScrollBy } from "@/lib/scroll";
import { useSetlist } from "@/components/SetlistProvider";
import { useHistory } from "@/components/HistoryProvider";
import {
  useSettings,
  clamp,
  BASE_FONT_PX,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  SPEED_MAX,
  SPEED_MIN,
} from "@/components/SettingsProvider";

interface SongResponse {
  parsed: ParsedSong;
  detectedKey: DetectedKey | null;
  meta: { key?: string; capo?: number };
}

// Survives a reload mid-gig; gone when the tab closes, like a performance.
const POSITION_KEY = "chordall.perform.position";

export default function PerformPage() {
  const { items, ready } = useSetlist();
  const { settings, update } = useSettings();
  const { notePlayed } = useHistory();

  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<SongResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(settings.defaultTranspose);
  const [playing, setPlaying] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const appliedFor = useRef<number>(-1);

  const speed = settings.scrollSpeed;
  const setSpeed = (scrollSpeed: number) => update({ scrollSpeed });
  const songLoaded = !!data;
  const hasNext = idx < items.length - 1;

  useAutoScroll(playing, speed, () => setPlaying(false), () => {
    // Stop at the bottom, unless the countdown is about to carry on hands-free.
    if (songLoaded && !(settings.autoAdvance && hasNext)) setPlaying(false);
  }); // repeatedly scrolling up (fighting it) pauses
  const awake = useWakeLock(true); // whole performance: never let the screen lock mid-set
  const bar = useAutoHide(!playing); // top bar hides on scroll-down (not while auto-scrolling)

  const content = useHoldPosition<HTMLElement>(playing);

  const current = items[idx];

  // Pick up where a reload left off (the setlist may have shrunk since).
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    try {
      const saved = Number(window.sessionStorage.getItem(POSITION_KEY));
      if (saved > 0 && saved < items.length) setIdx(saved);
    } catch {
      /* storage may be unavailable */
    }
  }, [ready, items.length]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      window.sessionStorage.setItem(POSITION_KEY, String(idx));
    } catch {
      /* storage may be unavailable */
    }
  }, [idx]);

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
  }, [current, reloads]);

  // Songs played in a set count as listens too.
  useEffect(() => {
    if (!data || !current) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { uid, ...song } = current;
    notePlayed({ ...song, chords: data.parsed.chords, detectedKey: data.detectedKey, capo: data.meta.capo ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Apply the default transpose once per song (after settings have hydrated).
  useEffect(() => {
    if (data && appliedFor.current !== idx) {
      appliedFor.current = idx;
      setSemitones(settings.defaultTranspose);
    }
  }, [data, idx, settings.defaultTranspose]);

  // The sheet's real offset from the chart: on piano, capo shapes become the
  // original key, and "+0" on the rocker means that key.
  const shown = semitones + capoShift(data?.meta.capo, settings.instrument);
  const guitarCapo = settings.instrument === "guitar" ? data?.meta.capo : 0;

  const keyInfo = useMemo(() => {
    const k = data?.detectedKey;
    if (!k) return null;
    const pc = ((k.tonicPc + shown) % 12 + 12) % 12;
    const preferFlat = flatKey(pc, k.mode);
    return { tonicPc: pc, preferFlat, label: `${noteName(pc, preferFlat)}${k.mode === "minor" ? "m" : ""}`, mode: k.mode as Mode };
  }, [data, shown]);
  const preferFlat = keyInfo?.preferFlat ?? shown < 0;

  const effectiveChords = useMemo(
    () => (data ? data.parsed.chords.map((c) => transposeChord(c, shown, preferFlat)) : []),
    [data, shown, preferFlat],
  );

  // Jazzify (Juncle/piano only): 5 escalating levels, reset on each song.
  const jazz = useJazzify(data?.parsed ?? null, data?.detectedKey ?? null, settings.instrument === "piano", idx);

  const next = items[idx + 1] ?? null;
  const endTransition =
    next && effectiveChords.length && next.chords.length
      ? transitionBetweenSongs(effectiveChords, playedChords(next, settings.defaultTranspose, settings.instrument))
      : null;

  const fontSize = Math.round(BASE_FONT_PX * settings.fontScale);
  const stepText = (px: number) =>
    update((s) => ({
      fontScale: clamp(s.fontScale + px / BASE_FONT_PX, FONT_SCALE_MIN, FONT_SCALE_MAX),
    }));
  const stepTranspose = (d: number) => setSemitones((s) => clamp(s + d, -11, 11));

  const go = (to: number, keepPlaying = false) => {
    if (to < 0 || to >= items.length) return;
    if (!keepPlaying) setPlaying(false);
    if (to === idx) window.scrollTo(0, 0); // same song: nothing else would move
    setIdx(to);
  };
  const rewindHalf = () => {
    const wasPlaying = playing;
    setPlaying(false);
    animateScrollBy(-Math.round(window.innerHeight / 2)).then(() => wasPlaying && setPlaying(true));
  };

  if (!ready) return <p className="px-4 py-8 text-text-dim">Loading setlist…</p>;

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
      <div className={`topbar safe-top sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur ${bar.hidden ? "topbar-hidden" : ""}`}>
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
          {settings.instrument === "piano" ? (
            <button
              onClick={() => setShowKeys((s) => !s)}
              disabled={!keyInfo}
              title="Show a playable keyboard for this key"
              className={`h-9 rounded-lg border px-2.5 font-mono font-semibold tabular-nums transition disabled:opacity-40 ${
                showKeys ? "border-accent bg-accent text-bg" : "border-accent/50 text-accent hover:bg-accent/10"
              }`}
            >
              {keyInfo?.label ?? "—"} ⌨
            </button>
          ) : (
            <span className="font-mono font-semibold text-accent tabular-nums">
              {guitarCapo ? `Capo ${guitarCapo} · ` : ""}
              {keyInfo?.label ?? "—"}
            </span>
          )}
        </div>
        {/* Compact row while auto-scrolling. */}
        {playing && (
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 pb-2 text-sm">
            <input type="range" min={SPEED_MIN} max={SPEED_MAX} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="min-w-0 flex-1 accent-accent sm:w-40 sm:flex-none" aria-label="Scroll speed" />
            <span className="ml-auto hidden text-xs text-text-faint sm:inline">{awake ? "☀ screen awake" : ""}</span>
          </div>
        )}
        <div className={`mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 text-sm ${playing ? "hidden" : ""}`}>
          <div className="flex items-center gap-1.5">
            <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous song" className="h-9 rounded-lg bg-bg-elev-2 px-2.5 hover:bg-bg-elev disabled:opacity-30">◀<span className="hidden sm:inline"> Prev</span></button>
            <button onClick={() => go(idx + 1)} disabled={idx >= items.length - 1} aria-label="Next song" className="h-9 rounded-lg bg-bg-elev-2 px-2.5 hover:bg-bg-elev disabled:opacity-30"><span className="hidden sm:inline">Next </span>▶</button>
          </div>
          <Rocker label="Transpose" tag="Key" onDown={() => stepTranspose(-1)} onUp={() => stepTranspose(1)} value={semitones > 0 ? `+${semitones}` : String(semitones)} />
          <Rocker label="Text" tag="Aa" onDown={() => stepText(-1)} onUp={() => stepText(1)} value={String(fontSize)} />
          <button
            onClick={() => update({ instrument: settings.instrument === "guitar" ? "piano" : "guitar" })}
            title={`Chord diagrams: ${settings.instrument} — tap to switch`}
            aria-label={`Chord diagrams: ${settings.instrument}. Tap to switch.`}
            className="h-9 rounded-lg bg-bg-elev-2 px-2.5 hover:bg-bg-elev"
          >
            {settings.instrument === "guitar" ? "🎸" : "🎹"}
          </button>
          {settings.instrument === "piano" && (
            <button
              onClick={jazz.bump}
              disabled={!data}
              title={jazz.title}
              style={jazz.level > 0 ? { filter: `saturate(${1 + jazz.level * 0.12})` } : undefined}
              className={`h-9 rounded-lg px-3 font-medium transition disabled:opacity-40 ${
                jazz.level > 0 ? "btn-jazz" : "bg-bg-elev-2 hover:bg-bg-elev"
              }`}
            >
              {jazz.label}
            </button>
          )}
        </div>

        {showKeys && keyInfo && settings.instrument === "piano" && (
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

      {bar.hidden && (
        <button onClick={bar.reveal} className="chrome-reveal" aria-label="Show controls">
          ⌄
        </button>
      )}

      {/* Extra bottom padding so the floating dock never covers the last lines. */}
      <main ref={content} className="mx-auto max-w-4xl px-4 pt-6 pb-32">
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
            Couldn’t load this song.
            <p className="mt-1 text-xs opacity-80">{error}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <button onClick={() => setReloads((n) => n + 1)} className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-bg">
                Try again
              </button>
              {next && <button onClick={() => go(idx + 1)} className="underline">Skip to next song →</button>}
            </div>
          </div>
        )}
        {!data && !error && <p className="text-text-dim">Loading song…</p>}

        {data && (
          <>
            <div className={jazz.shimmer ? "sheet-shimmer" : undefined}>
              <ChordSheet
                song={jazz.displaySong ?? data.parsed}
                semitones={shown}
                preferFlat={preferFlat}
                fontSize={fontSize}
                showPiano={settings.pianoVoicings}
                legible={settings.legibleFont}
              />
            </div>

            {next ? (
              <EndOfSong
                next={next}
                transition={endTransition}
                autoAdvance={settings.autoAdvance}
                seconds={settings.autoAdvanceSeconds}
                onGo={(auto) => go(idx + 1, auto)}
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

      {data && (
        <ScrollDock
          playing={playing}
          speed={speed}
          onToggle={() => setPlaying((p) => !p)}
          onSpeed={setSpeed}
          onRewind={rewindHalf}
        />
      )}
    </div>
  );
}

