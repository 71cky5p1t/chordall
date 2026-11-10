"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/providers/types";
import { groupSongs } from "@/lib/providers/group";
import { FAVOURITE_ARTISTS, JYE_ARTISTS } from "@/lib/artists";
import { useSettings } from "@/components/SettingsProvider";
import { useHistory, ago } from "@/components/HistoryProvider";

// Song links set prefetch={false}: a list on screen shouldn't scrape every song
// in it, and prefetched pages' titles can land on whichever song you open.
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

// Search rows carry the extras; browse rows are just a link.
type Row = Pick<SearchResult, "provider" | "id" | "url" | "title" | "artist"> & Partial<SearchResult>;

function ratingLabel(r: Row) {
  if (typeof r.rating !== "number") return null;
  return `★ ${r.rating.toFixed(1)}${r.votes ? ` · ${r.votes.toLocaleString()}` : ""}`;
}

export default function Home() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [openSong, setOpenSong] = useState<string | null>(null);
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as { q: string; label: string | null; results: Row[] | null; errors: string[]; openSong?: string | null; scrollY?: number };
        setQ(saved.q ?? "");
        setLabel(saved.label ?? null);
        setResults(saved.results ?? null);
        setErrors(saved.errors ?? []);
        setOpenSong(saved.openSong ?? null);
        if (saved.results && typeof saved.scrollY === "number") {
          // Two frames: the restored list has to be laid out before it can be scrolled.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.scrollTo(0, saved.scrollY!)),
          );
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // A search linked from History: run it, then drop it from the address so
    // Back or a reload doesn't search all over again.
    const linked = new URLSearchParams(window.location.search).get("q");
    if (linked) {
      window.history.replaceState(window.history.state, "", "/");
      setQ(linked);
      runSearch(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      const prev = JSON.parse(window.sessionStorage.getItem(STORE) ?? "{}");
      // Scroll is saved on the way out (below); this keeps it until then.
      window.sessionStorage.setItem(STORE, JSON.stringify({ q, label, results, errors, openSong, scrollY: prev.scrollY }));
    } catch {
      /* ignore */
    }
  }, [hydrated, q, label, results, errors, openSong]);
  useEffect(() => {
    // Save the scroll position as we leave. Taken at the click: by the time this
    // page unmounts, the router has already scrolled to the top of the next one.
    let leavingY: number | null = null;
    const noteClick = () => {
      leavingY = window.scrollY;
    };
    const save = (y: number) => {
      try {
        const raw = window.sessionStorage.getItem(STORE);
        if (!raw) return;
        const saved = JSON.parse(raw);
        saved.scrollY = y;
        window.sessionStorage.setItem(STORE, JSON.stringify(saved));
      } catch {
        /* ignore */
      }
    };
    const onHide = () => save(window.scrollY);
    document.addEventListener("click", noteClick, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      if (leavingY !== null) save(leavingY);
      document.removeEventListener("click", noteClick, true);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Land ready to type on a computer. On a phone that would throw the keyboard
  // over the artist chips before anyone's asked for it.
  useEffect(() => {
    if (!hydrated || results) return;
    if (window.matchMedia("(hover: hover)").matches) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Only the newest search or browse may show: a slow earlier one mustn't land
  // on top of it.
  const inFlight = useRef<AbortController | null>(null);
  const startRequest = () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    return ctrl;
  };

  const songs = useMemo(() => groupSongs(results ?? []), [results]);

  const { settings, update } = useSettings();
  const history = useHistory();
  const { noteSearch } = history;
  const isJye = settings.instrument === "guitar";
  const artistList = isJye ? JYE_ARTISTS : FAVOURITE_ARTISTS;

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const ctrl = startRequest();
    setLoading(true);
    setErr(null);
    setResults(null);
    setOpenSong(null);
    setBusyCat(null);
    setLabel(`Results for “${query.trim()}”`);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "search failed");
      setResults(data.results);
      setErrors(data.errors ?? []);
      // Only searches that found something are worth coming back to.
      if (data.results?.length) noteSearch(query);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      if (inFlight.current === ctrl) setLoading(false);
    }
    // noteSearch only uses a state updater, so the first one is as good as any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    inputRef.current?.blur(); // put the phone keyboard away so the results show
    runSearch(q);
  };

  const onArtist = (name: string) => {
    setQ(name);
    runSearch(name);
  };

  const onCategory = async (id: string, catLabel: string) => {
    const ctrl = startRequest();
    setBusyCat(id);
    setErr(null);
    setResults(null);
    setOpenSong(null);
    setLoading(false);
    setLabel(`${catLabel} picks`);
    try {
      const res = await fetch(
        `/api/browse?category=${encodeURIComponent(id)}${isJye ? "&allowCountry=1" : ""}`,
        { signal: ctrl.signal },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "couldn’t load category");
      setResults(data.items);
      setErrors([]);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setErr(String(e instanceof Error ? e.message : e));
      setLabel(null);
    } finally {
      if (inFlight.current === ctrl) setBusyCat(null);
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
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a song or artist…"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg-elev px-4 py-3 text-base outline-none placeholder:text-text-faint focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-5 py-3 font-semibold text-bg transition hover:brightness-110"
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
          {history.ready && (history.searches.length > 0 || history.songs.length > 0) && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-text-dim">Recent</h2>
                <Link href="/history" className="text-xs text-text-faint underline hover:text-text">
                  All history →
                </Link>
              </div>
              {history.searches.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {history.searches.slice(0, 8).map((s) => (
                    <button
                      key={s.q}
                      onClick={() => onArtist(s.q)}
                      className="max-w-full truncate rounded-full border border-border bg-bg-elev px-3 py-1.5 text-sm text-text-dim transition hover:border-accent hover:text-accent"
                    >
                      <span aria-hidden className="text-text-faint">⌕ </span>
                      {s.q}
                    </button>
                  ))}
                </div>
              )}
              {history.songs.length > 0 && (
                <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {history.songs.slice(0, 4).map((s) => (
                    <li key={s.key} className="bg-bg-elev">
                      <Link
                        href={songHref({ ...s, id: s.songId })}
                        prefetch={false}
                        className="flex items-baseline gap-3 px-4 py-2.5 transition hover:bg-bg-elev-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{s.title}</span>
                          <span className="text-sm text-text-dim"> — {s.artist}</span>
                        </span>
                        <span className="shrink-0 text-xs text-text-faint">{ago(s.lastAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

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
                setOpenSong(null);
                setLabel(null);
                setErr(null);
              }}
              className="text-xs text-text-faint underline hover:text-text"
            >
              ← browse
            </button>
          </div>
          {songs.length === 0 ? (
            <p className="text-center text-text-dim">No results. Try another spelling.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {songs.map(({ key, best, versions }) => {
                const open = openSong === key;
                return (
                  <li key={key} className="bg-bg-elev">
                    <div className="flex items-stretch">
                      <Link
                        href={songHref(best)}
                        prefetch={false}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-bg-elev-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{best.title}</div>
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm text-text-dim">{best.artist}</span>
                            {ratingLabel(best) && (
                              <span className="shrink-0 text-xs text-text-faint tabular-nums">
                                {ratingLabel(best)}
                              </span>
                            )}
                          </div>
                        </div>
                        {best.type && best.type !== "Chords" && (
                          <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-dim">
                            {best.type}
                          </span>
                        )}
                      </Link>
                      {versions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setOpenSong(open ? null : key)}
                          aria-expanded={open}
                          aria-label={`${versions.length} versions of ${best.title}`}
                          className="shrink-0 border-l border-border px-3 text-xs text-text-dim transition hover:bg-bg-elev-2 hover:text-text"
                        >
                          {versions.length} versions {open ? "▴" : "▾"}
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                        {versions.map((v, i) => (
                          <Link
                            key={v.id}
                            href={songHref(v)}
                            prefetch={false}
                            className="rounded-lg border border-border px-3 py-2 text-xs text-text-dim tabular-nums transition hover:border-accent hover:text-accent"
                          >
                            {[
                              `v${v.version ?? i + 1}`,
                              v.part,
                              v.type !== "Chords" ? v.type : null,
                              ratingLabel(v),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
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
