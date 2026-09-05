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
}
