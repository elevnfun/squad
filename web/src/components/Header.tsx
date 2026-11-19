"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEV_LOGIN, useAuth } from "./auth";
import { shortWallet } from "@/lib/api";
import StaggeredMenu from "./staggered-menu/StaggeredMenu";
import UsernameDialog from "./UsernameDialog";

// The elevn 2.0 bar (web/DESIGN.md "Navigation", mockups in docs/design/mockups): the logo, three places (Today,
// Ranks, Chat), then the wallet: a gold "Connect wallet" for a guest, or the wallet chip joined to Winnings. "Menu +"
// is the StaggeredMenu, drawn over the bar's right edge (see elevn2.css), and holds the reading pages and a small
// Penalty Shootout link. On a phone the three places move to the bottom tab bar (TabBar.tsx).
// The bar slides away while scrolling down and returns on the way up; the owner's design file says it should stay
// put, so switching that off is this one line.
const HIDE_ON_SCROLL = true;

const PLACES = [
  { label: "Today", path: "/today" },
  { label: "Ranks", path: "/ranks" },
  { label: "Chat", path: "/chat" },
];
const MENU = [
  { label: "News", link: "/news" },
  { label: "How to play", link: "/how-to-play" },
  { label: "FAQ", link: "/faq" },
  { label: "About", link: "/about" },
  { label: "Roadmap", link: "/roadmap" },
];
// what a wallet unlocks (config.toml [blitz] and [draft]; /api/today sends the same numbers to the Today page)
const BLITZ_NEEDS = 150_000;
const DRAFT_NEEDS = 300_000;

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (change) => { const m = window.matchMedia(query); m.addEventListener("change", change); return () => m.removeEventListener("change", change); },
    () => window.matchMedia(query).matches,
    () => false);
}

// the ring on the chip: half gold once Blitz is unlocked, all gold once Draft is too
function Ring({ blitz, draft }: { blitz: boolean; draft: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" />
      {blitz && <path d="M11 2.5 A8.5 8.5 0 0 1 11 19.5" fill="none" stroke="#f2c14e" strokeWidth="2.5" />}
      {draft && <path d="M11 19.5 A8.5 8.5 0 0 1 11 2.5" fill="none" stroke="#f2c14e" strokeWidth="2.5" />}
    </svg>
  );
}

