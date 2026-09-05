"use client";

import { useEffect, useRef } from "react";

/** Scroll the window down at `speed` px/sec while `playing`, using rAF. */
export function useAutoScroll(playing: boolean, speed: number) {
  const raf = useRef<number | null>(null);
  const carry = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      carry.current += speed * dt;
      const whole = Math.floor(carry.current);
      if (whole > 0) {
        window.scrollBy(0, whole);
        carry.current -= whole;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed]);
}
