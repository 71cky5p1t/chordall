import { Suspense } from "react";
import type { Metadata } from "next";
import { Player } from "./Player";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The song's name in the browser tab, bookmarks and history.
export async function generateMetadata({ searchParams }: PageProps<"/song">): Promise<Metadata> {
  const sp = await searchParams;
  const title = first(sp.title);
  const artist = first(sp.artist);
  if (!title) return {};
  return { title: `${title}${artist ? ` — ${artist}` : ""} · Chordall` };
}

export default function SongPage() {
  return (
    <Suspense fallback={<p className="p-8 text-text-dim">Loading…</p>}>
      <Player />
    </Suspense>
  );
}
