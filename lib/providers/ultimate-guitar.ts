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
    throw new ProviderError(`UG responded ${res.status}`, "ultimate-guitar");
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

export const ultimateGuitar: ChordProvider = {
  name: "ultimate-guitar",
  label: "Ultimate Guitar",

  canFetch(url) {
    return /ultimate-guitar\.com/.test(url);
  },

  async search(query, signal) {
    const url =
      "https://www.ultimate-guitar.com/search.php?search_type=title&value=" +
      encodeURIComponent(query);
    const html = await getHtml(url, signal);
    const store = extractStore(html);
    const results: any[] = store?.store?.page?.data?.results ?? [];

    return results
      .filter((r) => r && r.id && r.song_name && r.marketing_type !== "Pro")
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
        }),
      )
      // Chords first (best for our chords-over-lyrics view), then by rating*votes.
      .sort((a, b) => {
        const ca = CHORD_TYPES.has(a.type ?? "") ? 1 : 0;
        const cb = CHORD_TYPES.has(b.type ?? "") ? 1 : 0;
        if (ca !== cb) return cb - ca;
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
