// Provider registry + aggregated search. Add new scrapers here.

import { type ChordProvider, type SearchResult, type FetchedSong } from "./types";
import { ultimateGuitar } from "./ultimate-guitar";

export const providers: ChordProvider[] = [ultimateGuitar];

const byName = new Map(providers.map((p) => [p.name, p]));

export function getProvider(name: string): ChordProvider | undefined {
  return byName.get(name);
}

/** Search every provider in parallel; failures from one don't sink the rest. */
export async function searchAll(
  query: string,
  signal?: AbortSignal,
): Promise<{ results: SearchResult[]; errors: string[] }> {
  const settled = await Promise.allSettled(
    providers.map((p) => p.search(query, signal)),
  );
  const results: SearchResult[] = [];
  const errors: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") results.push(...s.value);
    else errors.push(`${providers[i].label}: ${String(s.reason?.message ?? s.reason)}`);
  });
  return { results, errors };
}

export async function fetchSong(
  provider: string,
  id: string,
  url: string,
  signal?: AbortSignal,
): Promise<FetchedSong> {
  const p = getProvider(provider);
  if (!p) throw new Error(`unknown provider: ${provider}`);
  return p.fetchSong(id, url, signal);
}
