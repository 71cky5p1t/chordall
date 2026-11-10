"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { backfillCapo } from "@/lib/backfill-capo";
import type { SavedSetlist, SetlistItem } from "@/lib/setlist-types";

const KEY = "chordall.setlist.v1";
const SAVED_KEY = "chordall.setlists.v1";
const MAX_SAVED = 60;

type NewItem = Omit<SetlistItem, "uid">;
const sameSongs = (a: { provider: string; songId: string }[], b: { provider: string; songId: string }[]) =>
  a.length === b.length && a.every((x, i) => x.provider === b[i].provider && x.songId === b[i].songId);
const withUids = (songs: NewItem[]): SetlistItem[] =>
  songs.map((s, i) => ({ ...s, uid: `${s.provider}:${s.songId}:${Date.now().toString(36)}:${i}` }));

export function defaultSetName(at: number): string {
  return `Set · ${new Date(at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;
}

function loadSaved(): SavedSetlist[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedSetlist[])
      .filter((s) => s?.id && typeof s.name === "string" && Array.isArray(s.items) && s.savedAt > 0)
      .map((s) => ({ ...s, items: s.items.filter((p) => p?.uid && p.songId && Array.isArray(p.chords)) }))
      .filter((s) => s.items.length > 0);
  } catch {
    return [];
  }
}

interface SetlistCtx {
  items: SetlistItem[];
  add: (item: Omit<SetlistItem, "uid">) => void;
  remove: (uid: string) => void;
  move: (uid: string, dir: -1 | 1) => void;
  clear: () => void;
  /** Put back a previous list (undo). */
  restore: (items: SetlistItem[]) => void;
  /** False until saved data has loaded, so "empty" states don't flash. */
  ready: boolean;
  has: (provider: string, songId: string) => boolean;
  /** Past setlists, newest first. */
  saved: SavedSetlist[];
  /** Keep a copy of a set (the current one by default). Same songs in the
   * same order update the copy already kept rather than adding another. */
  archive: (opts?: { name?: string; performed?: boolean; songs?: NewItem[] }) => void;
  /** Replace the current setlist, keeping the old one in Past setlists. */
  replaceWith: (songs: NewItem[]) => void;
  renameSaved: (id: string, name: string) => void;
  deleteSaved: (id: string) => void;
  restoreSaved: (saved: SavedSetlist[]) => void;
}

const Ctx = createContext<SetlistCtx | null>(null);

function loadInitial(): SetlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as SetlistItem[]).filter((p) => p?.uid && p.songId && Array.isArray(p.chords));
  } catch {
    return [];
  }
}

export function SetlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [saved, setSaved] = useState<SavedSetlist[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadInitial());
    setSaved(loadSaved());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* storage may be full or unavailable */
    }
  }, [saved, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const ctrl = new AbortController();
    backfillCapo(items, ctrl.signal, (song, capo) =>
      setItems((prev) => prev.map((p) => (p.uid === song.uid ? { ...p, capo } : p))),
    );
    return () => ctrl.abort();
    // Once, for what was saved: anything added from now on knows its capo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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

  const archive: SetlistCtx["archive"] = ({ name, performed, songs } = {}) => {
    const list = songs ? withUids(songs) : items;
    if (list.length === 0) return;
    const now = Date.now();
    setSaved((prev) => {
      const same = prev.find((s) => sameSongs(s.items, list));
      const entry: SavedSetlist = same
        ? {
            ...same,
            ...(name ? { name, named: true } : {}),
            items: list,
            savedAt: now,
            performedAt: performed ? now : same.performedAt,
          }
        : {
            id: `set-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name: name || defaultSetName(now),
            named: !!name,
            items: list,
            savedAt: now,
            ...(performed ? { performedAt: now } : {}),
          };
      return [entry, ...prev.filter((s) => s.id !== entry.id)].slice(0, MAX_SAVED);
    });
  };

  const replaceWith: SetlistCtx["replaceWith"] = (songs) => {
    archive();
    setItems(withUids(songs));
  };

  // Clearing keeps a copy: it's how you get a set back weeks later.
  const clear = () => {
    archive();
    setItems([]);
  };
  const restore: SetlistCtx["restore"] = (prev) => setItems(prev);
  const has: SetlistCtx["has"] = (provider, songId) =>
    items.some((p) => p.provider === provider && p.songId === songId);

  return (
    <Ctx.Provider
      value={{
        items,
        add,
        remove,
        move,
        clear,
        restore,
        ready: hydrated,
        has,
        saved,
        archive,
        replaceWith,
        renameSaved: (id, name) =>
          setSaved((prev) =>
            prev.map((s) => (s.id === id ? { ...s, name: name.trim() || defaultSetName(s.savedAt), named: !!name.trim() } : s)),
          ),
        deleteSaved: (id) => setSaved((prev) => prev.filter((s) => s.id !== id)),
        restoreSaved: setSaved,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSetlist(): SetlistCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSetlist must be used within SetlistProvider");
  return ctx;
}
