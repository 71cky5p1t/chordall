"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll the window down at `speed` px/sec while `playing`, using rAF.
 * The auto-scroller only ever moves DOWN, so any upward movement while playing
 * must be the user — `onUserScrollUp` fires so the caller can pause.
 */
export function useAutoScroll(playing: boolean, speed: number, onUserScrollUp?: () => void) {
  const raf = useRef<number | null>(null);
  const carry = useRef(0);
  const lastY = useRef(0);
  const cb = useRef(onUserScrollUp);
  cb.current = onUserScrollUp;

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    lastY.current = window.scrollY;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      carry.current += speed * dt;
      const whole = Math.floor(carry.current);
      if (whole > 0) {
        window.scrollBy(0, whole);
        carry.current -= whole;
      }
      lastY.current = window.scrollY;
      raf.current = requestAnimationFrame(tick);
    };

    // A decrease in scrollY can't be us: the user scrolled up → stop.
    const onScroll = () => {
      const y = window.scrollY;
      if (y < lastY.current - 4) cb.current?.();
      else lastY.current = y;
    };

    raf.current = requestAnimationFrame(tick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [playing, speed]);
}
