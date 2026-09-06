"use client";

import { useSettings } from "./SettingsProvider";
import { PianoChord } from "./PianoChord";
import { GuitarChord } from "./GuitarChord";

/** Renders a chord as a piano voicing or a guitar fingering per the instrument setting. */
export function ChordDiagram({ chord, preferFlat = false }: { chord: string; preferFlat?: boolean }) {
  const { settings } = useSettings();
  return settings.instrument === "guitar" ? (
    <GuitarChord chord={chord} />
  ) : (
    <PianoChord chord={chord} preferFlat={preferFlat} />
  );
}