function WalletChip({ label, balance }: { label: string; balance: number | null }) {
  const { wallet, me, signOut, openUsername } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const blitz = balance != null && balance >= BLITZ_NEEDS;
  const draft = balance != null && balance >= DRAFT_NEEDS;
  const unlocked = draft ? "Blitz and Draft unlocked" : blitz ? "Blitz unlocked" : balance == null ? "Holding not shown" : "Nothing unlocked yet";

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, [open]);

  const close = (back = true) => { setOpen(false); if (back) trigger.current?.focus(); };
  const items = [
    { id: "username", label: me?.username ? "Change username" : "Pick username", run: () => { close(false); openUsername(); } },
    { id: "copy", label: copied ? "Copied" : "Copy address", run: () => {
      if (!wallet) return;
      navigator.clipboard?.writeText(wallet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); } },
    ...(me?.is_admin ? [{ id: "payouts", label: "Payouts", run: () => { close(false); router.push("/admin"); } }] : []),
    { id: "disconnect", label: "Disconnect", run: () => { close(false); signOut(); } },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const els = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? els.length - 1 : (i + (e.key === "ArrowDown" ? 1 : els.length - 1)) % els.length;
    els[next].focus();
  };

  return (
    <div className="e2-wallet" ref={box} onKeyDown={onKey}>
      <div className="e2-wchip">
        <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="e2-wallet-pop"
          aria-label={`Wallet ${label}, ${unlocked}`} onClick={() => setOpen((o) => !o)}>
          <Ring blitz={blitz} draft={draft} />
          <span className="e2-who" aria-hidden="true">{label}</span>
        </button>
        <Link href="/winnings" aria-current={pathname === "/winnings" ? "page" : undefined}>Winnings</Link>
      </div>
      {open && (
        <div id="e2-wallet-pop" className="e2-pop">
          <div className="e2-pop-hold">
            <b>{balance == null ? "Holding not shown" : `${balance.toLocaleString("en-GB")} $ELEVN`}</b>
            <span>{unlocked}</span>
          </div>
          <div role="menu" aria-label="Wallet" className="e2-wmenu">
            {items.map((it) => (
              <button key={it.id} role="menuitem" type="button" tabIndex={-1} onClick={it.run}>{it.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { wallet, token, signIn, signingIn, error, demoSignIn, me } = useAuth();
  const pathname = usePathname();
  // On the home page the opening screen has no bar: it slides in once that screen has folded away.
  const home = pathname === "/";
  const [past, setPast] = useState(false);
  // every other page: the bar slides away while scrolling down and comes back on the way up
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    if (home || !HIDE_ON_SCROLL) { setTucked(false); return; }
    let lastY = window.scrollY;
    const check = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return;
      setTucked(y > lastY && y > 72);
      lastY = y;
    };
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [home]);
  useEffect(() => {
    if (!home) return;
    const check = () => setPast(window.scrollY >= window.innerHeight * 0.7);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [home]);
  const hidden = (home && !past) || tucked;

  const phone = useMedia("(max-width: 700px)");
  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const signedIn = Boolean(wallet && token);
  const label = me?.username ?? (wallet ? shortWallet(wallet) : "");
  // on a phone the chip drops its Winnings half, so the menu carries it
  const small = [...(signedIn && phone ? [{ label: "Winnings", link: "/winnings" }] : []), { label: "Penalty Shootout", link: "/shootout" }];

  const account = signedIn ? (
    <WalletChip label={label} balance={me ? me.balance : null} />
  ) : (
    <>
      {DEV_LOGIN && <button type="button" onClick={demoSignIn} className="e2-demo">Demo</button>}
      <button type="button" onClick={signIn} disabled={signingIn} className="e2-btn e2-btn-gold e2-btn-sm e2-connect">
        {signingIn ? "Check your wallet…" : "Connect wallet"}
      </button>
    </>
  );

  return (
    <>
      <header className={`e2-nav${hidden ? " e2-nav--hidden" : ""}`}>
        <div className="e2-wrap e2-nav-in">
          <Link href={signedIn ? "/today" : "/"} className="e2-logo" aria-label="elevn home">elevn<i aria-hidden="true" /></Link>
          <nav aria-label="Main" className="e2-links">
            {PLACES.map((p) => (
              <Link key={p.path} href={p.path} aria-current={at(p.path) ? "page" : undefined}>{p.label}</Link>
            ))}
          </nav>
          <div className="e2-right">{account}</div>
        </div>
        {error && <div className="e2-nav-err-wrap"><p role="alert" className="e2-wrap e2-nav-err">{error}</p></div>}
      </header>
      {/* everywhere but the home page, content starts below the bar */}
      {!home && <div aria-hidden="true" className="e2-nav-space" />}
      <UsernameDialog />
      {/* React Bits' StaggeredMenu, themed in globals.css (.elevn-menu) and elevn2.css: "Menu +" and the reading pages */}
      <StaggeredMenu isFixed position="right" displaySocials displayItemNumbering={false}
        className={`elevn-menu ${hidden ? "elevn-menu--hidden" : ""}`}
        colors={["#131519", "#1b1e23"]} accentColor="#f2c14e" menuButtonColor="#c9ccd1" openMenuButtonColor="#f4f4f1"
        logoUrl="/favicon.ico"
        items={MENU.map((n) => ({ label: n.label, link: n.link }))}
        socialsTitle="Also" socialItems={small} />
    </>
  );
}
