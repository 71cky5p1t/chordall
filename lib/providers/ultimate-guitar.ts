// Ultimate Guitar provider.
//
// UG has no public API. Every tab/search page embeds a JSON blob in
// <div class="js-store" data-content="...">. We fetch the HTML and read that
// blob rather than screen-scraping the DOM, which is far more stable. If UG
// changes their markup this is the one place to fix.

import { load } from "cheerio";
import {
  type ChordProvider,
  type SearchResult,
  type FetchedSong,
  ProviderError,
} from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getHtml(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new ProviderError(`UG responded ${res.status}`, "ultimate-guitar", undefined, res.status);
  }
  return res.text();
}

/** Extract and parse the embedded js-store JSON from a UG page. */
function extractStore(html: string): any {
  const $ = load(html);
  const raw = $("div.js-store").attr("data-content");
  if (!raw) throw new ProviderError("no js-store blob found", "ultimate-guitar");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ProviderError("failed to parse js-store JSON", "ultimate-guitar", e);
  }
}

const CHORD_TYPES = new Set(["Chords", "Ukulele Chords", "Piano"]);

// Listed in search but carry no readable body, so opening one can only fail.
const NO_CONTENT_TYPES = new Set(["Pro", "Power", "Official", "Video"]);

// UG's `type` filter for chord charts.
const CHORDS_FILTER = "300";

const words = (s: string) => s.toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Typed as "title artist": "yesterday beatles" means Yesterday, not the band's
 * biggest hit. Needs both halves, or searching "elton john" would lead with
 * songs merely called Elton John.
 */
function titleAndArtistTyped(r: SearchResult, typed: Set<string>): boolean {
  const title = new Set(words(r.title));
  const artist = new Set(words(r.artist));
  const rest = [...typed].filter((w) => !title.has(w));
  return (
    title.size > 0 &&
    [...title].every((w) => typed.has(w)) &&
    rest.length > 0 &&
    rest.every((w) => artist.has(w))
  );
}

/** One page of raw search rows, plus how many pages UG says there are. */
async function searchPage(
  query: string,
  page: number,
  type: string | null,
  signal?: AbortSignal,
): Promise<{ rows: any[]; totalPages: number }> {
  const url =
    "https://www.ultimate-guitar.com/search.php?search_type=title&value=" +
    encodeURIComponent(query) +
    `&page=${page}` +
    (type ? `&type=${type}` : "");
  const data = extractStore(await getHtml(url, signal))?.store?.page?.data;
  return { rows: data?.results ?? [], totalPages: data?.pagination?.total ?? 1 };
}

/**
 * Chord charts only: unfiltered, one popular song's tabs, bass tabs and so on
 * fill the page. One request at a time, because UG answers bursts with 503s.
 * A page that fails just ends the walk, keeping what we have so far.
 */
async function searchChordRows(query: string, pages: number, signal?: AbortSignal): Promise<any[]> {
  const rows: any[] = [];
  try {
    for (let page = 1; page <= pages; page++) {
      const { rows: found, totalPages } = await searchPage(query, page, CHORDS_FILTER, signal);
      rows.push(...found);
      if (page >= totalPages) break;
    }
  } catch {
    // Fall through with whatever was gathered.
  }
  return rows;
}

export const ultimateGuitar: ChordProvider = {
  name: "ultimate-guitar",
  label: "Ultimate Guitar",

  canFetch(url) {
    return /ultimate-guitar\.com/.test(url);
  },

  async search(query, signal, options) {
    let rows = await searchChordRows(query, options?.pages ?? 1, signal);
    // Songs with no chord chart (tab-only instrumentals) still deserve a result.
    if (rows.length === 0) {
      try {
        rows = (await searchPage(query, 1, null, signal)).rows;
      } catch (e) {
        if (e instanceof ProviderError && e.status === 404) return []; // UG's "no matches"
        throw e;
      }
    }

    const typed = new Set(words(query));
    const unique = new Map(rows.filter((r) => r?.id).map((r) => [r.id, r]));
    return [...unique.values()]
      .filter((r) => r.song_name && r.marketing_type !== "Pro" && !NO_CONTENT_TYPES.has(r.type))
      .map(
        (r): SearchResult => ({
          provider: "ultimate-guitar",
          id: String(r.id),
          url: r.tab_url,
          title: r.song_name,
          artist: r.artist_name,
          type: r.type,
          rating: r.rating,
          votes: r.votes,
          version: r.version,
          part: r.part || undefined,
        }),
      )
      // Chords first (best for our chords-over-lyrics view), then the song you
      // named, then by rating*votes.
      .sort((a, b) => {
        const ca = CHORD_TYPES.has(a.type ?? "") ? 1 : 0;
        const cb = CHORD_TYPES.has(b.type ?? "") ? 1 : 0;
        if (ca !== cb) return cb - ca;
        const ta = titleAndArtistTyped(a, typed) ? 1 : 0;
        const tb = titleAndArtistTyped(b, typed) ? 1 : 0;
        if (ta !== tb) return tb - ta;
        return (b.votes ?? 0) * (b.rating ?? 0) - (a.votes ?? 0) * (a.rating ?? 0);
      });
  },

  async fetchSong(id, url, signal) {
    const html = await getHtml(url, signal);
    const store = extractStore(html);
    const data = store?.store?.page?.data ?? {};
    const tab = data.tab ?? {};
    const content: string =
      data.tab_view?.wiki_tab?.content ?? data.wiki_tab?.content ?? "";

    if (!content) {
      throw new ProviderError("tab has no chord content", "ultimate-guitar");
    }

    const meta = data.tab_view?.meta ?? {};
    const rawVersions: any[] = data.tab_view?.versions ?? data.versions ?? [];
    const versions = rawVersions
      .filter((v) => v && v.id && v.tab_url && CHORD_TYPES.has(v.type))
      .map((v) => ({
        id: String(v.id),
        url: v.tab_url,
        type: v.type,
        version: v.version,
        rating: v.rating,
        votes: v.votes,
      }))
      .sort((a, b) => (b.votes ?? 0) * (b.rating ?? 0) - (a.votes ?? 0) * (a.rating ?? 0));

    return {
      provider: "ultimate-guitar",
      id: String(id || tab.id || ""),
      url: tab.tab_url ?? url,
      title: tab.song_name ?? "",
      artist: tab.artist_name ?? "",
      content,
      key: meta.tonality ?? tab.tonality_name ?? undefined,
      capo: meta.capo ?? undefined,
      tuning: typeof meta.tuning === "object" ? meta.tuning?.name : meta.tuning,
      difficulty: meta.difficulty ?? tab.difficulty ?? undefined,
      versions,
      currentVersion: typeof tab.version === "number" ? tab.version : undefined,
    };
  },
};
