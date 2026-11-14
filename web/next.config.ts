import type { NextConfig } from "next";

// The browser calls /api/* on the site itself; src/middleware.ts forwards it to the Python API with its key.
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "media.api-sports.io" }] },
};

export default nextConfig;
