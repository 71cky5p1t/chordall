"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useHistory, ago, type History, type PlayedSong } from "@/components/HistoryProvider";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { UndoBar } from "@/components/UndoBar";
import { playedKeyLabel } from "@/lib/music/capo";

function songHref(s: PlayedSong) {
  const p = new URLSearchParams({ provider: s.provider, id: s.songId, url: s.url, title: s.title, artist: s.artist });
  return `/song?${p.toString()}`;
}

function searchHref(q: string) {
  return `/?${new URLSearchParams({ q }).toString()}`;
}

export default function HistoryPage() {
  const h = useHistory();
  const { add, has } = useSetlist();
  const { settings } = useSettings();
  const [sort, setSort] = useState<"recent" | "plays">("recent");
  const [undo, setUndo] = useState<{ message: string; prev: History } | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const snapshot = (): History => ({ songs: h.songs, searches: h.searches, listens: h.listens });

  const songs =
    sort === "plays" ? [...h.songs].sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt) : h.songs;
  const empty = h.songs.length === 0 && h.searches.length === 0;

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
        <div className="space-y-8">
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
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-text-dim">
                  Songs <span className="font-normal text-text-faint">({h.songs.length})</span>
                </h2>
                <div className="flex overflow-hidden rounded-lg border border-border text-xs">
                  {(["recent", "plays"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setSort(k)}
                      aria-pressed={sort === k}
                      className={`px-3 py-1.5 ${sort === k ? "bg-accent font-semibold text-bg" : "text-text-dim hover:bg-bg-elev"}`}
                    >
                      {k === "recent" ? "Recent" : "Most played"}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {songs.map((s) => {
                  const inSet = has(s.provider, s.songId);
                  const key = playedKeyLabel(s, settings.defaultTranspose, settings.instrument);
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
                        onClick={() => {
                          if (inSet) return;
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          const { key: _k, plays, firstAt, lastAt, ...item } = s;
                          add(item);
                        }}
                        disabled={inSet}
                        className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-dim hover:text-text disabled:opacity-40"
                      >
                        {inSet ? "✓ setlist" : "+ setlist"}
                      </button>
                      <button
                        onClick={() => {
                          setUndo({ message: `Removed ${s.title}`, prev: snapshot() });
                          h.removeSong(s.key);
                        }}
                        aria-label={`Remove ${s.title} from history`}
                        className="h-9 w-9 shrink-0 rounded bg-bg-elev-2 text-text-dim hover:bg-danger hover:text-bg"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {undo && <UndoBar message={undo.message} onUndo={() => h.restore(undo.prev)} onDone={dismissUndo} />}
    </main>
  );
}
