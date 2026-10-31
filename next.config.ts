import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile higher up the folder tree confuses root detection.
  turbopack: { root: __dirname },
};

export default nextConfig;
