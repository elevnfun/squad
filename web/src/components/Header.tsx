"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DEV_LOGIN, useAuth } from "./auth";
import { shortWallet } from "@/lib/api";
import { Select } from "./ui";
import StaggeredMenu from "./staggered-menu/StaggeredMenu";
import UsernameDialog from "./UsernameDialog";

// A near-empty nav (after lamportrobotics.com): no bar at the top, the page's background runs under it.
// From desktop width the pages you play on sit in the bar (Leagues, Chat, How to play) and the Menu holds
// the four reading pages. On phones and tablets the Menu holds it all: the leagues and Chat as big words,
// the reading pages in a small row under them. The logo is the way home; Payouts is in the wallet menu.
type Page = { label: string; path: string };
const LEAGUES: Page[] = [
  { label: "Premier League", path: "/premier-league" },
  { label: "La Liga", path: "/la-liga" },
  { label: "Bundesliga", path: "/bundesliga" },
];
const CHAT: Page = { label: "Chat", path: "/chat" };
const HOW: Page = { label: "How to play", path: "/how-to-play" };
const READ: Page[] = [
  { label: "About", path: "/about" },
  { label: "Roadmap", path: "/roadmap" },
  { label: "News", path: "/news" },
  { label: "FAQ", path: "/faq" },
];

// true from desktop width (Tailwind's lg), where the bar has room for the links; false while rendering on the server
const WIDE = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (change) => { const m = window.matchMedia(WIDE); m.addEventListener("change", change); return () => m.removeEventListener("change", change); },
    () => window.matchMedia(WIDE).matches,
    () => false);
}

export default function Header() {
  const { wallet, token, signIn, signingIn, signOut, error, demoSignIn, me, openUsername } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // On the home page the opening screen has no header: it slides in once that screen has folded away.
  const home = pathname === "/";
  const [past, setPast] = useState(false);
  const [copied, setCopied] = useState(false);
  // on the home page the nav is bare over the hero, and a bar fades in behind it from "Pick your league" on
  const [solid, setSolid] = useState(false);
  // every other page: the nav slides away while scrolling down and comes back on the way up,
  // bare at the very top and on a blurred backing further down so it never sits on top of text
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    if (home) { setTucked(false); return; }
    let lastY = window.scrollY;
    const check = () => {
      const y = window.scrollY;
      setSolid(y > 8);
      if (Math.abs(y - lastY) < 6) return;
      setTucked(y > lastY && y > 72);
      lastY = y;
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [home]);
  useEffect(() => {
    if (!home) return;
    const check = () => {
      setPast(window.scrollY >= window.innerHeight * 0.7);
      const leagues = document.getElementById("leagues");
      setSolid(Boolean(leagues && leagues.getBoundingClientRect().top <= 80));
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [home]);
  const hidden = (home && !past) || tucked;   // the home page's opening screen has no header

  const wide = useWide();
  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const league = LEAGUES.find((l) => at(l.path))?.path ?? "";
  const menuItems = wide ? READ : [...LEAGUES, CHAT];
  const menuMore = wide ? [] : [HOW, ...READ];
  const signedIn = Boolean(wallet && token);

  const walletMenu = [
    { value: "squads", label: "My squads", tag: me ? `${me.squads.length} of ${me.squads_allowed}` : undefined },
    { value: "username", label: me?.username ? "Change username" : "Pick username" },
    { value: "copy", label: copied ? "Copied" : "Copy address" },
    ...(me?.is_admin ? [{ value: "payouts", label: "Payouts" }] : []),
    { value: "disconnect", label: "Disconnect" },
  ];
  const onWallet = (value: string) => {
    if (value === "squads") router.push("/#leagues");
    if (value === "username") openUsername();
    if (value === "payouts") router.push("/admin");
    if (value === "disconnect") signOut();
    if (value === "copy" && wallet) {
      navigator.clipboard?.writeText(wallet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
    }
  };

  const account = signedIn ? (
    <Select label="Wallet" value="" placeholder={me?.username ?? shortWallet(wallet!)} options={walletMenu} onChange={onWallet} align="right" menuWidth={200} />
  ) : (
    <>
      {DEV_LOGIN && <button onClick={demoSignIn} className="btn btn-sm text-muted hover:text-text">Demo</button>}
      <button onClick={signIn} disabled={signingIn} className="btn btn-secondary btn-sm">
        {signingIn ? "Check your wallet…" : "Sign in"}
      </button>
    </>
  );

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-20 border-b transition-[transform,background-color,border-color,backdrop-filter] duration-500 ${hidden ? "-translate-y-full" : ""} ${
        solid ? "border-line bg-bg/80 backdrop-blur-md" : "border-transparent bg-transparent"}`}>
        <div className="mx-auto flex h-[72px] max-w-[1360px] items-center gap-4 px-6 lg:gap-8 lg:px-20">
          <Link href="/" className="text-2xl font-extrabold tracking-[-0.03em]" aria-label="elevn home">
            elevn<span className="text-highlight">.</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <Select bare label="Leagues" value={league} placeholder="Leagues" menuWidth={200}
              options={LEAGUES.map((l) => ({ value: l.path, label: l.label }))} onChange={(path) => router.push(path)} />
            {[CHAT, HOW].map((n) => (
              <Link key={n.path} href={n.path} aria-current={at(n.path) ? "page" : undefined}
                className="relative inline-flex h-10 items-center rounded-full px-3 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-white/[.06] hover:text-text aria-[current=page]:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {n.label}
                {/* the page you're on: a gold dot under its name */}
                {at(n.path) && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 pr-[120px]">{account}</div>
        </div>
        {error && <p className="mx-auto max-w-[1360px] px-6 pb-2 text-sm text-danger lg:px-20">{error}</p>}
      </header>
      {/* everywhere but the home page, content starts below the nav */}
      {!home && <div aria-hidden="true" className="h-[72px]" />}
      <UsernameDialog />
      {/* React Bits' StaggeredMenu, themed in globals.css (.elevn-menu); what it holds depends on the width, see the top */}
      <StaggeredMenu isFixed position="right" displaySocials={menuMore.length > 0} displayItemNumbering={false}
        className={`elevn-menu ${hidden ? "elevn-menu--hidden" : ""}`}
        colors={["#1b1e23", "#f2c14e"]} accentColor="#f2c14e" menuButtonColor="#f4f4f1" openMenuButtonColor="#f4f4f1"
        logoUrl="/favicon.ico"
        items={menuItems.map((n) => ({ label: n.label, link: n.path }))}
        socialsTitle="Learn the game" socialItems={menuMore.map((n) => ({ label: n.label, link: n.path }))} />
    </>
  );
}
