"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Keep the chords exactly where they are when auto-scroll starts. Playing hides
 * the site header and shrinks the toolbar; both are in the page flow, so without
 * this the lyrics you're reading jump up the screen the moment you press play.
 * Returns a ref for the element below the toolbar.
 */
export function useHoldPosition<T extends HTMLElement>(playing: boolean) {
  const ref = useRef<T | null>(null);
  const pausedTop = useRef(0);

  useLayoutEffect(() => {
    document.body.dataset.playing = playing ? "1" : "";
    const el = ref.current;
    if (!el) return;
    el.style.marginTop = "";
    const top = el.getBoundingClientRect().top + window.scrollY;
    if (!playing) {
      pausedTop.current = top;
    } else if (pausedTop.current > top) {
      el.style.marginTop = `${pausedTop.current - top}px`;
    }
  });

  // Chrome's scroll anchoring would correct the same shift a second time, and
  // Safari has none: switch it off so both behave the same here.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("overflow-anchor", "none");
    return () => {
      root.style.removeProperty("overflow-anchor");
      delete document.body.dataset.playing;
    };
  }, []);

  return ref;
}
