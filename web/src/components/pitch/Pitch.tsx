// The elevn pitch (DESIGN.md): sky blue with white chalk lines, the squad lined up from the
// forwards at the top down to the goalkeeper. Used on the home page and on every squad page.
import type { Position } from "@/lib/api";

export const LINES: Position[] = ["FWD", "MID", "DEF", "GK"];

export function Pitch({ rows, footer, className = "" }:
  { rows: React.ReactNode[][]; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl pitch-grass ${className}`}>
      <div className="relative px-2 py-6 sm:px-6 sm:py-8">
        <Chalk />
        <div className="relative flex min-h-[26rem] flex-col justify-between gap-5 sm:min-h-[30rem]">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-evenly gap-1">{row}</div>
          ))}
        </div>
      </div>
      {footer && <div className="relative border-t border-white/25 bg-black/25 px-5 py-3 text-sm">{footer}</div>}
    </div>
  );
}

// Half a pitch seen from behind our goal: halfway line at the top, our box at the bottom.
function Chalk() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 520" preserveAspectRatio="none"
      fill="none" stroke="white" strokeOpacity=".75" strokeWidth="2" vectorEffect="non-scaling-stroke" aria-hidden="true">
      <rect x="12" y="12" width="376" height="496" rx="2" vectorEffect="non-scaling-stroke" />
      <path d="M140 12 A60 60 0 0 0 260 12" vectorEffect="non-scaling-stroke" />
      <path d="M88 508 V398 H312 V508" vectorEffect="non-scaling-stroke" />
      <path d="M150 508 V470 H250 V508" vectorEffect="non-scaling-stroke" />
      <path d="M160 398 A48 48 0 0 1 240 398" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// A club's home kit, for shirts drawn in colour: the body, optional vertical stripes and sleeves.
export type Kit = { body: string; stripes?: string; sleeves?: string };

const SHIRT = "M13 2 L4 6 L1 15 L7 17 L8 36 H32 L33 17 L39 15 L36 6 L27 2 C25 5 15 5 13 2 Z";

// One player: a white shirt (or the club's kit, with its badge when known), the name under it and the points or
// next fixture in a navy tag (pink for the captain). `flag` marks injury news; `target` marks a valid swap.
export function Shirt({ name, points, captain, vice, note, dim, onClick, selected, badge, fixture, flag, target, kit }: {
  name: string; points?: string; captain?: boolean; vice?: boolean; note?: string; dim?: boolean;
  onClick?: () => void; selected?: boolean; badge?: string | null; fixture?: React.ReactNode;
  flag?: "injured" | "suspended" | "doubtful" | null; target?: boolean; kit?: Kit;
}) {
  const Tag = onClick ? "button" : "div";
  const stroke = selected ? "#f2c14e" : target ? "#c8961f" : "#0a0b0d";
  const clip = `shirt-${name.replace(/\W/g, "")}`;
  return (
    <Tag onClick={onClick} aria-pressed={onClick ? selected : undefined}
      className={`group flex w-[clamp(3.25rem,14.5vw,4.6rem)] flex-col items-center text-center sm:w-24 ${dim ? "opacity-55" : ""}`}>
      <span className="relative">
        <svg width="44" height="42" viewBox="0 0 40 38" aria-hidden="true"
          className={`drop-shadow-[0_2px_3px_rgba(10,42,71,.18)] transition-transform duration-150 ${onClick ? "group-hover:-translate-y-0.5" : ""}`}>
          {kit && (
            <>
              <clipPath id={clip}><path d={SHIRT} /></clipPath>
              <g clipPath={`url(#${clip})`}>
                <rect width="40" height="38" fill={kit.body} />
                {kit.stripes && [10, 18, 26].map((x) => <rect key={x} x={x} width="4" height="38" fill={kit.stripes} />)}
                {kit.sleeves && <path d="M13 2 L4 6 L1 15 L7 17 L9 7 Z M27 2 L36 6 L39 15 L33 17 L31 7 Z" fill={kit.sleeves} />}
              </g>
            </>
          )}
          <path d={SHIRT} fill={kit ? "none" : target ? "#fff3d6" : "white"} stroke={stroke}
            strokeWidth={selected || target ? 2.5 : 1.5} strokeLinejoin="round" />
        </svg>
        {badge && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={badge} alt="" width={16} height={16} className="absolute left-1/2 top-[45%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 object-contain" />
        )}
        {(captain || vice) && (
          <span className={`absolute -right-2 -top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
            captain ? "bg-highlight text-black" : "bg-black text-white"}`}>{captain ? "C" : "V"}</span>
        )}
        {flag && (
          <span title={flag === "doubtful" ? "Doubtful" : flag === "suspended" ? "Suspended" : "Injured"}
            className={`absolute -left-2 -top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white ${
              flag === "doubtful" ? "bg-[#b06a00]" : "bg-danger"}`}>!</span>
        )}
      </span>
      <span className="mt-1 w-full truncate rounded-t-md bg-white px-1 py-0.5 text-[12px] font-semibold leading-tight text-black sm:text-[13px]">{name}</span>
      {(points !== undefined || fixture) && (
        <span className={`flex w-full items-center justify-center gap-1 rounded-b-md px-1 py-0.5 text-[12px] font-bold tabular-nums sm:text-[13px] ${
          captain && points !== undefined ? "bg-highlight text-black" : "bg-black text-white"}`}>{points ?? fixture}</span>
      )}
      {note && <span className="mt-0.5 text-[11px] font-medium text-text/80">{note}</span>}
    </Tag>
  );
}

export const surname = (name: string) => name.split(" ").slice(-1)[0];

// An open place in the squad: a dashed shirt with a plus, showing the position it needs.
const NOUN: Record<string, string> = { GK: "a goalkeeper", DEF: "a defender", MID: "a midfielder", ATT: "an attacker" };

export function EmptySlot({ position, onClick, selected, target }: {
  position: string; onClick?: () => void; selected?: boolean; target?: boolean;
}) {
  return (
    <button onClick={onClick} aria-label={`Add ${NOUN[position] ?? position}`} aria-pressed={selected}
      className="group flex w-[clamp(3.25rem,14.5vw,4.6rem)] flex-col items-center text-center sm:w-24">
      <svg width="44" height="42" viewBox="0 0 40 38" aria-hidden="true" className="transition-transform duration-150 group-hover:-translate-y-0.5">
        <path d="M13 2 L4 6 L1 15 L7 17 L8 36 H32 L33 17 L39 15 L36 6 L27 2 C25 5 15 5 13 2 Z"
          fill={target ? "#fff3d6" : "rgba(255,255,255,.12)"} stroke={selected ? "#f2c14e" : target ? "#c8961f" : "rgba(255,255,255,.75)"}
          strokeWidth={selected || target ? 2.5 : 1.8} strokeDasharray={selected || target ? undefined : "3 3"} strokeLinejoin="round" />
        <path d="M20 14v12M14 20h12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="mt-1 w-full rounded-md bg-white/85 px-1 py-0.5 text-[12px] font-semibold text-black sm:text-[13px]">{position}</span>
    </button>
  );
}
