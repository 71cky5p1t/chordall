"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { ParsedSong } from "@/lib/chordpro/parse";
import type { DetectedKey } from "@/lib/music/key";
import { jazzifySong, JAZZ_LEVELS, MAX_JAZZ } from "@/lib/music/jazzify";
import { burstSparkles } from "@/lib/sparkle";

/**
 * Shared Jazzify state for the player and perform mode. Each press steps the
 * level 1→5 then wraps back to 0 (base). Resets whenever `resetKey` changes
 * (a new song). Returns the song to display plus the button plumbing.
 */
export function useJazzify(
  parsed: ParsedSong | null,
  key: DetectedKey | null,
  enabled: boolean,
  resetKey: string | number,
) {
  const [level, setLevel] = useState(0);
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => setLevel(0), [resetKey]);

  const active = enabled ? level : 0;
  const displaySong = useMemo(
    () => (parsed ? jazzifySong(parsed, key, active) : null),
    [parsed, key, active],
  );

  const bump = (e: MouseEvent<HTMLButtonElement>) => {
    const next = level >= MAX_JAZZ ? 0 : level + 1;
    // More sparkle the jazzier it gets; a big flourish on the reset too.
    burstSparkles(e.currentTarget, next === 0 ? 28 : 10 + next * 5);
    setLevel(next);
    setShimmer(true);
    window.setTimeout(() => setShimmer(false), 950);
  };

  const label = active === 0 ? "✨ Jazzify" : `✨ Jazz ${active}/${MAX_JAZZ}`;
  const title =
    active === 0
      ? "Jazzify: press to add 7ths — keep pressing for more (5 levels, then reset)"
      : `${JAZZ_LEVELS[active]} — press for ${active >= MAX_JAZZ ? "base" : JAZZ_LEVELS[active + 1]}`;

  return { level: active, displaySong, shimmer, bump, label, title, levelName: JAZZ_LEVELS[active] };
}
