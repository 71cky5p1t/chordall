"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { songKey } from "@/lib/providers/group";
import type { SetlistItem } from "@/lib/setlist-types";

const KEY = "chordall.history.v1";
const MAX_SONGS = 300;
const MAX_SEARCHES = 60;
const MAX_LISTENS = 2000;
// Reopening a song within this long (Back and forth, switching version) is the
// same listen, not another one.
const SAME_LISTEN_MS = 30 * 60 * 1000;

export interface PlayedSong extends Omit<SetlistItem, "uid"> {
  /** Same for every transcription of a song, so versions count together. */
  key: string;
  plays: number;
  firstAt: number;
  lastAt: number;
  /** Mood categories from Claude, once it has sorted this song. */
  moods?: string[];
}

export interface PastSearch {
  q: string;
  count: number;
  lastAt: number;
}

/** One listen, in the order they happened: what tells you which songs you chain. */
export interface Listen {
  key: string;
  at: number;
}

export interface History {
  songs: PlayedSong[]; // most recent first
  searches: PastSearch[]; // most recent first
  listens: Listen[]; // oldest first
}

interface Ctx extends History {
  notePlayed: (song: Omit<SetlistItem, "uid">) => void;
  noteSearch: (q: string) => void;
  removeSong: (key: string) => void;
  removeSearch: (q: string) => void;
  setMoods: (moods: Record<string, string[]>) => void;
  clear: () => void;
  restore: (h: History) => void;
  ready: boolean;
}

const HistoryCtx = createContext<Ctx | null>(null);
const EMPTY: History = { songs: [], searches: [], listens: [] };

function load(): History {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const h = JSON.parse(raw) as Partial<History>;
    return {
      songs: Array.isArray(h.songs)
        ? h.songs.filter((s) => s?.key && s.songId && s.title && Array.isArray(s.chords) && s.lastAt > 0)
        : [],
      searches: Array.isArray(h.searches)
        ? h.searches.filter((s) => typeof s?.q === "string" && s.q && s.lastAt > 0)
        : [],
      listens: Array.isArray(h.listens)
        ? h.listens.filter((l) => typeof l?.key === "string" && l.at > 0)
        : [],
    };
  } catch {
    return EMPTY;
  }
}

const sameSearch = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<History>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHistory(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(history));
    } catch {
      /* storage may be full or unavailable */
    }
  }, [history, hydrated]);

  const notePlayed: Ctx["notePlayed"] = (song) => {
    const now = Date.now();
    const key = songKey(song.title, song.artist);
    setHistory((h) => {
      const prev = h.songs.find((s) => s.key === key);
      const sameListen = prev && now - prev.lastAt < SAME_LISTEN_MS;
      const entry: PlayedSong = {
        ...song,
        ...(prev?.moods ? { moods: prev.moods } : {}),
        key,
        plays: (prev?.plays ?? 0) + (sameListen ? 0 : 1),
        firstAt: prev?.firstAt ?? now,
        lastAt: now,
      };
      return {
        ...h,
        songs: [entry, ...h.songs.filter((s) => s.key !== key)].slice(0, MAX_SONGS),
        listens: sameListen ? h.listens : [...h.listens, { key, at: now }].slice(-MAX_LISTENS),
      };
    });
  };

  const noteSearch: Ctx["noteSearch"] = (raw) => {
    const q = raw.trim();
    if (!q) return;
    setHistory((h) => {
      const prev = h.searches.find((s) => sameSearch(s.q, q));
      const entry = { q, count: (prev?.count ?? 0) + 1, lastAt: Date.now() };
      return {
        ...h,
        searches: [entry, ...h.searches.filter((s) => !sameSearch(s.q, q))].slice(0, MAX_SEARCHES),
      };
    });
  };

  const value: Ctx = {
    ...history,
    notePlayed,
    noteSearch,
    removeSong: (key) =>
      setHistory((h) => ({
        ...h,
        songs: h.songs.filter((s) => s.key !== key),
        listens: h.listens.filter((l) => l.key !== key),
      })),
    removeSearch: (q) => setHistory((h) => ({ ...h, searches: h.searches.filter((s) => s.q !== q) })),
    setMoods: (moods) =>
      setHistory((h) => ({
        ...h,
        songs: h.songs.map((s) => (moods[s.key] ? { ...s, moods: moods[s.key] } : s)),
      })),
    clear: () => setHistory(EMPTY),
    restore: setHistory,
    ready: hydrated,
  };

  return <HistoryCtx.Provider value={value}>{children}</HistoryCtx.Provider>;
}

export function useHistory(): Ctx {
  const ctx = useContext(HistoryCtx);
  if (!ctx) throw new Error("useHistory must be used within HistoryProvider");
  return ctx;
}

/** "just now", "12 min ago", "yesterday", "3 days ago", then a date. */
export function ago(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
