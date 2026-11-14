"use client";

// The home page's place marker (globals.css .slide-rail): a line for each slide down the right edge,
// the current one long and gold, its name on hover. Appears once you're past the opening screen.
// Clicks glide to the slide in script rather than with CSS scroll-behavior: a smooth-scrolling <html>
// would also smooth (and cut short) the jump to the top when you leave for another page.
import { useEffect, useState } from "react";

// glide to a slide, or jump when the reader prefers less motion
export function glideTo(id: string, e?: React.MouseEvent) {
  const el = document.getElementById(id);
  if (!el) return;
  e?.preventDefault();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: still ? "instant" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

interface RailItem { id: string; label: string }

export default function SlideRail() {
  const [items, setItems] = useState<RailItem[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const slides = [...document.querySelectorAll<HTMLElement>("section[data-slide][id]")];
    setItems(slides.map((s) => ({ id: s.id, label: s.dataset.slide ?? s.id })));
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => ratios.set(e.target.id, e.intersectionRatio));
      const best = [...ratios].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] > 0) setCurrent(best[0]);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    slides.forEach((s) => io.observe(s));
    const onScroll = () => setShown(window.scrollY >= window.innerHeight * 0.7);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  if (items.length < 2) return null;
  return (
    <nav aria-label="Sections of this page" className="slide-rail"
      style={{ opacity: shown ? 1 : 0, visibility: shown ? "visible" : "hidden" }}>
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} onClick={(e) => glideTo(it.id, e)} aria-current={current === it.id ? "true" : undefined} aria-label={it.label}>
          <span className="rail-label">{it.label}</span>
          <span className="rail-line" />
        </a>
      ))}
    </nav>
  );
}
