// Layout for the site's text pages (About, How to play, Roadmap, News, FAQ).
import Link from "next/link";
import Reveal from "./Reveal";

export function InfoPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-12 py-10">
      <header className="space-y-4 border-b border-line pb-10">
        <h1 className="text-[clamp(2.25rem,6vw,3.5rem)] font-extrabold leading-[1.02] tracking-tight">{title}</h1>
        <div className="max-w-[60ch] text-lg leading-relaxed text-muted">{intro}</div>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <div className="max-w-[65ch] space-y-3 leading-relaxed text-muted [&_strong]:text-text">{children}</div>
    </Reveal>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

// A list of short titled points, set as ruled rows rather than a grid of cards.
export function Points({ items }: { items: { title: string; text: string }[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {items.map((v, i) => (
        <Reveal key={v.title} delay={i} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
          <dt className="font-bold">{v.title}</dt>
          <dd className="text-muted">{v.text}</dd>
        </Reveal>
      ))}
    </dl>
  );
}

export function PlayCta() {
  return (
    <Reveal className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-wash px-6 py-6">
      <p className="text-xl font-bold tracking-[-0.01em]">Ready to play?</p>
      <Link href="/today" className="btn btn-primary">Open Today</Link>
    </Reveal>
  );
}
