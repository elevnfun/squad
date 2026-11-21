import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

// The Shootout goalkeeper is drawn in code until his three pose images are in public/shootout/ (see ShootoutView.tsx).
// Checked once at build time, so a missing file can never become a 404 in the browser.
const KEEPER_ART = ["ready", "dive", "catch"].every((p) => existsSync(path.join(process.cwd(), "public", "shootout", `keeper-${p}.png`)));


// The browser calls /api/* on the site itself; src/middleware.ts forwards it to the Python API with its key.
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_KEEPER_ART: KEEPER_ART ? "1" : "" },
  images: { remotePatterns: [{ protocol: "https", hostname: "media.api-sports.io" }] },
};

export default nextConfig;
