// Small pictures of the product for the four steps (home and How to play). Every number here is a
// real rule of the game: the holding requirement, the squad's shape and the prize split.
import { QUOTA, POSITIONS } from "@/lib/api";

const FRAME = "h-24 overflow-hidden rounded-xl border border-white/10";
const PODIUM = [
  { place: "2nd", share: 30, bar: "h-7 border border-accent/60 text-accent" },
  { place: "1st", share: 50, bar: "h-11 bg-accent text-accent-ink" },
  { place: "3rd", share: 20, bar: "h-5 border border-accent/60 text-accent" },
];

function Wallet() {
  return (
    <div className={`${FRAME} flex flex-col justify-between bg-surface p-4`}>
      <span className="flex items-center justify-between text-[12px] text-muted">
        Your wallet <span className="font-semibold text-link">1 squad</span>
      </span>
      <span className="text-[22px] font-bold leading-none tabular-nums">150,000 <span className="text-[13px] font-medium text-muted">$ELEVN</span></span>
    </div>
  );
}

function Signature() {
  return (
    <div className={`${FRAME} flex flex-col justify-between bg-surface p-4`}>
      <span className="text-[12px] text-muted">Signature request</span>
      <span className="flex items-end justify-between gap-4">
        <span className="flex-1 space-y-1.5">
          <span className="block h-1.5 w-full rounded-full bg-white/15" />
          <span className="block h-1.5 w-2/3 rounded-full bg-white/15" />
        </span>
        <span className="rounded-full bg-accent px-3.5 py-1 text-[12px] font-bold text-accent-ink">Sign</span>
      </span>
    </div>
  );
}

function Formation() {
  return (
    <div className={`${FRAME} pitch-grass flex flex-col justify-center gap-1.5 p-3`}>
      {[...POSITIONS].reverse().map((position) => (
        <span key={position} className="flex justify-center gap-2">
          {Array.from({ length: QUOTA[position] }, (_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-text" />)}
        </span>
      ))}
    </div>
  );
}

function Podium() {
  return (
    <div className={`${FRAME} flex items-end justify-center gap-2 bg-surface px-4 pb-0 pt-3`}>
      {PODIUM.map((p) => (
        <span key={p.place} className="flex w-14 flex-col items-center gap-1">
          <span className="text-[11px] text-muted">{p.place}</span>
          <span className={`grid w-full place-items-center rounded-t-md text-[12px] font-bold tabular-nums ${p.bar}`}>{p.share}%</span>
        </span>
      ))}
    </div>
  );
}

const VISUALS = [Wallet, Signature, Formation, Podium];

export default function StepVisual({ step }: { step: number }) {
  const Visual = VISUALS[step];
  return Visual ? <div aria-hidden="true"><Visual /></div> : null;
}
