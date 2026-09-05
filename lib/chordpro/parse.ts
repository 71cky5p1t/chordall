// Turn raw song text (Ultimate-Guitar markup, ChordPro, or plain) into a
// structured model the renderer can lay out as chords-over-lyrics.

import { isChord } from "@/lib/music/chords";

export interface Segment {
  chord?: string;
  text: string;
}

export interface SongLine {
  segments: Segment[];
  isTab?: boolean;   // monospaced tablature line
  isEmpty?: boolean;
}

export interface SongSection {
  label?: string;    // "Verse 1", "Chorus", ...
  lines: SongLine[];
}

export interface ParsedSong {
  sections: SongSection[];
  chords: string[];  // every chord symbol in order (for key detection / transitions)
}

const SECTION_RE = /^\[([^\]]{1,40})\]$/;

/**
 * Distinguish genuine ASCII tablature (which must keep fixed spacing and scroll)
 * from chord/lyric lines that merely sit inside UG's [tab] wrapper (which should
 * wrap on a phone). Real tab lines are dense with dashes / string markers.
 */
function looksLikeAsciiTab(line: string): boolean {
  const s = line.replace(/\[\/?ch\]/g, "").replace(/\[\/?tab\]/g, "");
  const dashes = (s.match(/-/g) || []).length;
  if (dashes >= 5) return true;
  // string line like "e|--0--", "G|-3-", "E|x-"
  if (/^\s*[eADGBadgb]\s*\|/.test(s) && s.includes("-")) return true;
  return false;
}

/** Detect whether the content uses UG's [ch]..[/ch] markup. */
function isUgFormat(raw: string): boolean {
  return raw.includes("[ch]") || raw.includes("[tab]");
}

export function parseSong(raw: string): ParsedSong {
  return isUgFormat(raw) ? parseUg(raw) : parseChordPro(raw);
}

// ---------------------------------------------------------------------------
// Ultimate-Guitar style: [ch]C[/ch] chords, [tab]..[/tab] blocks, [Verse] heads
// ---------------------------------------------------------------------------
/** A line made only of [ch] chords + whitespace (UG's "chord line" above lyrics). */
function isChordOnlyLine(line: string): boolean {
  if (!line.includes("[ch]")) return false;
  return line.replace(/\[ch\][\s\S]*?\[\/ch\]/g, "").trim() === "";
}

/** Each chord in a chord-line with the visual column where it starts. */
function chordColumns(line: string): { chord: string; col: number }[] {
  const out: { chord: string; col: number }[] = [];
  let i = 0;
  let col = 0;
  while (i < line.length) {
    if (line.startsWith("[ch]", i)) {
      const end = line.indexOf("[/ch]", i);
      if (end === -1) break;
      const chord = line.slice(i + 4, end);
      out.push({ chord: chord.trim(), col });
      col += chord.length;
      i = end + 5;
    } else {
      col += 1;
      i += 1;
    }
  }
  return out;
}

/**
 * Merge a UG chord-line with the lyric line beneath it, attaching each chord to
 * the word sitting at its column. This is what lets a line wrap on a phone while
 * every chord stays above the right syllable.
 */
function mergeChordLyric(chordLine: string, lyric: string, collect: string[]): Segment[] {
  const chords = chordColumns(chordLine);
  chords.forEach((c) => c.chord && collect.push(c.chord));
  if (chords.length === 0) return [{ text: lyric }];

  // Chords can sit past the end of the lyric (trailing turnaround chords). Pad the
  // lyric with spaces up to the last chord column (capped) so those chords keep
  // their spacing instead of mashing onto the final word.
  const lastCol = chords[chords.length - 1].col;
  const padTo = Math.min(lastCol + 1, lyric.length + 12);
  const text = lyric.length < padTo ? lyric.padEnd(padTo) : lyric;

  const segs: Segment[] = [];
  const first = chords[0].col;
  if (first > 0) segs.push({ text: text.slice(0, Math.min(first, text.length)) });
  for (let k = 0; k < chords.length; k++) {
    const start = Math.min(chords[k].col, text.length);
    const end = k + 1 < chords.length ? Math.min(chords[k + 1].col, text.length) : text.length;
    segs.push({ chord: chords[k].chord || undefined, text: text.slice(start, end) });
  }
  return segs;
}

function classify(line: string): "blank" | "section" | "tab" | "chords" | "text" {
  const bare = line.trim();
  if (bare === "") return "blank";
  if (SECTION_RE.test(bare) && !bare.includes("[ch]")) return "section";
  if (looksLikeAsciiTab(line)) return "tab";
  if (isChordOnlyLine(line)) return "chords";
  return "text";
}

