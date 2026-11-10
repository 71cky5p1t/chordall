/** The moods songs get sorted into. A fixed list, so songs group together. */
export const MOODS = [
  "Upbeat",
  "Party",
  "Anthemic",
  "Romantic",
  "Mellow",
  "Melancholy",
  "Heartbreak",
  "Nostalgic",
  "Dreamy",
  "Dark",
  "Empowering",
  "Theatrical",
] as const;

export const MOOD_EMOJI: Record<string, string> = {
  Upbeat: "☀️",
  Party: "🪩",
  Anthemic: "📣",
  Romantic: "💞",
  Mellow: "🌙",
  Melancholy: "🌧",
  Heartbreak: "💔",
  Nostalgic: "📻",
  Dreamy: "☁️",
  Dark: "🖤",
  Empowering: "💪",
  Theatrical: "🎭",
};
