"use client";

import { useRef, useState } from "react";

/**
 * A dual-purpose stepper: one big [ −  value  + ] pill. Press either side and
 * the whole thing tilts toward it like a rocker switch. Tap the value to reset
 * (when a reset is available).
 */
export function Rocker({
  label,
  value,
  onDown,
  onUp,
  onReset,
}: {
  label?: string;
  value: string;
  onDown: () => void;
  onUp: () => void;
  onReset?: () => void;
}) {
  const [tilt, setTilt] = useState<"l" | "r" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const press = (side: "l" | "r", fn: () => void) => {
    fn();
    setTilt(side);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTilt(null), 170);
  };

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-text-faint">{label}</span>}
      <div
        className={`rocker ${tilt === "l" ? "rocker-l" : tilt === "r" ? "rocker-r" : ""}`}
        role="group"
        aria-label={label}
      >
        <button type="button" className="rocker-side" onClick={() => press("l", onDown)} aria-label={`${label ?? "value"} down`}>
          −
        </button>
        <button
          type="button"
          className="rocker-val"
          onClick={onReset}
          disabled={!onReset}
          title={onReset ? "tap to reset" : undefined}
        >
          {value}
        </button>
        <button type="button" className="rocker-side" onClick={() => press("r", onUp)} aria-label={`${label ?? "value"} up`}>
          +
        </button>
      </div>
    </div>
  );
}
