"use client";

// The home page's fan of league cards ("Pick your league"). The cards overlap in one flat row with the
// leftmost on top. Hovering or focusing a card lifts it to the front and moves its neighbours aside, and a
// gold shine sweeps across it once. The row squeezes to fit its column. Leagues that aren't open yet get a
// "Coming soon" badge and no link. Styles in league-fan.css.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./league-fan.css";

export interface LeagueFanItem {
  src: string;
  alt: string;
  label: string;
  href?: string;
  note?: string;
  soon?: boolean;
}

interface LeagueFanProps {
  items: LeagueFanItem[];
  cardWidth: number;
  ariaLabel: string;
}

const HEIGHT_PER_WIDTH = 1.25;   // the league art is 400 × 500
const MAX_STEP = 0.74;           // neighbours sit at most this share of a card's width apart
const MIN_STEP = 0.3;            // and at least this much; past that the cards get smaller instead
const EDGE = 16;                 // room around the row, for the shadows
const LIFT = 28;                 // how far the active card rises at full size
const NUDGE = 0.1;               // how far its neighbours move aside, as a share of the card width

interface Layout { width: number; step: number; lift: number }

// cards keep their full width while the row fits with at least MIN_STEP between them; on narrow screens
// (phones) they shrink instead, and lift less, so all of them still show
function layout(stageWidth: number, cardWidth: number, count: number): Layout {
  const row = Math.max(0, stageWidth - 2 * EDGE);
  const width = Math.min(cardWidth, row / (1 + (count - 1) * MIN_STEP));
  const room = (row - width) / Math.max(1, count - 1);
  return { width, step: Math.min(MAX_STEP * width, room), lift: (LIFT * width) / Math.max(1, cardWidth) };
}

export function LeagueFan({ items, cardWidth, ariaLabel }: LeagueFanProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);   // motion starts after the first layout, so cards appear in place

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const watch = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    if (!stageWidth || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [stageWidth, ready]);

  const { width, step, lift } = layout(stageWidth, cardWidth, items.length);
  const height = Math.round(width * HEIGHT_PER_WIDTH);
  const nudge = Math.round(width * NUDGE);

  const place = (i: number): React.CSSProperties => {
    const aside = active === null || i === active ? 0 : i < active ? -nudge : nudge;
    const x = EDGE + i * step + aside;
    const y = EDGE + (i === active ? 0 : lift);
    return { width, height, transform: `translate(${x}px, ${y}px)`, zIndex: i === active ? items.length + 1 : items.length - i };
  };

  return (
    <section className="league-fan" aria-label={ariaLabel}>
      {/* measured before the cards show, so they never jump into place */}
      <div ref={stage} className="league-fan-stage" data-ready={ready ? "" : undefined} onPointerLeave={() => setActive(null)}
        style={{ height: height + lift + 2 * EDGE, visibility: stageWidth ? "visible" : "hidden", "--card": `${width}px` } as React.CSSProperties}>
        {items.map((item, i) => {
          const shared = {
            className: "league-fan-card",
            style: place(i),
            "data-active": i === active ? "" : undefined,
            onPointerEnter: () => setActive(i),
          };
          const face = <CardFace item={item} />;
          return item.href ? (
            <Link key={item.label} href={item.href} aria-label={item.alt} {...shared}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}>{face}</Link>
          ) : (
            <div key={item.label} {...shared}>{face}</div>
          );
        })}
      </div>
    </section>
  );
}

function CardFace({ item }: { item: LeagueFanItem }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- small SVG art, nothing for next/image to optimise */}
      <img src={item.src} alt={item.href ? "" : item.alt} width={400} height={500} draggable={false} loading="lazy" decoding="async" />
      {item.soon && <span className="league-fan-soon">Coming soon</span>}
      <span className="league-fan-text" aria-hidden="true">
        <span className="league-fan-name">{item.label}</span>
        {item.note && <span className="league-fan-note">{item.note}</span>}
      </span>
      <span className="league-fan-shine" aria-hidden="true" />
    </>
  );
}
