"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { backfillCapo } from "@/lib/backfill-capo";
import type { SetlistItem } from "@/lib/setlist-types";

export type FavouriteItem = Omit<SetlistItem, "uid">;

const KEY = "chordall.favourites.v1";

interface Ctx {
  favourites: FavouriteItem[];
  toggle: (item: FavouriteItem) => void;
  isFavourite: (provider: string, songId: string) => boolean;
  remove: (provider: string, songId: string) => void;
  restore: (items: FavouriteItem[]) => void;
  /** False until saved data has loaded, so "empty" states don't flash. */
  ready: boolean;
}

const FavCtx = createContext<Ctx | null>(null);

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [favourites, setFavourites] = useState<FavouriteItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setFavourites((parsed as FavouriteItem[]).filter((f) => f?.songId && Array.isArray(f.chords)));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(favourites));
    } catch {
      /* ignore */
    }
  }, [favourites, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const ctrl = new AbortController();
    backfillCapo(favourites, ctrl.signal, (song, capo) =>
      setFavourites((prev) =>
        prev.map((f) =>
          f.provider === song.provider && f.songId === song.songId ? { ...f, capo } : f,
        ),
      ),
    );
    return () => ctrl.abort();
    // Once, for what was saved: anything added from now on knows its capo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const isFavourite: Ctx["isFavourite"] = (provider, songId) =>
    favourites.some((f) => f.provider === provider && f.songId === songId);

  const toggle: Ctx["toggle"] = (item) =>
    setFavourites((prev) => {
      const exists = prev.some(
        (f) => f.provider === item.provider && f.songId === item.songId,
      );
      return exists
        ? prev.filter((f) => !(f.provider === item.provider && f.songId === item.songId))
        : [...prev, item];
    });

  const remove: Ctx["remove"] = (provider, songId) =>
    setFavourites((prev) =>
      prev.filter((f) => !(f.provider === provider && f.songId === songId)),
    );

  return (
    <FavCtx.Provider value={{ favourites, toggle, isFavourite, remove, restore: setFavourites, ready: hydrated }}>
      {children}
    </FavCtx.Provider>
  );
}

export function useFavourites(): Ctx {
  const ctx = useContext(FavCtx);
  if (!ctx) throw new Error("useFavourites must be used within FavouritesProvider");
  return ctx;
}
