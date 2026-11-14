"use client";

// taste-skill's grid-pulse effect (src/vendor/taste-effects): a hairline grid with signals running
// along it, lighting the nodes they pass. Mounted on the element it wraps; pauses off screen and
// shows one still frame under reduced motion.
import { useEffect, useRef } from "react";

type Handle = { destroy: () => void };

export default function GridPulse({ className = "", params, children }: {
  className?: string; params?: Record<string, number>; children?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let fx: Handle | null = null, gone = false;
    import("@/vendor/taste-effects/grid-pulse/effect.js").then(({ default: effect }) => {
      if (gone || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const v = (n: string) => css.getPropertyValue(n).trim();
      fx = effect.mount(host.current, {
        palette: { bg: v("--bg"), surface: v("--surface"), ink: v("--text"), muted: v("--muted"), accent: v("--accent"), accentInk: v("--accent-ink") },
        params: { cell: 56, lineOpacity: 0.14, pulses: 8, glow: 0.8, trace: 0.7, calm: 0.5, calmX: 0.5, calmY: 0.5, ...params },
        seed: 11,
      });
    });
    return () => { gone = true; fx?.destroy(); };
  }, [params]);
  return <div ref={host} className={className}>{children}</div>;
}
