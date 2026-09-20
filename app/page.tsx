"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/providers/types";
import { FAVOURITE_ARTISTS, JYE_ARTISTS } from "@/lib/artists";
import { useSettings } from "@/components/SettingsProvider";

function songHref(r: { provider: string; id: string; url: string; title: string; artist: string }) {
  const p = new URLSearchParams({
    provider: r.provider,
    id: r.id,
    url: r.url,
    title: r.title,
    artist: r.artist,
  });
  return `/song?${p.toString()}`;
}

const CATEGORIES: { id: string; label: string }[] = [
  { id: "musicals", label: "Musicals" },
  { id: "1950s", label: "50s" },
  { id: "1960s", label: "60s" },
  { id: "1970s", label: "70s" },
  { id: "1980s", label: "80s" },
  { id: "1990s", label: "90s" },
  { id: "2000s", label: "00s" },
];

type Row = SearchResult | { provider: string; id: string; url: string; title: string; artist: string };

export default function Home() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCat, setBusyCat] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Remember the last search/browse across navigation so Back from a song
  // brings the results (and scroll position) straight back instead of a blank
  // front page. Session-scoped: gone when the tab closes.
  const STORE = "chordall.home.v1";
  // State (not a ref): the save effect must not run until the recovered values
  // have actually rendered, or it clobbers storage with the empty initial state.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as { q: string; label: string | null; results: Row[] | null; errors: string[]; scrollY?: number };
        setQ(saved.q ?? "");
        setLabel(saved.label ?? null);
        setResults(saved.results ?? null);
        setErrors(saved.errors ?? []);
        if (saved.results && typeof saved.scrollY === "number") {
          requestAnimationFrame(() => window.scrollTo(0, saved.scrollY!));
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORE, JSON.stringify({ q, label, results, errors, scrollY: window.scrollY }));
    } catch {
      /* ignore */
    }
  }, [hydrated, q, label, results, errors]);
  useEffect(() => {
    // Save the scroll position as we leave (client nav unmounts before the URL changes).
    const save = () => {
      try {
        const raw = window.sessionStorage.getItem(STORE);
        if (!raw) return;
        const saved = JSON.parse(raw);
        saved.scrollY = window.scrollY;
        window.sessionStorage.setItem(STORE, JSON.stringify(saved));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, []);

  const { settings, update } = useSettings();
  const isJye = settings.instrument === "guitar";
  const artistList = isJye ? JYE_ARTISTS : FAVOURITE_ARTISTS;

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setErr(null);
    setResults(null);
    setBusyCat(null);
    setLabel(`Results for “${query.trim()}”`);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "search failed");
      setResults(data.results);
      setErrors(data.errors ?? []);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  const onArtist = (name: string) => {
    setQ(name);
    runSearch(name);
  };

  const onCategory = async (id: string, catLabel: string) => {
    setBusyCat(id);
    setErr(null);
    setResults(null);
    setLoading(false);
    setLabel(`${catLabel} picks`);
    try {
      const res = await fetch(
        `/api/browse?category=${encodeURIComponent(id)}${isJye ? "&allowCountry=1" : ""}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "couldn’t load category");
      setResults(data.items);
      setErrors([]);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      setLabel(null);
    } finally {
      setBusyCat(null);
    }
  };

  const showBrowse = !results && !loading && !busyCat;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {showBrowse && (
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Chords & lyrics that <span className="text-accent">follow along</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-text-dim">
            Search across the web for the richest chords, play along with
            auto-scroll, transpose to your voice, and build a setlist with
            seamless transitions between songs.
          </p>
        </div>
      )}

      <form onSubmit={onSearch} className="mx-auto flex max-w-xl gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a song or artist…"
          autoFocus
          className="flex-1 rounded-xl border border-border bg-bg-elev px-4 py-3 text-base outline-none placeholder:text-text-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-5 py-3 font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

      {/* Front-page instrument selector */}
      <div className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-2 text-sm">
        <span className="text-text-faint">Mode</span>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            onClick={() => update({ instrument: "piano" })}
            className={`px-3 py-1.5 font-medium transition ${
              !isJye ? "bg-accent text-bg" : "text-text-dim hover:bg-bg-elev"
            }`}
          >
            🎹 Juncle
          </button>
          <button
            onClick={() => update({ instrument: "guitar" })}
            className={`px-3 py-1.5 font-medium transition ${
              isJye ? "bg-accent text-bg" : "text-text-dim hover:bg-bg-elev"
            }`}
          >
            🎸 Jye
          </button>
        </div>
      </div>

      {err && (
        <p className="mx-auto mt-4 max-w-xl rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      {/* Browse */}
      {showBrowse && (
        <div className="mx-auto mt-10 max-w-2xl space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-text-dim">
              {isJye ? "Jye’s artists" : "Juncle’s artists"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {artistList.map((name) => (
                <button
                  key={name}
                  onClick={() => onArtist(name)}
                  className="rounded-full border border-border bg-bg-elev px-3 py-1.5 text-sm text-text transition hover:border-accent hover:text-accent"
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-text-faint">
              {isJye ? "Guitar-friendly picks for Jye." : "Scoped from Juncle’s listening history."}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-text-dim">Browse by era & theme</h2>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onCategory(c.id, c.label)}
                  className="rounded-full border border-accent-2/40 bg-accent-2/5 px-4 py-1.5 text-sm font-medium text-accent-2 transition hover:bg-accent-2 hover:text-bg"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-text-faint">
              {isJye ? "Curated by Claude — country welcome in Jye mode." : "Curated by Claude — no country, promise."}
            </p>
          </section>
        </div>
      )}

      {(loading || busyCat) && (
        <p className="mt-10 text-center text-text-dim">
          {busyCat ? "Curating songs…" : "Searching the web…"}
        </p>
      )}

      {results && (
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            {label && <h2 className="text-sm font-semibold text-text-dim">{label}</h2>}
            <button
              onClick={() => {
                setResults(null);
                setLabel(null);
                setErr(null);
              }}
              className="text-xs text-text-faint underline hover:text-text"
            >
              ← browse
            </button>
          </div>
          {results.length === 0 ? (
            <p className="text-center text-text-dim">No results. Try another spelling.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {results.map((r, i) => (
                <li key={`${r.provider}-${r.id}-${i}`}>
                  <Link
                    href={songHref(r)}
                    className="flex items-center gap-3 bg-bg-elev px-4 py-3 transition hover:bg-bg-elev-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.title}</div>
                      <div className="truncate text-sm text-text-dim">{r.artist}</div>
                    </div>
                    {"type" in r && r.type && (
                      <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-dim">
                        {r.type}
                      </span>
                    )}
                    {"rating" in r && typeof r.rating === "number" && (
                      <span className="shrink-0 text-xs text-text-faint tabular-nums">
                        ★ {r.rating.toFixed(1)}
                        {"votes" in r && r.votes ? ` · ${r.votes}` : ""}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && (
            <p className="mt-4 text-center text-xs text-text-faint">
              Some sources didn’t respond: {errors.join(" · ")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
