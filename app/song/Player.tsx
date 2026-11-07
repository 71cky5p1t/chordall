"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ParsedSong } from "@/lib/chordpro/parse";
import type { SongVersion } from "@/lib/providers/types";
import type { DetectedKey, Mode } from "@/lib/music/key";
import { flatKey, noteName } from "@/lib/music/key";
import { transposeChord } from "@/lib/music/chords";
import { capoShift, playedChords } from "@/lib/music/capo";
import { transitionBetweenSongs, type Transition } from "@/lib/music/transition";
import { useJazzify } from "@/components/use-jazzify";
import { ChordSheet } from "@/components/ChordSheet";
import { PlayableKeyboard } from "@/components/PlayableKeyboard";
import { EndOfSong } from "@/components/EndOfSong";
import { useAutoScroll } from "@/components/use-auto-scroll";
import { useWakeLock } from "@/components/use-wake-lock";
import { useAutoHide } from "@/components/use-auto-hide";
import { useHoldPosition } from "@/components/use-hold-position";
import { ScrollDock } from "@/components/ScrollDock";
import { Rocker } from "@/components/Rocker";
import { animateScrollBy } from "@/lib/scroll";
import { useSetlist } from "@/components/SetlistProvider";
import {
  useSettings,
  clamp,
  BASE_FONT_PX,
  DEFAULT_FONT_SCALE,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  SPEED_MAX,
  SPEED_MIN,
} from "@/components/SettingsProvider";
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

