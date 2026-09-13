"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keep the screen lit while `active`, via the Screen Wake Lock API
 * (iOS 16.4+, Android Chrome, and home-screen/standalone apps). The OS drops
 * the lock whenever the page is hidden, so we re-acquire it when the tab
 * becomes visible again. Returns whether a lock is currently held.
 */
export function useWakeLock(active: boolean): boolean {
  const lock = useRef<WakeLockSentinel | null>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || lock.current || document.visibilityState !== "visible") return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        lock.current = sentinel;
        setHeld(true);
        sentinel.addEventListener("release", () => {
          lock.current = null;
          setHeld(false);
        });
      } catch {
        // Denied (e.g. Low Power Mode) — nothing we can do; the UI just won't show "awake".
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const s = lock.current;
      lock.current = null;
      if (s) void s.release();
      setHeld(false);
    };
  }, [active]);

  return held;
}
