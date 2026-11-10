"use client";

import { useEffect } from "react";

/** "Removed X · Undo" toast (or just a note, without onUndo). Goes away by itself. */
export function UndoBar({
  message,
  onUndo,
  onDone,
}: {
  message: string;
  onUndo?: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 7000);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div role="status" className="tap-zone fixed inset-x-0 z-40 flex justify-center px-4">
      <div
        className={`flex max-w-full items-center gap-3 rounded-full border border-border-strong bg-bg-elev-2 py-1.5 pl-4 text-sm shadow-lg ${onUndo ? "pr-1.5" : "min-h-11 pr-4"}`}
      >
        <span className="min-w-0 truncate">{message}</span>
        {onUndo && (
          <button
            type="button"
            onClick={() => {
              onUndo();
              onDone();
            }}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 font-semibold text-bg"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
