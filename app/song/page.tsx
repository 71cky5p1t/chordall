"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ParsedSong } from "@/lib/chordpro/parse";
import type { SongVersion } from "@/lib/providers/types";
import type { DetectedKey, Mode } from "@/lib/music/key";
import { flatKey, noteName } from "@/lib/music/key";
import { transposeChord } from "@/lib/music/chords";
import { transitionBetweenSongs, type Transition } from "@/lib/music/transition";
import { jazzifySong } from "@/lib/music/jazzify";
import { burstSparkles } from "@/lib/sparkle";
import { ChordSheet } from "@/components/ChordSheet";
import { PlayableKeyboard } from "@/components/PlayableKeyboard";
import { EndOfSong } from "@/components/EndOfSong";
import { useAutoScroll } from "@/components/use-auto-scroll";
import { animateScrollBy } from "@/lib/scroll";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { useFavourites } from "@/components/FavouritesProvider";
import type { SetlistItem } from "@/lib/setlist-types";

interface SongResponse {
  cached?: boolean;
  meta: {
    provider: string;
    id: string;
    url: string;
    title: string;
    artist: string;
    key?: string;
    capo?: number;
    tuning?: string;
    difficulty?: string;
    versions?: SongVersion[];
    currentVersion?: number;
  };
  parsed: ParsedSong;
  detectedKey: DetectedKey | null;
}

function currentKeyInfo(k: DetectedKey | null, semitones: number) {
  if (!k) return null;
  const tonicPc = ((k.tonicPc + semitones) % 12 + 12) % 12;
  const preferFlat = flatKey(tonicPc, k.mode);
  return {
    tonicPc,
    mode: k.mode as Mode,
    preferFlat,
    label: `${noteName(tonicPc, preferFlat)}${k.mode === "minor" ? "m" : ""}`,
  };
}

// Lower rank = smoother musical transition, for suggesting the next song.
const REL_RANK: Record<string, number> = {
  "same key": 0,
  "relative minor": 1,
  "relative major": 1,
  "parallel minor": 1,
  "parallel major": 1,
  "up a fifth": 2,
  "up a fourth": 2,
  "up a whole step": 3,
  "down a whole step": 3,
  "up a half step": 3,
  "down a half step": 3,
  "up a major third": 4,
  "down a major third": 4,
  "up a minor third": 4,
  "down a minor third": 4,
  "a tritone away": 6,
};

