import Link from "next/link";
import Social from "./Social";

const COLUMNS = [
  { title: "Play", links: [["Premier League", "/premier-league"], ["La Liga", "/la-liga"], ["Bundesliga", "/bundesliga"], ["Chat", "/chat"]] },
  { title: "Learn", links: [["How to play", "/how-to-play"], ["FAQ", "/faq"], ["Roadmap", "/roadmap"]] },
  { title: "elevn", links: [["About", "/about"], ["News", "/news"]] },
];

export default function Footer() {
  return (
    <footer className="slide-snap-end bg-black">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-6 py-16 sm:grid-cols-[1fr_auto] lg:px-20">
        <div>
          <Link href="/" className="text-5xl font-extrabold tracking-[-0.035em]">elevn<span className="text-highlight">.</span></Link>
          <p className="mt-3 max-w-xs text-muted">Fantasy football for $ELEVN holders, on Solana.</p>
        </div>
        <nav className="grid grid-cols-3 gap-10" aria-label="Footer">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-[13px] font-medium text-muted">{c.title}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map(([label, href]) => (
                  <li key={href}><Link href={href} className="text-[15px] text-white/85 hover:text-link">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="mx-auto max-w-[1360px] px-6 lg:px-20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-4">
          <p className="text-[13px] text-muted">© {new Date().getFullYear()} elevn. Prizes are paid in SOL from trading fees on $ELEVN.</p>
          <Social className="-mr-2" />
        </div>
      </div>
    </footer>
  );
}
