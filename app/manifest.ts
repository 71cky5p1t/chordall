import type { MetadataRoute } from "next";

// Web app manifest so "Add to Home Screen" installs Chordall as a standalone
// full-screen app (no browser chrome) on iOS and Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chordall",
    short_name: "Chordall",
    description: "Chords & lyrics that follow along — with setlists and seamless transitions.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0d12",
    theme_color: "#0c0d12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
