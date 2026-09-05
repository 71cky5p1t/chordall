"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SetlistItem } from "@/lib/setlist-types";

export type FavouriteItem = Omit<SetlistItem, "uid">;

const KEY = "chordall.favourites.v1";

interface Ctx {
  favourites: FavouriteItem[];
  toggle: (item: FavouriteItem) => void;
  isFavourite: (provider: string, songId: string) => boolean;
  remove: (provider: string, songId: string) => void;
}

const FavCtx = createContext<Ctx | null>(null);

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [favourites, setFavourites] = useState<FavouriteItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setFavourites(JSON.parse(raw));
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
    <FavCtx.Provider value={{ favourites, toggle, isFavourite, remove }}>
      {children}
    </FavCtx.Provider>
  );
}

export function useFavourites(): Ctx {
  const ctx = useContext(FavCtx);
  if (!ctx) throw new Error("useFavourites must be used within FavouritesProvider");
  return ctx;
}
