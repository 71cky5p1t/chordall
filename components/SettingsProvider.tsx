"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Settings {
  fontScale: number; // multiplies the sheet base size
  legibleFont: boolean; // high-legibility font + extra spacing so D/B/G are distinct
  autoAdvance: boolean; // auto-move to next song at the end
  autoAdvanceSeconds: number;
  defaultTranspose: number; // auto-applied semitone shift on load (e.g. -3)
  pianoVoicings: boolean; // show piano voicings (always on for this user)
}

const DEFAULTS: Settings = {
  fontScale: 1.15,
  legibleFont: true,
  autoAdvance: false,
  autoAdvanceSeconds: 10,
  defaultTranspose: 0,
  pianoVoicings: true,
};

const KEY = "chordall.settings.v1";

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  const update: Ctx["update"] = (patch) =>
    setSettings((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