function Player() {
  const sp = useSearchParams();
  const provider = sp.get("provider") ?? "";
  const id = sp.get("id") ?? "";
  const url = sp.get("url") ?? "";
  const fallbackTitle = sp.get("title") ?? "";
  const fallbackArtist = sp.get("artist") ?? "";

  const { settings, update } = useSettings();
  const { add, has, items: setlistItems } = useSetlist();
  const { toggle: toggleFav, isFavourite, favourites } = useFavourites();
  const router = useRouter();

  const [data, setData] = useState<SongResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(settings.defaultTranspose);
  const [textNudge, setTextNudge] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(28);
  const [suggestion, setSuggestion] = useState<{ item: SetlistItem; t: Transition } | null | undefined>(undefined);
  const [jazzify, setJazzify] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const appliedTransposeFor = useRef<string | null>(null);

  useAutoScroll(playing, speed);

  // Apply the default-transpose preference once per song, after data (and by then
  // the persisted settings) have loaded. Reading it here avoids the race where
  // settings hydrate from localStorage after the player first mounts.
  useEffect(() => {
    if (data && appliedTransposeFor.current !== id) {
      appliedTransposeFor.current = id;
      setSemitones(settings.defaultTranspose);
    }
  }, [data, id, settings.defaultTranspose]);

  useEffect(() => {
    const ctrl = new AbortController();
    const p = new URLSearchParams({ provider, id, url });
    setData(null);
    setError(null);
    setSuggestion(undefined);
    setJazzify(false); // Jazzify is a per-song opt-in
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, id, url]);

  const meta = data?.meta;
  const title = meta?.title || fallbackTitle;
  const artist = meta?.artist || fallbackArtist;
  const keyInfo = currentKeyInfo(data?.detectedKey ?? null, semitones);
  const preferFlat = keyInfo?.preferFlat ?? semitones < 0;
  const fontSize = Math.max(12, Math.round(17 * settings.fontScale) + textNudge);

  const effectiveChords = useMemo(
    () => (data ? data.parsed.chords.map((c) => transposeChord(c, semitones, preferFlat)) : []),
    [data, semitones, preferFlat],
  );

  // Jazzify is a Juncle (piano) thing. Reharmonise in the song's own key; the
  // sheet transposes the result on render like any other chord.
  const jazzOn = jazzify && settings.instrument === "piano";
  const displaySong = useMemo(
    () => (data ? (jazzOn ? jazzifySong(data.parsed, data.detectedKey) : data.parsed) : null),
    [data, jazzOn],
  );

  const onJazz = (e: React.MouseEvent<HTMLButtonElement>) => {
    burstSparkles(e.currentTarget);
    setJazzify((j) => !j);
    setShimmer(true);
    window.setTimeout(() => setShimmer(false), 950);
  };

  const inSetlist = has(provider, id);
  const fav = isFavourite(provider, id);

  // Store the ORIGINAL chords + detected key. The key a song is actually played
  // in is derived later as detectedKey + whatever transpose is applied on open,
  // so transitions always target the real playing key (see defaultTranspose).
  const buildItem = (): Omit<SetlistItem, "uid"> => ({
    provider,
    songId: id,
    url,
    title,
    artist,
    chords: data ? data.parsed.chords : [],
    detectedKey: data?.detectedKey ?? null,
    sourceKey: meta?.key,
  });

  const onAdd = () => data && add(buildItem());
  const onFav = () => data && toggleFav(buildItem());

  // Version dropdown: current version first (UG omits it from its own list).
  const versions = meta?.versions ?? [];
  const gotoVersion = (vId: string, vUrl: string) => {
    const p = new URLSearchParams({ provider, id: vId, url: vUrl, title, artist });
    setPlaying(false);
    router.push(`/song?${p.toString()}`);
  };

  // Next song from the setlist (for the end-of-song panel).
  const setlistIdx = setlistItems.findIndex((i) => i.provider === provider && i.songId === id);
  const nextInSetlist =
    setlistIdx >= 0 && setlistIdx < setlistItems.length - 1 ? setlistItems[setlistIdx + 1] : null;
  // The next song opens with the default transpose applied, so aim the bridge at
  // the key it will actually be played in — not its stored/original key.
  const playChords = (chords: string[]) =>
    chords.map((c) => transposeChord(c, settings.defaultTranspose, false));
  const endTransition =
    nextInSetlist && effectiveChords.length
      ? transitionBetweenSongs(effectiveChords, playChords(nextInSetlist.chords))
      : null;

  const gotoSong = (it: { provider: string; songId: string; url: string; title: string; artist: string }) => {
    const p = new URLSearchParams({
      provider: it.provider,
      id: it.songId,
      url: it.url,
      title: it.title,
      artist: it.artist,
    });
    router.push(`/song?${p.toString()}`);
  };

  const onSuggest = () => {
    const candidates = favourites.filter((f) => !(f.provider === provider && f.songId === id));
    let best: { item: SetlistItem; t: Transition; rank: number } | null = null;
    for (const f of candidates) {
      const t = transitionBetweenSongs(effectiveChords, playChords(f.chords));
      if (!t) continue;
      const rank = REL_RANK[t.relationship] ?? 5;
      if (!best || rank < best.rank) best = { item: { ...f, uid: `${f.provider}:${f.songId}` }, t, rank };
    }
    setSuggestion(best ? { item: best.item, t: best.t } : null);
  };

  const bumpSpeed = (delta: number) => {
    setPlaying(true);
    setSpeed((s) => Math.min(90, Math.max(8, s + delta)));
  };
  const rewindHalf = () => {
    // Pause auto-scroll so it doesn't fight the animation, rewind smoothly, resume.
    const wasPlaying = playing;
    setPlaying(false);
    animateScrollBy(-Math.round(window.innerHeight / 2)).then(() => {
      if (wasPlaying) setPlaying(true);
    });
  };

  return (
    <>
      {/* Controls */}
      <div className="sticky top-[57px] z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 text-sm">
          <Control label="Key">
            <span className="w-9 text-center font-mono font-semibold text-accent tabular-nums">
              {keyInfo?.label ?? "—"}
            </span>
          </Control>
          <Control label="Transpose">
            <Stepper
              onDown={() => setSemitones((s) => s - 1)}
              onUp={() => setSemitones((s) => s + 1)}
              value={semitones > 0 ? `+${semitones}` : String(semitones)}
              onReset={semitones !== settings.defaultTranspose ? () => setSemitones(settings.defaultTranspose) : undefined}
            />
          </Control>
          <Control label="Text">
            <Stepper
              onDown={() => setTextNudge((f) => f - 1)}
              onUp={() => setTextNudge((f) => f + 1)}
              value={String(fontSize)}
              onReset={textNudge !== 0 ? () => setTextNudge(0) : undefined}
            />
          </Control>

          <button
            onClick={() => update({ instrument: settings.instrument === "guitar" ? "piano" : "guitar" })}
            title={`Chord diagrams: ${settings.instrument === "guitar" ? "guitar" : "piano"} — tap to switch`}
            className="rounded-lg bg-bg-elev-2 px-2.5 py-1.5 hover:bg-bg-elev"
          >
            {settings.instrument === "guitar" ? "🎸" : "🎹"}
          </button>

          {settings.instrument === "piano" && (
            <button
              onClick={onJazz}
              disabled={!data}
              title="Jazzify: richer 7ths & 9ths, secondary dominants, walking bass"
              className={`rounded-lg px-3 py-1.5 font-medium transition disabled:opacity-40 ${
                jazzify ? "btn-jazz" : "bg-bg-elev-2 text-text hover:bg-bg-elev"
              }`}
            >
              {jazzify ? "✨ Jazzified" : "✨ Jazzify"}
            </button>
          )}

          <button
            onClick={() => setPlaying((p) => !p)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              playing ? "bg-accent text-bg" : "bg-bg-elev-2 text-text hover:bg-bg-elev"
            }`}
          >
            {playing ? "❚❚ Scrolling" : "▶ Auto-scroll"}
          </button>
          <Control label="Speed">
            <input
              type="range"
              min={8}
              max={90}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </Control>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onFav}
              aria-label="Favourite"
              disabled={!data}
              className={`rounded-lg border px-3 py-1.5 font-medium transition disabled:opacity-40 ${
                fav
                  ? "border-danger bg-danger/15 text-danger"
                  : "border-border text-text-dim hover:border-danger hover:text-danger"
              }`}
            >
              {fav ? "♥ Favourited" : "♡ Favourite"}
            </button>
            <button
              onClick={onSuggest}
              disabled={!data || favourites.length === 0}
              title={favourites.length === 0 ? "Favourite a few songs first" : "Suggest a song to play next"}
              className="rounded-lg border border-accent-2 px-3 py-1.5 font-medium text-accent-2 transition hover:bg-accent-2 hover:text-bg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-accent-2"
            >
              Suggest next
            </button>
            <button
              onClick={onAdd}
              disabled={!data || inSetlist}
              className="rounded-lg border border-accent px-3 py-1.5 font-medium text-accent transition hover:bg-accent hover:text-bg disabled:cursor-default disabled:border-border disabled:text-text-faint disabled:hover:bg-transparent"
            >
              {inSetlist ? "✓ In setlist" : "+ Add to setlist"}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">{title || "Loading…"}</h1>
          {artist && <p className="text-text-dim">{artist}</p>}

          {versions.length > 0 && meta && (
            <label className="mt-2 flex items-center gap-2 text-sm text-text-dim">
              <span className="text-text-faint">Version</span>
              <select
                value={id}
                onChange={(e) => {
                  if (e.target.value === id) return;
                  const v = versions.find((x) => x.id === e.target.value);
                  if (v) gotoVersion(v.id, v.url);
                }}
                className="max-w-full rounded-lg border border-border bg-bg-elev px-2 py-1.5 text-text outline-none focus:border-accent"
              >
                <option value={id}>
                  This version{meta.currentVersion ? ` (v${meta.currentVersion})` : ""}
                </option>
                {versions
                  .filter((v) => v.id !== id)
                  .map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {`v${v.version ?? i + 1}`}
                      {v.type ? ` · ${v.type}` : ""}
                      {typeof v.rating === "number" ? ` · ★${v.rating.toFixed(1)}` : ""}
                      {v.votes ? ` (${v.votes})` : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {meta && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-faint">
              {meta.key && <Tag>Source key {meta.key}</Tag>}
              {typeof meta.capo === "number" && meta.capo > 0 && <Tag>Capo {meta.capo}</Tag>}
              {meta.tuning && <Tag>{meta.tuning}</Tag>}
              {meta.difficulty && <Tag>{meta.difficulty}</Tag>}
              {data?.cached && <Tag>cached</Tag>}
              {meta.url && (
                <a href={meta.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-text-dim">
                  source
                </a>
              )}
            </div>
          )}

          {/* Playable scale keyboard for the current key (piano mode only) */}
          {keyInfo && settings.instrument === "piano" && (
            <div className="mt-3 inline-flex max-w-full flex-col gap-1 rounded-xl border border-border bg-bg-elev p-3">
              <span className="text-xs text-text-faint">
                Scale of <span className="font-semibold text-accent">{keyInfo.label}</span>{" "}
                — tap a key to hear it
              </span>
              <PlayableKeyboard tonicPc={keyInfo.tonicPc} mode={keyInfo.mode} preferFlat={preferFlat} />
            </div>
          )}
        </div>

        {suggestion !== undefined && (
          <SuggestionCard
            suggestion={suggestion}
            onDismiss={() => setSuggestion(undefined)}
            onPlay={(it) => gotoSong({ provider: it.provider, songId: it.songId, url: it.url, title: it.title, artist: it.artist })}
            onAdd={(it) => add({ ...it })}
          />
        )}

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
            Couldn’t load this song: {error}
            <div className="mt-2">
              <Link href="/" className="text-sm underline">← back to search</Link>
            </div>
          </div>
        )}

        {!data && !error && <p className="text-text-dim">Fetching chords…</p>}

        {data && (
          <>
            <div className={shimmer ? "sheet-shimmer" : undefined}>
              <ChordSheet
                song={displaySong ?? data.parsed}
                semitones={semitones}
                preferFlat={preferFlat}
                fontSize={fontSize}
                showPiano={settings.pianoVoicings}
                legible={settings.legibleFont}
              />
            </div>

            {endTransition && nextInSetlist && (
              <EndOfSong
                next={nextInSetlist}
                transition={endTransition}
                autoAdvance={settings.autoAdvance}
                seconds={settings.autoAdvanceSeconds}
                onGo={() => gotoSong(nextInSetlist)}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom tap zones: faster · rewind half a page · slower */}
      <button
        onClick={() => bumpSpeed(6)}
        aria-label="Scroll faster"
        className="fixed bottom-4 left-4 z-30 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold text-text shadow-lg backdrop-blur active:scale-95"
      >
        + Speed
      </button>
      <button
        onClick={rewindHalf}
        aria-label="Rewind half a page"
        className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold text-text shadow-lg backdrop-blur active:scale-95"
      >
        ↑ Back
      </button>
      <button
        onClick={() => bumpSpeed(-6)}
        aria-label="Scroll slower"
        className="fixed bottom-4 right-4 z-30 rounded-full border border-border-strong bg-bg-elev-2/90 px-4 py-3 text-sm font-semibold text-text shadow-lg backdrop-blur active:scale-95"
      >
        − Speed
      </button>
    </>
  );
}

function SuggestionCard({
  suggestion,
  onDismiss,
  onPlay,
  onAdd,
}: {
  suggestion: { item: SetlistItem; t: Transition } | null;
  onDismiss: () => void;
  onPlay: (it: SetlistItem) => void;
  onAdd: (it: SetlistItem) => void;
}) {
  if (suggestion === null) {
    return (
      <div className="mb-5 rounded-xl border border-border bg-bg-elev px-4 py-3 text-sm text-text-dim">
        No good match in your favourites yet. Favourite a few more songs and try again.
        <button onClick={onDismiss} className="ml-2 text-text-faint underline">dismiss</button>
      </div>
    );
  }
  const { item, t } = suggestion;
  return (
    <div className="mb-5 rounded-xl border border-accent-2/40 bg-accent-2/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-2">Suggested next</span>
        <button onClick={onDismiss} className="ml-auto text-text-faint underline">dismiss</button>
      </div>
      <div className="mt-1 font-medium">
        {item.title} <span className="text-text-dim">— {item.artist}</span>
      </div>
      <p className="mt-1 text-sm text-text-dim">{t.description}</p>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => onPlay(item)} className="rounded-lg bg-accent-2 px-3 py-1.5 text-sm font-medium text-bg">
          Play it
        </button>
        <button onClick={() => onAdd(item)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim hover:text-text">
          Add to setlist
        </button>
      </div>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-faint">{label}</span>
      {children}
    </div>
  );
}

function Stepper({
  onDown,
  onUp,
  value,
  onReset,
}: {
  onDown: () => void;
  onUp: () => void;
  value: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onDown} className="h-6 w-6 rounded bg-bg-elev-2 hover:bg-bg-elev">−</button>
      <button
        onClick={onReset}
        disabled={!onReset}
        className="w-8 text-center font-mono tabular-nums disabled:cursor-default"
        title={onReset ? "reset" : undefined}
      >
        {value}
      </button>
      <button onClick={onUp} className="h-6 w-6 rounded bg-bg-elev-2 hover:bg-bg-elev">+</button>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2 py-0.5">{children}</span>;
}

export default function SongPage() {
  return (
    <Suspense fallback={<p className="p-8 text-text-dim">Loading…</p>}>
      <Player />
    </Suspense>
  );
}
