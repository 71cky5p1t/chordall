// Provider abstraction so we can aggregate multiple chord sources and swap
// scrapers in/out as sites change, without touching the UI.

export interface SearchResult {
  provider: string;      // "ultimate-guitar", ...
  id: string;            // provider-scoped id used to fetch full content
  url: string;           // canonical source url
  title: string;
  artist: string;
  type?: string;         // "Chords" | "Tab" | "Ukulele" | ...
  rating?: number;
  votes?: number;
}

export interface SongVersion {
  id: string;
  url: string;
  type?: string;      // "Chords" | "Tab" | "Ukulele Chords" | ...
  version?: number;   // 1, 2, 3 ... as labelled by the source
  rating?: number;
  votes?: number;
}

export interface FetchedSong {
  provider: string;
  id: string;
  url: string;
  title: string;
  artist: string;
  /** Raw song body in the provider's markup (UG [ch] tags, ChordPro, etc.). */
  content: string;
  key?: string;
  capo?: number;
  tuning?: string;
  difficulty?: string;
  /** Other transcriptions of the same song, for a version picker. */
  versions?: SongVersion[];
  /** Version number of THIS transcription (UG excludes it from `versions`). */
  currentVersion?: number;
}

export interface ChordProvider {
  name: string;
  label: string;
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
  fetchSong(id: string, url: string, signal?: AbortSignal): Promise<FetchedSong>;
  /** Whether this provider can handle a given result/url for fetching. */
  canFetch?(url: string): boolean;
}

export class ProviderError extends Error {
  constructor(message: string, readonly provider: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderError";
  }
}
