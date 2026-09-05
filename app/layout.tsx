import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SetlistProvider } from "@/components/SetlistProvider";
import { SettingsProvider } from "@/components/SettingsProvider";
import { FavouritesProvider } from "@/components/FavouritesProvider";
import { SiteHeader } from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chordall — chords & lyrics that follow along",
  description:
    "Search chords from anywhere, play along with lyrics + rich chords, and build setlists with seamless transitions between songs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <SettingsProvider>
          <FavouritesProvider>
            <SetlistProvider>
              <SiteHeader />
              <div className="flex-1">{children}</div>
            </SetlistProvider>
          </FavouritesProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
