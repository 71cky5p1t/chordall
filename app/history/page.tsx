"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHistory, ago, type History, type PlayedSong } from "@/components/HistoryProvider";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { UndoBar } from "@/components/UndoBar";
import { playedKeyLabel } from "@/lib/music/capo";
import { asSetlistSong, chains, sessions } from "@/lib/history-insights";
import { MOODS, MOOD_EMOJI } from "@/lib/moods";

function songHref(s: PlayedSong) {
  const p = new URLSearchParams({ provider: s.provider, id: s.songId, url: s.url, title: s.title, artist: s.artist });
  return `/song?${p.toString()}`;
}

function searchHref(q: string) {
  return `/?${new URLSearchParams({ q }).toString()}`;
}

function when(at: number) {
  const d = new Date(at);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

type Tab = "songs" | "moods" | "sessions";
const TABS: { id: Tab; label: string }[] = [
  { id: "songs", label: "Songs" },
  { id: "moods", label: "Moods" },
  { id: "sessions", label: "Sessions" },
];

export default function HistoryPage() {
  const h = useHistory();
  const { add, has, replaceWith, archive } = useSetlist();
  const { settings } = useSettings();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("songs");
  const [sort, setSort] = useState<"recent" | "plays">("recent");
  const [undo, setUndo] = useState<{ message: string; prev?: History } | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const snapshot = (): History => ({ songs: h.songs, searches: h.searches, listens: h.listens });

  const empty = h.songs.length === 0 && h.searches.length === 0;

  // Turn a group of played songs into the setlist; the old one is kept in Past setlists.
  const useAsSetlist = (songs: PlayedSong[]) => {
    replaceWith(songs.map(asSetlistSong));
    router.push("/setlist");
  };
  const saveAsSetlist = (songs: PlayedSong[], name?: string) => {
    archive({ songs: songs.map(asSetlistSong), name });
    setUndo({ message: "Saved to Past setlists" });
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        {h.ready && !empty && (
          <button
            onClick={() => {
              setUndo({ message: "Cleared history", prev: snapshot() });
              h.clear();
            }}
            className="text-sm text-text-faint underline hover:text-danger"
          >
            Clear all
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-text-dim">Songs you’ve opened and what you’ve searched for, on this device.</p>

      {!h.ready ? null : empty ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-text-dim">
          Nothing yet. Songs you open and searches you run will show up here.
          <div className="mt-3">
            <Link href="/" className="text-accent underline">Find songs →</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {h.searches.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-text-dim">Searches</h2>
              <div className="flex flex-wrap gap-2">
                {h.searches.map((s) => (
                  <span key={s.q} className="flex max-w-full items-center rounded-full border border-border bg-bg-elev text-sm">
                    <Link href={searchHref(s.q)} prefetch={false} className="min-w-0 truncate py-1.5 pl-3 pr-1 hover:text-accent">
                      {s.q}
                      {s.count > 1 && <span className="text-text-faint"> ×{s.count}</span>}
                    </Link>
                    <button
                      onClick={() => {
                        setUndo({ message: `Removed “${s.q}”`, prev: snapshot() });
                        h.removeSearch(s.q);
                      }}
                      aria-label={`Remove search ${s.q}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-faint hover:text-danger"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {h.songs.length > 0 && (
            <section>
              <div role="tablist" className="mb-3 flex overflow-hidden rounded-lg border border-border text-sm">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex-1 px-3 py-2 ${tab === t.id ? "bg-accent font-semibold text-bg" : "text-text-dim hover:bg-bg-elev"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "songs" && (
                <SongsTab
                  songs={h.songs}
                  sort={sort}
                  setSort={setSort}
                  keyOf={(s) => playedKeyLabel(s, settings.defaultTranspose, settings.instrument)}
                  inSetlist={(s) => has(s.provider, s.songId)}
                  onAdd={(s) => add(asSetlistSong(s))}
                  onRemove={(s) => {
                    setUndo({ message: `Removed ${s.title}`, prev: snapshot() });
                    h.removeSong(s.key);
                  }}
                />
              )}
              {tab === "moods" && <MoodsTab onUse={useAsSetlist} onSave={saveAsSetlist} />}
              {tab === "sessions" && <SessionsTab onUse={useAsSetlist} onSave={saveAsSetlist} />}
            </section>
          )}
        </div>
      )}

      {undo && (
        <UndoBar
          message={undo.message}
          onUndo={undo.prev ? () => h.restore(undo.prev!) : undefined}
          onDone={dismissUndo}
        />
      )}
    </main>
  );
}

function SongsTab({
  songs,
  sort,
  setSort,
  keyOf,
  inSetlist,
  onAdd,
  onRemove,
}: {
  songs: PlayedSong[];
  sort: "recent" | "plays";
  setSort: (s: "recent" | "plays") => void;
  keyOf: (s: PlayedSong) => string | null;
  inSetlist: (s: PlayedSong) => boolean;
  onAdd: (s: PlayedSong) => void;
  onRemove: (s: PlayedSong) => void;
}) {
  const list = sort === "plays" ? [...songs].sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt) : songs;
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm text-text-faint">{songs.length} songs</span>
        <div className="flex overflow-hidden rounded-lg border border-border text-xs">
          {(["recent", "plays"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className={`px-3 py-1.5 ${sort === k ? "bg-bg-elev-2 font-semibold text-text" : "text-text-dim hover:bg-bg-elev"}`}
            >
              {k === "recent" ? "Recent" : "Most played"}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {list.map((s) => {
          const added = inSetlist(s);
          const key = keyOf(s);
          return (
            <li key={s.key} className="flex items-center gap-3 bg-bg-elev px-4 py-3">
              <Link href={songHref(s)} prefetch={false} className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title}</div>
                <div className="truncate text-sm text-text-dim">
                  {s.artist}
                  <span className="text-text-faint">
                    {key && ` · ${key}`}
                    {` · ${s.plays === 1 ? "once" : `${s.plays}×`} · ${ago(s.lastAt)}`}
                  </span>
                </div>
              </Link>
              <button
                onClick={() => !added && onAdd(s)}
                disabled={added}
                className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-dim hover:text-text disabled:opacity-40"
              >
                {added ? "✓ setlist" : "+ setlist"}
              </button>
              <button
                onClick={() => onRemove(s)}
                aria-label={`Remove ${s.title} from history`}
                className="h-9 w-9 shrink-0 rounded bg-bg-elev-2 text-text-dim hover:bg-danger hover:text-bg"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A compact numbered run of songs, each a link. */
function SongRun({ songs }: { songs: PlayedSong[] }) {
  return (
    <ol className="mt-2 space-y-0.5 text-sm">
      {songs.map((s, i) => (
        <li key={s.key} className="flex gap-2">
          <span className="w-5 shrink-0 text-right font-mono text-xs leading-5 text-text-faint tabular-nums">{i + 1}</span>
          <Link href={songHref(s)} prefetch={false} className="min-w-0 truncate hover:text-accent">
            {s.title} <span className="text-text-dim">— {s.artist}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function GroupActions({ onUse, onSave }: { onUse: () => void; onSave: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <button onClick={onUse} className="h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-bg hover:brightness-110">
        Use as setlist
      </button>
      <button onClick={onSave} className="h-9 rounded-lg border border-border px-3 text-sm text-text-dim hover:text-text">
        Save for later
      </button>
    </div>
  );
}

type GroupProps = { onUse: (songs: PlayedSong[]) => void; onSave: (songs: PlayedSong[], name?: string) => void };

function MoodsTab({ onUse, onSave }: GroupProps) {
  const h = useHistory();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef(false);

  const unsorted = useMemo(() => h.songs.filter((s) => !s.moods), [h.songs]);

  const sort = useCallback(async () => {
    const batch = h.songs.filter((s) => !s.moods).slice(0, 60);
    if (batch.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/moods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songs: batch.map((s) => ({ key: s.key, title: s.title, artist: s.artist })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "couldn’t sort moods");
      h.setMoods(data.moods ?? {});
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [h]);

  // Sort new songs as soon as the tab opens: once per visit, so a failure
  // doesn't keep calling.
  useEffect(() => {
    if (asked.current || unsorted.length === 0) return;
    asked.current = true;
    sort();
  }, [unsorted.length, sort]);

  const groups = MOODS.map((m) => ({ mood: m, songs: h.songs.filter((s) => s.moods?.includes(m)) })).filter(
    (g) => g.songs.length > 0,
  );

  return (
    <div className="space-y-4">
      {busy && <p className="text-sm text-text-dim">Sorting {Math.min(unsorted.length, 60)} songs into moods…</p>}
      {err && (
        <p className="text-sm text-danger">
          {err}{" "}
          <button onClick={sort} className="underline">
            Try again
          </button>
        </p>
      )}
      {!busy && !err && unsorted.length > 0 && groups.length > 0 && (
        <button onClick={sort} className="text-sm text-text-dim underline">
          Sort {unsorted.length} new song{unsorted.length === 1 ? "" : "s"}
        </button>
      )}
      {groups.map((g) => (
        <div key={g.mood} className="rounded-xl border border-border bg-bg-elev px-4 py-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">
              <span aria-hidden>{MOOD_EMOJI[g.mood]} </span>
              {g.mood}
            </h3>
            <span className="text-xs text-text-faint">{g.songs.length} songs</span>
          </div>
          <SongRun songs={g.songs} />
          <GroupActions onUse={() => onUse(g.songs)} onSave={() => onSave(g.songs, g.mood)} />
        </div>
      ))}
    </div>
  );
}

function SessionsTab({ onUse, onSave }: GroupProps) {
  const h = useHistory();
  const sits = useMemo(() => sessions(h.listens, h.songs), [h.listens, h.songs]);
  const pairs = useMemo(() => chains(h.listens, h.songs).slice(0, 8), [h.listens, h.songs]);

  if (sits.length === 0 && pairs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-text-dim">
        Play a few songs in one sitting and they’ll show up here as a session you can turn into a setlist.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {pairs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-dim">You often play these together</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {pairs.map((c) => (
              <li key={`${c.from.key}>${c.to.key}`} className="flex items-center gap-3 bg-bg-elev px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {c.from.title} <span className="text-accent">→</span> {c.to.title}
                </span>
                <span className="shrink-0 text-xs text-text-faint">{c.times}×</span>
                <button
                  onClick={() => onUse([c.from, c.to])}
                  aria-label={`Use ${c.from.title} then ${c.to.title} as setlist`}
                  className="h-8 shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-dim hover:text-text"
                >
                  Setlist
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-dim">Sessions</h3>
          {sits.map((s) => (
            <div key={s.start} className="rounded-xl border border-border bg-bg-elev px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{when(s.start)}</span>
                <span className="shrink-0 text-xs text-text-faint">{s.songs.length} songs</span>
              </div>
              <SongRun songs={s.songs} />
              <GroupActions onUse={() => onUse(s.songs)} onSave={() => onSave(s.songs)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