export function Player() {
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
  const [playing, setPlaying] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [suggestions, setSuggestions] = useState<{ item: SetlistItem; t: Transition }[] | undefined>(undefined);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const shownTitles = useRef<string[]>([]);
  const appliedTransposeFor = useRef<string | null>(null);

  const title = data?.meta.title || fallbackTitle;
  const artist = data?.meta.artist || fallbackArtist;
  // Next song from the setlist (for the end-of-song panel).
  const setlistIdx = setlistItems.findIndex((i) => i.provider === provider && i.songId === id);
  const nextInSetlist =
    setlistIdx >= 0 && setlistIdx < setlistItems.length - 1 ? setlistItems[setlistIdx + 1] : null;

  const speed = settings.scrollSpeed;
  const setSpeed = (scrollSpeed: number) => update({ scrollSpeed });

  useAutoScroll(playing, speed, () => setPlaying(false), () => {
    // Stop at the bottom, unless the countdown is about to carry on hands-free.
    if (data && !(settings.autoAdvance && nextInSetlist)) setPlaying(false);
  }); // repeatedly scrolling up (fighting it) pauses
  // Someone reading chords isn't touching the screen, scrolling or not.
  const awake = useWakeLock(!!data);
  const bar = useAutoHide(!playing); // top chrome hides on scroll-down (not while auto-scrolling)
  // Scrolling hides the site header and slims the toolbar so the chords get the
  // whole screen; this stops that moving the words you're reading.
  const content = useHoldPosition<HTMLElement>(playing);

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
    setSuggestions(undefined);
    setSuggestErr(null);
    shownTitles.current = [];
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
  }, [provider, id, url, reloads]);

  const meta = data?.meta;
  // The sheet's real offset from the chart. `semitones` stays relative to what
  // you first see, so "+0" means the original key on piano.
  const shown = semitones + capoShift(meta?.capo, settings.instrument);
  const keyInfo = currentKeyInfo(data?.detectedKey ?? null, shown);
  const preferFlat = keyInfo?.preferFlat ?? shown < 0;
  const fontSize = Math.round(BASE_FONT_PX * settings.fontScale);
  const stepText = (px: number) =>
    update((s) => ({
      fontScale: clamp(s.fontScale + px / BASE_FONT_PX, FONT_SCALE_MIN, FONT_SCALE_MAX),
    }));
  const stepTranspose = (d: number) => setSemitones((s) => clamp(s + d, -11, 11));

  const effectiveChords = useMemo(
    () => (data ? data.parsed.chords.map((c) => transposeChord(c, shown, preferFlat)) : []),
    [data, shown, preferFlat],
  );

  // Jazzify is a Juncle (piano) thing: 5 escalating levels, reset per song.
  // Reharmonised in the song's own key; the sheet transposes on render.
  const jazz = useJazzify(data?.parsed ?? null, data?.detectedKey ?? null, settings.instrument === "piano", id);

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
    capo: meta?.capo ?? 0,
  });

  const onAdd = () => data && add(buildItem());
  const onFav = () => data && toggleFav(buildItem());

  // Version dropdown: current version first (UG omits it from its own list).
  const versions = meta?.versions ?? [];
  const gotoVersion = (vId: string, vUrl: string) => {
    const p = new URLSearchParams({ provider, id: vId, url: vUrl, title, artist });
    setPlaying(false);
    appliedTransposeFor.current = vId; // same song: keep the key you've set
    router.push(`/song?${p.toString()}`);
  };

  // The next song opens with the default transpose applied, so aim the bridge at
  // the key it will actually be played in — not its stored/original key.
  const playChords = (song: { chords: string[]; capo?: number }) =>
    playedChords(song, settings.defaultTranspose, settings.instrument);
  const endTransition =
    nextInSetlist && effectiveChords.length
      ? transitionBetweenSongs(effectiveChords, playChords(nextInSetlist))
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

  const rankOf = (t: Transition) => REL_RANK[t.relationship] ?? 5;
  const withTransition = (it: Omit<SetlistItem, "uid">) => {
    const t = transitionBetweenSongs(effectiveChords, playChords(it));
    return t ? { item: { ...it, uid: `${it.provider}:${it.songId}` }, t } : null;
  };

  const capo = meta?.capo ?? 0;
  const capoRemoved = capo > 0 && settings.instrument === "piano";
  const soundingKey = capo > 0 && !capoRemoved && keyInfo
    ? `${noteName(keyInfo.tonicPc + capo, flatKey((keyInfo.tonicPc + capo) % 12, keyInfo.mode))}${keyInfo.mode === "minor" ? "m" : ""}`
    : null;

  // Up to 6 options, ranked by how smoothly they follow the current song,
  // drawn from favourites + the setlist (deduped, excluding this song).
  const onSuggest = () => {
    const seen = new Set<string>([`${provider}:${id}`]);
    const pool: Omit<SetlistItem, "uid">[] = [];
    for (const f of [...favourites, ...setlistItems]) {
      const k = `${f.provider}:${f.songId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(f);
    }
    const ranked = pool
      .map(withTransition)
      .filter((x): x is { item: SetlistItem; t: Transition } => !!x)
      .sort((a, b) => rankOf(a.t) - rankOf(b.t))
      .slice(0, 6);
    shownTitles.current = ranked.map((r) => r.item.title);
    setSuggestErr(null);
    setSuggestions(ranked);
  };

  // "Skip — more ideas": ask Claude for 6 fresh songs that flow after this one.
  const onMoreIdeas = async () => {
    setSuggestBusy(true);
    setSuggestErr(null);
    try {
      const res = await fetch("/api/suggest-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          key: keyInfo?.label ?? "",
          exclude: [...shownTitles.current, title],
          allowCountry: settings.instrument === "guitar",
          count: 6,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "couldn’t get more ideas");
      const next = (data.items as Omit<SetlistItem, "uid">[])
        .map(withTransition)
        .filter((x): x is { item: SetlistItem; t: Transition } => !!x)
        .sort((a, b) => rankOf(a.t) - rankOf(b.t));
      shownTitles.current = [...shownTitles.current, ...next.map((r) => r.item.title)].slice(-60);
      setSuggestions(next);
    } catch (e) {
      setSuggestErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSuggestBusy(false);
    }
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
      {/* Controls. Nothing here applies until there's a song to apply it to. */}
      {!error && (
      <div className={`topbar sticky z-10 border-b border-border bg-bg/90 backdrop-blur ${playing ? "top-0 safe-top" : "topbar-under-header"} ${bar.hidden ? (playing ? "topbar-hidden" : "topbar-hidden-under") : ""}`}>
        {/* Compact bar while auto-scrolling: just the essentials. */}
        {playing && (
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-1.5 text-sm">
            <span className="font-mono font-semibold text-accent tabular-nums">{keyInfo?.label ?? "—"}</span>
            <input
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="min-w-0 flex-1 accent-accent sm:w-40 sm:flex-none"
              aria-label="Scroll speed"
            />
            <span className="ml-auto hidden text-xs text-text-faint sm:inline">{awake ? "☀ screen awake" : ""}</span>
          </div>
        )}
        <div className={`mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:gap-x-5 ${playing ? "hidden" : ""}`}>
          <Control label="Key">
            <span className="w-9 text-center font-mono font-semibold text-accent tabular-nums">
              {keyInfo?.label ?? "—"}
            </span>
          </Control>
          <Rocker
            label="Transpose"
            tag="Key"
            onDown={() => stepTranspose(-1)}
            onUp={() => stepTranspose(1)}
            value={semitones > 0 ? `+${semitones}` : String(semitones)}
            onReset={semitones !== settings.defaultTranspose ? () => setSemitones(settings.defaultTranspose) : undefined}
          />
          <Rocker
            label="Text"
            tag="Aa"
            onDown={() => stepText(-1)}
            onUp={() => stepText(1)}
            value={String(fontSize)}
            onReset={settings.fontScale !== DEFAULT_FONT_SCALE ? () => update({ fontScale: DEFAULT_FONT_SCALE }) : undefined}
          />

          <button
            onClick={() => update({ instrument: settings.instrument === "guitar" ? "piano" : "guitar" })}
            title={`Chord diagrams: ${settings.instrument === "guitar" ? "guitar" : "piano"} — tap to switch`}
            aria-label={`Chord diagrams: ${settings.instrument === "guitar" ? "guitar" : "piano"}. Tap to switch.`}
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
                jazz.level > 0 ? "btn-jazz" : "bg-bg-elev-2 text-text hover:bg-bg-elev"
              }`}
            >
              {jazz.label}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onFav}
              aria-label={fav ? "Remove from favourites" : "Add to favourites"}
              aria-pressed={fav}
              disabled={!data}
              className={`h-9 rounded-lg border px-3 font-medium transition disabled:opacity-40 ${
                fav
                  ? "border-danger bg-danger/15 text-danger"
                  : "border-border text-text-dim hover:border-danger hover:text-danger"
              }`}
            >
              {fav ? "♥" : "♡"}
              <span className="hidden sm:inline"> {fav ? "Favourited" : "Favourite"}</span>
            </button>
            <button
              onClick={onAdd}
              disabled={!data || inSetlist}
              className="h-9 rounded-lg border border-accent px-3 font-medium text-accent transition hover:bg-accent hover:text-bg disabled:cursor-default disabled:border-border disabled:text-text-faint disabled:hover:bg-transparent"
            >
              {inSetlist ? "✓" : "+"}
              <span className="hidden sm:inline">{inSetlist ? " In setlist" : " Add to setlist"}</span>
              <span className="sm:hidden"> Setlist</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {bar.hidden && (
        <button onClick={bar.reveal} className="chrome-reveal" aria-label="Show controls">
          ⌄
        </button>
      )}

      {/* Extra bottom padding so the floating dock never covers the last lines. */}
      <main ref={content} className="mx-auto max-w-4xl px-4 pt-6 pb-32">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">{title || (error ? "Song unavailable" : "Loading…")}</h1>
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
              {/* Guitar keeps the capo shapes, so say what they sound like rather
                  than show a source key that seems to contradict them. */}
              {capoRemoved ? (
                <Tag>{semitones === 0 ? "Original key · capo" : "Capo"} {capo} removed</Tag>
              ) : soundingKey ? (
                <Tag>Capo {capo} · sounds in {soundingKey}</Tag>
              ) : (
                meta.key && <Tag>Source key {meta.key}</Tag>
              )}
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

          {/* Playable scale keyboard (piano mode only), tucked away so the
              chords are the first thing on screen. */}
          {keyInfo && settings.instrument === "piano" && (
            <div className="mt-2">
              <button
                onClick={() => update({ showScale: !settings.showScale })}
                aria-expanded={settings.showScale}
                className="py-1 text-xs text-text-dim hover:text-text"
              >
                Scale of <span className="font-semibold text-accent">{keyInfo.label}</span>{" "}
                {settings.showScale ? "▴" : "▾"}
              </button>
              {settings.showScale && (
                <div className="mt-1 inline-flex max-w-full flex-col gap-1 rounded-xl border border-border bg-bg-elev p-3">
                  <span className="text-xs text-text-faint">Tap a key to hear it</span>
                  <PlayableKeyboard tonicPc={keyInfo.tonicPc} mode={keyInfo.mode} preferFlat={preferFlat} />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
            Couldn’t load this song.
            <p className="mt-1 text-xs opacity-80">{error}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              {provider && (
                <button onClick={() => setReloads((n) => n + 1)} className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-bg">
                  Try again
                </button>
              )}
              <Link href="/" className="underline">← back to search</Link>
            </div>
          </div>
        )}

        {!data && !error && <p className="text-text-dim">Fetching chords…</p>}

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

            {nextInSetlist && (
              <EndOfSong
                next={nextInSetlist}
                transition={endTransition}
                autoAdvance={settings.autoAdvance}
                seconds={settings.autoAdvanceSeconds}
                onGo={(auto) => {
                  if (!auto) setPlaying(false);
                  gotoSong(nextInSetlist);
                }}
              />
            )}

            {/* Down here because the end of a song is when you want it: from the
                toolbar it opened off-screen if you'd scrolled at all. */}
            <div className="mt-8">
              {suggestions === undefined ? (
                <button
                  onClick={onSuggest}
                  title="Suggest what to play next — from your favourites & setlist, or fresh ideas"
                  className="w-full rounded-lg border border-accent-2 px-3 py-2.5 font-medium text-accent-2 transition hover:bg-accent-2 hover:text-bg"
                >
                  Suggest what to play next
                </button>
              ) : (
                <SuggestionList
                  suggestions={suggestions}
                  busy={suggestBusy}
                  error={suggestErr}
                  onMore={onMoreIdeas}
                  onDismiss={() => setSuggestions(undefined)}
                  onPlay={(it) => gotoSong({ provider: it.provider, songId: it.songId, url: it.url, title: it.title, artist: it.artist })}
                  onAdd={(it) => add({ ...it })}
                  inSetlist={(it) => has(it.provider, it.songId)}
                />
              )}
            </div>
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
    </>
  );
}

