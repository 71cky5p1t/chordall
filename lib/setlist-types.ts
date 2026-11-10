import type { DetectedKey } from "@/lib/music/key";

export interface SetlistItem {
  uid: string;          // stable local id
  provider: string;
  songId: string;
  url: string;
  title: string;
  artist: string;
  /** All chord symbols in order — needed to compute transitions. */
  chords: string[];
  detectedKey: DetectedKey | null;
  sourceKey?: string;
  /** Capo fret the chords are shaped for; 0 for none, unset on older saves. */
  capo?: number;
}

/** A setlist kept for later: every set you perform, clear or swap out, or save. */
export interface SavedSetlist {
  id: string;
  name: string;
  /** False until you name it: the date stands in until then. */
  named: boolean;
  items: SetlistItem[];
  savedAt: number;
  performedAt?: number;
}

