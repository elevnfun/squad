"use client";

import { useEffect, useRef, useState } from "react";
import LatticeLoader from "@/components/lattice-loader/LatticeLoader";
import CountUp from "@/components/count-up/CountUp";
import GlideSelect from "@/components/glide-select/GlideSelect";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every popup's keyboard and focus behaviour: focus moves in (to `initial`, else the first control), Tab stays
 *  inside, Escape closes, the page behind doesn't scroll, and focus returns where it was on close.
 *  Put the returned ref on the element with role="dialog". */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void,
  initial?: React.RefObject<HTMLElement | null>): React.RefObject<T | null> {
  const box = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initial?.current ?? box.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = scroll; before?.focus(); };
  }, [open, initial]);
  return box;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Button({ children, variant = "primary", className = "", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const style = variant === "primary" ? "btn-primary" : "btn-secondary";
  return (
    <button {...props} className={`btn btn-sm ${style} ${className}`}>
      {children}
    </button>
  );
}

// Shown while a page waits on the server or the chain.
export function Loading({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex justify-center py-12 text-muted ${className}`}>
      <LatticeLoader label={label} pattern="orbit" grid={3} shape="round" cellSize={6} gap={2} fontSize={14}
        step={90} idleOpacity={0.15} showTimer />
    </div>
  );
}

// A matchday clock: days, hours, minutes and seconds to the deadline, in big tabular figures.
export function DeadlineClock({ to, label = true }: { to: string; label?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  // the first time the clock comes into view its numbers count up from zero (React Bits CountUp),
  // aiming at where the clock will be when they land; then it ticks live
  const [counted, setCounted] = useState(false);
  const [t0, setT0] = useState<number | null>(null);   // when it came into view: the count aims at a fixed moment
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const el = box.current;
    if (!el || t0 != null) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setT0(Date.now()); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [now != null, t0]);   // eslint-disable-line react-hooks/exhaustive-deps -- set up once the clock has mounted, not every tick
  if (now == null) return <span className="text-2xl font-bold text-muted">--:--:--</span>;
  if (t0 == null) return <span ref={box} className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums text-muted">00:00<span className="text-accent/60">:00</span></span>;
  const COUNT = 1.4;
  const ms = Math.max(0, new Date(to).getTime() - (counted ? now : t0 + COUNT * 1000));
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  // each number sits in its own stable box; inside it the CountUp runs once, then the live value replaces it
  const part = (n: number, name: string, last = false) => (
    <span key={name} className="inline-block">
      {counted ? two(n) : <CountUp to={n} duration={COUNT} easing="easeOut" pad={name === "d" ? 0 : 2}
        onEnd={last ? () => setCounted(true) : undefined} />}
    </span>
  );
  return (
    <span className="flex items-baseline gap-3">
      <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {d > 0 && <>{part(d, "d")}<span className="mx-0.5 text-[15px] font-semibold text-muted">d</span> </>}
        {part(h, "h")}:{part(m, "m")}<span className="text-accent">:{part(sec, "s", true)}</span>
      </span>
      {label && <span className="hidden text-[13px] text-muted sm:inline">to the deadline</span>}
    </span>
  );
}

// The site's dropdown: React Bits' GlideSelect in the night-match colours. Long lists scroll in the menu;
// `block` makes it fill its column, `bare` drops the outline so it reads as a nav link
// (GlideSelect.css, .gs-site / .gs-block / .gs-bare).
export function Select({ value, onChange, options, label, placeholder, block = false, bare = false, size = "md", align = "left", menuWidth = 220 }: {
  value: string; onChange: (value: string) => void; options: { value: string; label: string; tag?: string }[];
  label: string; placeholder?: string; block?: boolean; bare?: boolean; size?: "sm" | "md" | "lg"; align?: "left" | "right"; menuWidth?: number;
}) {
  return (
    <GlideSelect value={value} onChange={(v) => onChange(v)} options={options} ariaLabel={label} placeholder={placeholder} showTags
      accentColor="#f2c14e" surfaceColor="#131519" highlightColor="#262a31" textColor="#f4f4f1"
      size={size} radius={16} menuWidth={menuWidth} align={align} className={`gs-site${block ? " gs-block" : ""}${bare ? " gs-bare" : ""}`} />
  );
}
