import type { Metadata, Viewport } from "next";
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
  manifest: "/manifest.webmanifest",
  // iOS "Add to Home Screen": launch standalone, let content run under the
  // status bar (we pad with safe-area insets), and use our icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chordall",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0d12",
  width: "device-width",
  initialScale: 1,
  // It's a play-along app with its own text-size control: don't let a stray
  // pinch zoom the whole UI out and leave it stuck there. (Safari proper ignores
  // this for accessibility; the home-screen/standalone app honours it.)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // extend into the notch / home-indicator areas
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
