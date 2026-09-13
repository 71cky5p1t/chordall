"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hide-on-scroll-down / show-on-scroll-up for the top chrome. Sets
 * body[data-chrome="hidden"] so the global site header can slide away too.
 * `reveal()` brings it back (used by the ⌄ tab). Disabled while auto-scrolling.
 */
export function useAutoHide(enabled: boolean) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    lastY.current = window.scrollY;
    // No rAF throttling: the check is trivial, and rAF stalls in background /
    // hidden documents which would freeze the handler.
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (y < 24) {
        setHidden(false); // at the top: always show
        lastY.current = y;
        return;
      }
      if (dy > 6) setHidden(true); // scrolling down
      else if (dy < -6) setHidden(false); // scrolling up
      else return; // ignore jitter
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  useEffect(() => {
    document.body.dataset.chrome = hidden ? "hidden" : "";
    return () => {
      delete document.body.dataset.chrome;
    };
  }, [hidden]);

  const reveal = useCallback(() => {
    setHidden(false);
    lastY.current = window.scrollY;
  }, []);

  return { hidden, reveal };
}
