"use client";

// Rises into place the first time it scrolls into view, then stays (globals.css .reveal). `delay`
// staggers siblings in steps of 80ms. Under reduced motion it is simply there.
import { useEffect, useRef, useState } from "react";

export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }: {
  as?: React.ElementType; delay?: number; className?: string; children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} data-shown={shown ? "" : undefined} {...rest}
      style={{ "--i": delay, ...rest.style } as React.CSSProperties} className={`reveal ${className}`}>
      {children}
    </Tag>
  );
}
