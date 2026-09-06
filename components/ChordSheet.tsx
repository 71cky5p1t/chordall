"use client";

import { useState } from "react";
import type { ParsedSong, Segment } from "@/lib/chordpro/parse";
import { transposeChord } from "@/lib/music/chords";
import { ChordDiagram } from "./ChordDiagram";

interface Props {
  song: ParsedSong;
  semitones: number;
  preferFlat: boolean;
  fontSize: number;
  showPiano: boolean;
  legible?: boolean;
}

interface Cell {
  chord?: string;
  text: string;
}

/**
 * Break a line's segments into word-level cells so the line can wrap while each
 * chord stays above its own word. A chord attaches to the first chunk of its
 * segment; trailing spaces ride along with each word for natural spacing.
 */
function lineToCells(segments: Segment[]): Cell[] {
  const cells: Cell[] = [];
  for (const seg of segments) {
    const chunks = seg.text.match(/\S+\s*|\s+/g);
    if (!chunks || chunks.length === 0) {
      cells.push({ chord: seg.chord, text: seg.text });
    } else {
      chunks.forEach((c, i) => cells.push({ chord: i === 0 ? seg.chord : undefined, text: c }));
    }
  }
  return cells;
}

export function ChordSheet({ song, semitones, preferFlat, fontSize, showPiano, legible }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={legible ? "sheet legible" : "sheet"} style={{ fontSize }}>
      {song.sections.map((section, si) => (
        <section key={si} className="mb-6">
          {section.label && (
            <div className="mb-1 font-sans text-xs font-semibold uppercase tracking-wider text-accent-2">
              {section.label}
            </div>
          )}
          {section.lines.map((line, li) => {
            if (line.isEmpty) return <div key={li} className="h-3" />;

            // Tablature lines keep fixed monospace spacing and scroll sideways.
            if (line.isTab) {
              return (
                <div key={li} className="tab-line">
                  {line.segments.map((seg, gi) => (
                    <span key={gi}>
                      {seg.chord && (
                        <span className="chord">
                          {transposeChord(seg.chord, semitones, preferFlat)}
                        </span>
                      )}
                      {seg.text}
                    </span>
                  ))}
                </div>
              );
            }

            const cells = lineToCells(line.segments);
            return (
              <div key={li} className="line">
                {cells.map((cell, gi) => {
                  const id = `${si}-${li}-${gi}`;
                  const chord = cell.chord
                    ? transposeChord(cell.chord, semitones, preferFlat)
                    : undefined;
                  return (
                    <span key={gi} className="cell" style={{ position: "relative" }}>
                      <span
                        className="chord"
                        onClick={
                          chord && showPiano
                            ? () => setOpenId(openId === id ? null : id)
                            : undefined
                        }
                      >
                        {chord ?? ""}
                      </span>
                      <span className="lyric">{cell.text}</span>
                      {chord && showPiano && openId === id && (
                        <span
                          style={{ position: "absolute", top: "100%", left: 0, zIndex: 50 }}
                          className="mt-1 rounded-lg border border-border-strong bg-bg-elev-2 p-2 shadow-xl"
                        >
                          <span className="mb-1 block font-sans text-xs font-semibold text-accent">
                            {chord}
                          </span>
                          <ChordDiagram chord={chord} preferFlat={preferFlat} />
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
