import { NextResponse, type NextRequest } from "next/server";

// Without SITE_PUBLIC the full site is private. It is served only on Vercel's preview deployments, which
// Vercel's login already locks (VERCEL_ENV is "preview" there), and on this computer. Every other address
// gets only the teaser (app/teaser), and any other path there goes back to the front page.
// SITE_PUBLIC=1 lifts all of this for the public devnet test season.
const PREVIEW = process.env.VERCEL_ENV === "preview";
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The Python API (api.elevn.fun) answers only requests carrying this key. The browser never sees it:
// /api/* on the private site is forwarded from here with the key added; public addresses get a 404.
const API_URL = process.env.API_URL ?? "http://localhost:8000";
const GATE = process.env.API_GATE_SECRET ?? "";
// The public test season: SITE_PUBLIC=1 (set on Vercel by the owner) opens the full site at every address.
// Off by default, so merging this code changes nothing until the owner flips it.
const PUBLIC = process.env.SITE_PUBLIC === "1";

// The visitor's address, as Vercel's edge saw it (it overwrites these headers, so a browser cannot fake them).
// The API uses it for the test-token faucet's per-connection limit.
function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const locked = PREVIEW || LOCAL.has(host);
  const open = PUBLIC || locked;
  if (req.nextUrl.pathname.startsWith("/api/")) {
    if (!open) return new NextResponse("Not found", { status: 404 });
    const headers = new Headers(req.headers);
    headers.set("x-elevn-gate", GATE);
    headers.delete("x-elevn-ip");   // only ever the address worked out here, never one the browser sent
    const ip = clientIp(req);
    if (ip) headers.set("x-elevn-ip", ip);
    return NextResponse.rewrite(new URL(req.nextUrl.pathname + req.nextUrl.search, API_URL), { request: { headers } });
  }
  if (open) {
    const res = NextResponse.next();
    // the locked preview links never go into search results; the public site may once it is open
    if (locked) res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  const url = req.nextUrl.clone();
  if (url.pathname !== "/") {
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  url.pathname = "/teaser";
  return NextResponse.rewrite(url);
}

// pages and /api: Next's own files and anything with a file extension (video, images, fonts) pass straight through
export const config = { matcher: ["/api/:path*", "/((?!_next/|api/|.*\\.).*)"] };
