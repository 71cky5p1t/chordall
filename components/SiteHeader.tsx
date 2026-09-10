"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSetlist } from "./SetlistProvider";

export function SiteHeader() {
  const { items } = useSetlist();
  const pathname = usePathname();
  if (pathname === "/perform") return null; // full-screen performance view
  return (
    <header className="site-header safe-top sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-accent text-xl leading-none">♪</span>
          <span>Chordall</span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-text-dim hover:bg-bg-elev hover:text-text"
          >
            Search
          </Link>
          <Link
            href="/favourites"
            className="rounded-md px-3 py-1.5 text-text-dim hover:bg-bg-elev hover:text-text"
          >
            Favourites
          </Link>
          <Link
            href="/setlist"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-text-dim hover:bg-bg-elev hover:text-text"
          >
            Setlist
            {items.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-bg">
                {items.length}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-md px-2.5 py-1.5 text-text-dim hover:bg-bg-elev hover:text-text"
          >
            ⚙
          </Link>
        </nav>
      </div>
    </header>
  );
}
