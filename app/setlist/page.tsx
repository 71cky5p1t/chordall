"use client";

import { useState } from "react";
import Link from "next/link";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { transitionBetweenSongs } from "@/lib/music/transition";
import { transposeChord } from "@/lib/music/chords";
import { noteName, flatKey } from "@/lib/music/key";
import type { SetlistItem } from "@/lib/setlist-types";
import { ChordDiagram } from "@/components/ChordDiagram";

function songHref(it: SetlistItem) {
  const p = new URLSearchParams({
    provider: it.provider,
    id: it.songId,
    url: it.url,
    title: it.title,
    artist: it.artist,
  });
  return `/song?${p.toString()}`;
}

function playedKeyLabel(item: SetlistItem, dt: number): string | null {
  if (!item.detectedKey) return null;
  const pc = ((item.detectedKey.tonicPc + dt) % 12 + 12) % 12;
  return `${noteName(pc, flatKey(pc, item.detectedKey.mode))}${item.detectedKey.mode === "minor" ? "m" : ""}`;
}

export default function SetlistPage() {
  const { items, add, remove, move, clear } = useSetlist();
  const { settings } = useSettings();
  const dt = settings.defaultTranspose;
  const playChords = (chords: string[]) => chords.map((c) => transposeChord(c, dt, false));
  const [mood, setMood] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const generate = async () => {
    const m = mood.trim();
    if (!m) return;
    setGenerating(true);
    setAiError(null);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai-setlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: m, count: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      (data.items as Omit<SetlistItem, "uid">[]).forEach((it) => add(it));
      const missing = (data.missing ?? []) as { title: string; artist: string }[];
      setAiNote(
        `Added ${data.items.length} song${data.items.length === 1 ? "" : "s"}` +
          (missing.length ? ` · couldn’t find charts for: ${missing.map((x) => x.title).join(", ")}` : ""),
      );
      setMood("");
    } catch (e) {
      setAiError(String(e instanceof Error ? e.message : e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Setlist</h1>
          <p className="text-sm text-text-dim">
            Ordered songs with a bridge progression to glide between each one.
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <Link
              href="/perform"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110"
            >
              ▶ Perform
            </Link>
            <button
              onClick={clear}
              className="text-sm text-text-faint underline hover:text-danger"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* AI setlist generator */}
      <div className="mb-6 rounded-xl border border-accent-2/30 bg-accent-2/5 p-4">
        <div className="mb-2 text-sm font-semibold text-accent-2">✨ Generate a setlist by mood</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. cosy rainy Sunday, or 90s singalong bangers"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm outline-none placeholder:text-text-faint focus:border-accent-2"
          />
          <button
            onClick={generate}
            disabled={generating || !mood.trim()}
            className="rounded-lg bg-accent-2 px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {generating ? "Curating…" : "Generate"}
          </button>
        </div>
        {aiError && <p className="mt-2 text-xs text-danger">{aiError}</p>}
        {aiNote && <p className="mt-2 text-xs text-text-dim">{aiNote}</p>}
        <p className="mt-2 text-[11px] text-text-faint">
          Songs are appended to your setlist below, with transitions between them.
        </p>
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-text-dim">
          Your setlist is empty. Open a song and hit{" "}
          <span className="text-accent">+ Add to setlist</span>.
          <div className="mt-3">
            <Link href="/" className="text-accent underline">
              Find songs →
            </Link>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {items.map((it, i) => {
          const next = items[i + 1];
          const transition = next
            ? transitionBetweenSongs(playChords(it.chords), playChords(next.chords))
            : null;
          const keyLabel = playedKeyLabel(it, dt);
          return (
            <li key={it.uid}>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elev px-4 py-3">
                <span className="font-mono text-sm text-text-faint tabular-nums">
                  {i + 1}
                </span>
                <Link href={songHref(it)} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.title}</div>
                  <div className="truncate text-sm text-text-dim">
                    {it.artist}
                    {keyLabel && <span className="text-text-faint">{" · "}{keyLabel}</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(it.uid, -1)}
                    disabled={i === 0}
                    className="h-7 w-7 rounded bg-bg-elev-2 hover:bg-bg-elev disabled:opacity-30"
                    aria-label="move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(it.uid, 1)}
                    disabled={i === items.length - 1}
                    className="h-7 w-7 rounded bg-bg-elev-2 hover:bg-bg-elev disabled:opacity-30"
                    aria-label="move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => remove(it.uid)}
                    className="h-7 w-7 rounded bg-bg-elev-2 text-text-dim hover:bg-danger hover:text-bg"
                    aria-label="remove"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {transition && (
                <div className="relative ml-6 mt-1 border-l-2 border-dashed border-accent-3/50 pl-6 pb-1">
                  <div className="rounded-xl border border-accent-3/30 bg-accent-3/5 px-4 py-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-3">
                      <span>⇄ Transition</span>
                      <span className="font-normal normal-case text-text-faint">
                        {transition.fromKey} → {transition.toKey} · {transition.relationship}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                      {transition.steps.map((s, k) => (
                        <div key={k} className="flex flex-col items-start gap-1">
                          <span
                            className={`rounded-md px-2 py-1 font-mono text-sm font-bold ${
                              k === transition.steps.length - 1
                                ? "bg-accent-3 text-bg"
                                : "bg-bg-elev-2 text-accent"
                            }`}
                          >
                            {s.chord}
                          </span>
                          <ChordDiagram chord={s.chord} />
                          <span className="max-w-[8rem] text-[10px] leading-tight text-text-faint">
                            {s.role}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-text-dim">{transition.description}</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