function SuggestionList({
  suggestions,
  busy,
  error,
  onMore,
  onDismiss,
  onPlay,
  onAdd,
  inSetlist,
}: {
  suggestions: { item: SetlistItem; t: Transition }[];
  busy: boolean;
  error: string | null;
  onMore: () => void;
  onDismiss: () => void;
  onPlay: (it: SetlistItem) => void;
  onAdd: (it: SetlistItem) => void;
  inSetlist: (it: SetlistItem) => boolean;
}) {
  return (
    <div className="mb-5 rounded-xl border border-accent-2/40 bg-accent-2/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-2">Suggested next</span>
        <button onClick={onDismiss} className="ml-auto text-text-faint underline">dismiss</button>
      </div>

      {suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-text-dim">
          Nothing in your favourites or setlist to pull from yet — try “more ideas” for fresh picks.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {suggestions.map(({ item, t }) => (
            <li key={item.uid} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {item.title} <span className="text-text-dim">— {item.artist}</span>
                </div>
                <div className="truncate text-xs text-text-faint">
                  {t.toKey} · {t.relationship} · play {t.chords.slice(0, -1).join(" → ")} into {t.chords[t.chords.length - 1]}
                </div>
              </div>
              <button onClick={() => onPlay(item)} className="shrink-0 rounded-lg bg-accent-2 px-3 py-1.5 text-sm font-medium text-bg">
                Play
              </button>
              <button
                onClick={() => onAdd(item)}
                disabled={inSetlist(item)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text disabled:opacity-40"
                title={inSetlist(item) ? "Already in setlist" : "Add to setlist"}
              >
                {inSetlist(item) ? "✓" : "+"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <button
        onClick={onMore}
        disabled={busy}
        className="mt-3 w-full rounded-lg border border-accent-2/50 px-3 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2 hover:text-bg disabled:opacity-50"
      >
        {busy ? "Thinking…" : "Skip — more ideas ✨"}
      </button>
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


function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2 py-0.5">{children}</span>;
}
