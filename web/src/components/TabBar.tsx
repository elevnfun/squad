"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The phone's bottom tabs: the same three places as the top bar (Header.tsx). Shown at 900px and narrower
// (elevn2.css); hidden on desktop. The spacer after it keeps the last line of every page clear of the bar.
const TABS = [
  { label: "Today", path: "/today", icon: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></> },
  { label: "Ranks", path: "/ranks", icon: <><path d="M7 20V11M12 20V5M17 20v-6" /><path d="M4 20h16" /></> },
  { label: "Chat", path: "/chat", icon: <path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z" /> },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <>
      <nav className="e2-tabbar" aria-label="Main">
        {TABS.map((t) => {
          const here = pathname === t.path || pathname.startsWith(`${t.path}/`);
          return (
            <Link key={t.path} href={t.path} aria-current={here ? "page" : undefined}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
      <div aria-hidden="true" className="e2-tabbar-space" />
    </>
  );
}
