"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useFavourites } from "@/components/FavouritesProvider";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { UndoBar } from "@/components/UndoBar";
import { playedKeyLabel } from "@/lib/music/capo";
import type { FavouriteItem } from "@/components/FavouritesProvider";

function songHref(it: FavouriteItem) {
  const p = new URLSearchParams({
    provider: it.provider,
    id: it.songId,
    url: it.url,
    title: it.title,
    artist: it.artist,
  });
  return `/song?${p.toString()}`;
}

export default function FavouritesPage() {
  const { favourites, remove, restore, ready } = useFavourites();
  const [undo, setUndo] = useState<{ message: string; items: FavouriteItem[] } | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const { add, has } = useSetlist();
  const { settings } = useSettings();
  const keyLabel = (f: FavouriteItem) =>
    playedKeyLabel(f, settings.defaultTranspose, settings.instrument);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Favourites</h1>
      <p className="mb-6 text-sm text-text-dim">Songs you’ve hearted, ready to play or drop into a setlist.</p>

      {!ready ? null : favourites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-text-dim">
          Nothing here yet. Open a song and hit <span className="text-danger">♡ Favourite</span>.
          <div className="mt-3">
            <Link href="/" className="text-accent underline">Find songs →</Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {favourites.map((f) => {
            const inSet = has(f.provider, f.songId);
            return (
              <li key={`${f.provider}:${f.songId}`} className="flex items-center gap-3 bg-bg-elev px-4 py-3">
                <Link href={songHref(f)} prefetch={false} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.title}</div>
                  <div className="truncate text-sm text-text-dim">
                    {f.artist}
                    {keyLabel(f) && <span className="text-text-faint">{" · "}{keyLabel(f)}</span>}
                  </div>
                </Link>
                <button
                  onClick={() => !inSet && add({ ...f })}
                  disabled={inSet}
                  className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs text-text-dim hover:text-text disabled:opacity-40"
                >
                  {inSet ? "✓ setlist" : "+ setlist"}
                </button>
                <button
                  onClick={() => {
                    setUndo({ message: `Removed ${f.title}`, items: favourites });
                    remove(f.provider, f.songId);
                  }}
                  aria-label="Remove favourite"
                  className="h-9 w-9 shrink-0 rounded bg-bg-elev-2 text-text-dim hover:bg-danger hover:text-bg"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {undo && <UndoBar message={undo.message} onUndo={() => restore(undo.items)} onDone={dismissUndo} />}
    </main>
  );
}
