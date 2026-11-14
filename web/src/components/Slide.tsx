"use client";

// One full-screen slide of the home page. The page snaps from slide to slide (globals.css, html.slides).
// A slide fades in as it arrives (data-on) and remembers it has been shown (data-seen): after that its
// data-rise parts stay in place, and when you move on it dims behind the next slide instead of vanishing.
import { useEffect, useRef, useState } from "react";

export default function Slide({ id, label, className = "", innerClassName = "", children }: {
  id?: string; label?: string; className?: string; innerClassName?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "on" means the slide covers the middle band of the screen, which works at any slide height
    // (a ratio threshold never fires for a slide several screens tall, as on phones)
    const io = new IntersectionObserver((entries) => {
      const visible = entries[entries.length - 1].isIntersecting;
      setOn(visible);
      if (visible) setSeen(true);
    }, { rootMargin: "-30% 0px -30% 0px", threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} id={id} data-slide={label} data-on={on ? "" : undefined} data-seen={seen ? "" : undefined}
      className={`slide ${className}`}>
      <div className={`slide-inner ${innerClassName}`}>{children}</div>
    </section>
  );
}