function parseUg(raw: string): ParsedSong {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Strip [tab] wrappers up front; real tablature is detected by content.
  const rawLines = text.split("\n").map((l) => l.replace(/\[\/?tab\]/g, ""));
  const sections: SongSection[] = [];
  const allChords: string[] = [];
  let current: SongSection = { lines: [] };

  const pushSection = () => {
    if (current.lines.length || current.label) sections.push(current);
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const kind = classify(line);

    if (kind === "section") {
      pushSection();
      current = { label: SECTION_RE.exec(line.trim())![1].trim(), lines: [] };
      continue;
    }
    if (kind === "blank") {
      current.lines.push({ segments: [], isEmpty: true });
      continue;
    }
    if (kind === "tab") {
      current.lines.push({ segments: segmentUgLine(line, allChords), isTab: true });
      continue;
    }
    if (kind === "chords") {
      // If a lyric line follows, merge the two so chords sit over their words.
      const next = rawLines[i + 1];
      if (next !== undefined && classify(next) === "text") {
        current.lines.push({ segments: mergeChordLyric(line, next, allChords) });
        i++; // consumed the lyric line
      } else {
        // standalone (instrumental) chord line — render as its own chord cells
        current.lines.push({ segments: segmentUgLine(line, allChords) });
      }
      continue;
    }
    // plain text (may still carry inline [ch] chords)
    current.lines.push({ segments: segmentUgLine(line, allChords) });
  }
  pushSection();
  if (sections.length === 0) sections.push(current);
  return { sections, chords: allChords };
}

function segmentUgLine(line: string, collect: string[]): Segment[] {
  const segments: Segment[] = [];
  const re = /\[ch\]([\s\S]*?)\[\/ch\]/g;
  let lastIndex = 0;
  let pendingChord: string | undefined;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const between = line.slice(lastIndex, match.index);
    if (pendingChord !== undefined || between.length) {
      segments.push({ chord: pendingChord, text: between });
    }
    pendingChord = match[1].trim();
    if (pendingChord) collect.push(pendingChord);
    lastIndex = re.lastIndex;
  }
  const tail = line.slice(lastIndex);
  if (pendingChord !== undefined || tail.length || segments.length === 0) {
    segments.push({ chord: pendingChord, text: tail });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// ChordPro / plain: [Am] inline chords, {directives}, or "chords-above" text
// ---------------------------------------------------------------------------
function parseChordPro(raw: string): ParsedSong {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n");
  const sections: SongSection[] = [];
  const allChords: string[] = [];
  let current: SongSection = { lines: [] };

  const pushSection = () => {
    if (current.lines.length || current.label) sections.push(current);
  };

  for (const line of rawLines) {
    // ChordPro directive, e.g. {start_of_chorus}, {comment: ...}, {title: ...}
    const dir = /^\{(.+?)\}$/.exec(line.trim());
    if (dir) {
      const body = dir[1];
      const m = /^(start_of_\w+|soc|sov|sob|comment|c)\s*:?\s*(.*)$/i.exec(body);
      if (m) {
        pushSection();
        const label = m[2] || m[1].replace(/^start_of_/i, "");
        current = { label: label.trim() || undefined, lines: [] };
      }
      continue;
    }

    if (line.trim() === "") {
      current.lines.push({ segments: [], isEmpty: true });
      continue;
    }

    // Bracketed inline chords?
    if (/\[[^\]]+\]/.test(line)) {
      current.lines.push({ segments: segmentBracketLine(line, allChords) });
    } else {
      current.lines.push({ segments: [{ text: line }] });
    }
  }
  pushSection();
  if (sections.length === 0) sections.push(current);
  return { sections, chords: allChords };
}

function segmentBracketLine(line: string, collect: string[]): Segment[] {
  const segments: Segment[] = [];
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let pendingChord: string | undefined;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const token = match[1].trim();
    if (!isChord(token)) continue; // e.g. [x2] repeat markers stay in the lyric
    const between = line.slice(lastIndex, match.index);
    if (pendingChord !== undefined || between.length) {
      segments.push({ chord: pendingChord, text: between });
    }
    pendingChord = token;
    collect.push(token);
    lastIndex = re.lastIndex;
  }
  const tail = line.slice(lastIndex);
  if (pendingChord !== undefined || tail.length || segments.length === 0) {
    segments.push({ chord: pendingChord, text: tail });
  }
  return segments;
}
