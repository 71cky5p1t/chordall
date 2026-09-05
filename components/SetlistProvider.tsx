"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SetlistItem } from "@/lib/setlist-types";

const KEY = "chordall.setlist.v1";

interface SetlistCtx {
  items: SetlistItem[];
  add: (item: Omit<SetlistItem, "uid">) => void;
  remove: (uid: string) => void;
  move: (uid: string, dir: -1 | 1) => void;
  clear: () => void;
  has: (provider: string, songId: string) => boolean;
}

const Ctx = createContext<SetlistCtx | null>(null);

function loadInitial(): SetlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SetlistItem[]) : [];
  } catch {
    return [];
  }
}

export function SetlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadInitial());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }, [items, hydrated]);

  const add: SetlistCtx["add"] = (item) => {
    setItems((prev) => {
      if (prev.some((p) => p.provider === item.provider && p.songId === item.songId)) {
        return prev;
      }
      const uid = `${item.provider}:${item.songId}:${prev.length}:${item.title.length}`;
      return [...prev, { ...item, uid }];
    });
  };

  const remove: SetlistCtx["remove"] = (uid) =>
    setItems((prev) => prev.filter((p) => p.uid !== uid));

  const move: SetlistCtx["move"] = (uid, dir) =>
    setItems((prev) => {
      const i = prev.findIndex((p) => p.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const clear = () => setItems([]);
  const has: SetlistCtx["has"] = (provider, songId) =>
    items.some((p) => p.provider === provider && p.songId === songId);

  return (
    <Ctx.Provider value={{ items, add, remove, move, clear, has }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSetlist(): SetlistCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSetlist must be used within SetlistProvider");
  return ctx;
}
