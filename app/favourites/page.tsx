"use client";

import Link from "next/link";
import { useFavourites } from "@/components/FavouritesProvider";
import { useSetlist } from "@/components/SetlistProvider";
import { useSettings } from "@/components/SettingsProvider";
import { noteName, flatKey } from "@/lib/music/key";
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
  const { favourites, remove } = useFavourites();
  const { add, has } = useSetlist();
  const { settings } = useSettings();
  const dt = settings.defaultTranspose;
  const keyLabel = (f: FavouriteItem): string | null => {
    if (!f.detectedKey) return null;
    const pc = ((f.detectedKey.tonicPc + dt) % 12 + 12) % 12;
    return `${noteName(pc, flatKey(pc, f.detectedKey.mode))}${f.detectedKey.mode === "minor" ? "m" : ""}`;
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Favourites</h1>
      <p className="mb-6 text-sm text-text-dim">Songs you’ve hearted, ready to play or drop into a setlist.</p>

      {favourites.length === 0 ? (
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
                <Link href={songHref(f)} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.title}</div>
                  <div className="truncate text-sm text-text-dim">
                    {f.artist}
                    {keyLabel(f) && <span className="text-text-faint">{" · "}{keyLabel(f)}</span>}
                  </div>
                </Link>
                <button
                  onClick={() => !inSet && add({ ...f })}
                  disabled={inSet}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-dim hover:text-text disabled:opacity-40"
                >
                  {inSet ? "✓ setlist" : "+ setlist"}
                </button>
                <button
                  onClick={() => remove(f.provider, f.songId)}
                  aria-label="Remove favourite"
                  className="h-7 w-7 rounded bg-bg-elev-2 text-text-dim hover:bg-danger hover:text-bg"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
