"use client";

import { useEffect, useRef } from "react";

/** How many separate scroll-up gestures, within how long, count as "fighting" the scroller. */
const FIGHT_GESTURES = 3;
const FIGHT_WINDOW_MS = 4000;
/** Wheel events closer together than this belong to the same gesture (trackpad momentum). */
const WHEEL_GESTURE_GAP_MS = 300;

/**
 * Scroll the window down at `speed` px/sec while `playing`, using rAF.
 *
 * A single scroll-up just moves the view and auto-scroll carries on from there.
 * Only when the user keeps scrolling up (FIGHT_GESTURES within FIGHT_WINDOW_MS)
 * does `onUserFight` fire so the caller can pause. We listen to real input
 * (wheel / touch / keys) rather than scrollY, so layout shifts — e.g. the
 * toolbar collapsing when playback starts — never count as the user.
 * `onReachEnd` fires once per run when there's nothing left to scroll.
 */
export function useAutoScroll(
  playing: boolean,
  speed: number,
  onUserFight?: () => void,
  onReachEnd?: () => void,
) {
  const raf = useRef<number | null>(null);
  const carry = useRef(0);
  const cb = useRef(onUserFight);
  cb.current = onUserFight;
  const endCb = useRef(onReachEnd);
  endCb.current = onReachEnd;

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let ended = false;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      carry.current += speed * dt;
      const whole = Math.floor(carry.current);
      if (whole > 0) {
        window.scrollBy(0, whole);
        carry.current -= whole;
        const page = document.documentElement.scrollHeight;
        if (!ended && window.innerHeight + window.scrollY >= page - 1) {
          ended = true;
          endCb.current?.();
        }
      }
      raf.current = requestAnimationFrame(tick);
    };

    // Timestamps of recent scroll-up gestures; pause once there are enough in the window.
    let gestures: number[] = [];
    const upGesture = () => {
      const now = performance.now();
      gestures = [...gestures.filter((t) => now - t < FIGHT_WINDOW_MS), now];
      if (gestures.length >= FIGHT_GESTURES) {
        gestures = [];
        cb.current?.();
      }
    };

    let lastWheelUp = -Infinity;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return;
      const now = performance.now();
      if (now - lastWheelUp > WHEEL_GESTURE_GAP_MS) upGesture();
      lastWheelUp = now;
    };

    let touchY: number | null = null;
    let touchCounted = false;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
      touchCounted = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      // Finger moving down the screen = content scrolling up.
      if (touchY == null || y == null || touchCounted) return;
      if (y - touchY > 12) {
        touchCounted = true;
        upGesture();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") upGesture();
    };

    raf.current = requestAnimationFrame(tick);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [playing, speed]);
}
