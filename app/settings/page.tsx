"use client";

import { useSettings } from "@/components/SettingsProvider";

export default function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-6">
        <Row
          title="Instrument"
          desc="Show chords as piano keys, or guitar fingering diagrams (Jye mode)."
        >
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => update({ instrument: "piano" })}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                settings.instrument === "piano" ? "bg-accent text-bg" : "text-text-dim hover:bg-bg-elev"
              }`}
            >
              🎹 Piano
            </button>
            <button
              onClick={() => update({ instrument: "guitar" })}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                settings.instrument === "guitar" ? "bg-accent text-bg" : "text-text-dim hover:bg-bg-elev"
              }`}
            >
              🎸 Jye
            </button>
          </div>
        </Row>

        <Row
          title="Text size"
          desc="Overall size of the chord sheet. Bump it up if you play without glasses."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.85}
              max={1.8}
              step={0.05}
              value={settings.fontScale}
              onChange={(e) => update({ fontScale: Number(e.target.value) })}
              className="w-40 accent-accent"
            />
            <span className="w-12 text-right font-mono text-sm tabular-nums text-text-dim">
              {Math.round(settings.fontScale * 100)}%
            </span>
          </div>
        </Row>

        <Row
          title="High-legibility font"
          desc="Extra letter spacing so similar glyphs (D / B / G / 8) are easy to tell apart."
        >
          <Toggle on={settings.legibleFont} onChange={(v) => update({ legibleFont: v })} />
        </Row>

        <Row
          title="Default transpose"
          desc="Automatically shift every song by this many semitones when it loads (e.g. −3 to sing lower)."
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => update((s) => ({ defaultTranspose: Math.max(-11, s.defaultTranspose - 1) }))}
              className="h-8 w-8 rounded bg-bg-elev-2 hover:bg-bg-elev"
            >
              −
            </button>
            <span className="w-12 text-center font-mono tabular-nums">
              {settings.defaultTranspose > 0 ? `+${settings.defaultTranspose}` : settings.defaultTranspose}
            </span>
            <button
              onClick={() => update((s) => ({ defaultTranspose: Math.min(11, s.defaultTranspose + 1) }))}
              className="h-8 w-8 rounded bg-bg-elev-2 hover:bg-bg-elev"
            >
              +
            </button>
          </div>
        </Row>

        <Row
          title="Auto-advance setlist"
          desc="At the end of a song, automatically move to the next one in your setlist."
        >
          <Toggle on={settings.autoAdvance} onChange={(v) => update({ autoAdvance: v })} />
        </Row>

        {settings.autoAdvance && (
          <Row title="Auto-advance delay" desc="Seconds to wait before moving on.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={30}
                value={settings.autoAdvanceSeconds}
                onChange={(e) => update({ autoAdvanceSeconds: Number(e.target.value) })}
                className="w-40 accent-accent"
              />
              <span className="w-12 text-right font-mono text-sm tabular-nums text-text-dim">
                {settings.autoAdvanceSeconds}s
              </span>
            </div>
          </Row>
        )}

        <Row
          title="Chord diagrams"
          desc="Show a chord's shape (piano keys or guitar fingering) when you tap it."
        >
          <Toggle on={settings.pianoVoicings} onChange={(v) => update({ pianoVoicings: v })} />
        </Row>
      </div>
    </main>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-sm text-text-dim">{desc}</p>
      </div>
      <div className="shrink-0 pt-1">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 rounded-full transition ${on ? "bg-accent" : "bg-bg-elev-2"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}
