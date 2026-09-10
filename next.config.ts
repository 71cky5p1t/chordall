import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small Docker image.
  output: "standalone",
  // The dev-mode "N" badge sits in the bottom-left, right on top of the
  // floating "+ Speed" tap-zone. It's dev-only anyway; turn it off.
  devIndicators: false,
};

export default nextConfig;
