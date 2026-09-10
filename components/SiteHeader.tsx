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
      {/* Must fit a 375px phone: an overflowing header lets iOS zoom the page
          out and leaves the bar looking narrower than the content. */}
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="text-accent text-xl leading-none">♪</span>
          <span>Chordall</span>
        </Link>
        <nav className="ml-auto flex min-w-0 items-center gap-0.5 text-sm">
          {/* The logo already goes home, so "Search" is hidden on narrow screens. */}
          <Link
            href="/"
            className="hidden rounded-md px-3 py-1.5 text-text-dim hover:bg-bg-elev hover:text-text sm:block"
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
