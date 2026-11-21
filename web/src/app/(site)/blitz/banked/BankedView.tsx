"use client";

// Matchday Blitz "Banked" screen (docs/design/mockups/banked.html, banked-page.css): the poster for one squad.
// Route /blitz/banked?day=YYYY-MM-DD&slot=N (day may be "next"). Data: GET /api/blitz/{day}/mine (signed in) and
// GET /api/blitz/{day} (fixtures, contest); the board's 5th place gives the prize line. Prize amounts are SOL only.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { api, ApiError, Board, BlitzDay, BlitzFixture, BlitzMineFull, BlitzSquad, fetchBlitzDay, fetchBlitzMineFull, sol } from "@/lib/api";
import "./banked.css";

type Load =
  | { s: "loading" }
  | { s: "down" }
  | { s: "ok"; day: BlitzDay | null; mine: BlitzMineFull; line: number | null };

const count = (n: number) => n.toLocaleString("en-GB");
const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
};
const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const posOf = (p: string) => (p === "FWD" ? "ATT" : p.toUpperCase());
function code(name: string): string {
  const w = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  return (w.length > 1 ? w.slice(0, 3).map((x) => x[0]).join("") : (w[0] ?? "").slice(0, 3)).toUpperCase();
}
const validDay = (d: string | null) => (d && (d === "next" || /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="e2-page bk">
      <div className="e2-rays" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="bk-wrap">{children}</div>
    </div>
  );
}

function Links({ boardHref = true }: { boardHref?: boolean }) {
  return (
    <div className="bk-act">
      <Link className="e2-btn e2-btn-line" href="/blitz">Back to Blitz</Link>
      {boardHref && <Link className="e2-btn e2-btn-line" href="/ranks">Open the live board</Link>}
    </div>
  );
}

// a plain card for the states that have no squad to show
function Plain({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <Shell>
      <section className="e2-glass bk-card bk-plain" aria-labelledby="bk-t">
        <h1 id="bk-t" className="bk-h1">{title}</h1>
        <p className="bk-lead">{children}</p>
        {extra}
        <Links />
      </section>
    </Shell>
  );
}

export default function BankedView() {
  const params = useSearchParams();
  const day = validDay(params.get("day"));
  const slotN = Number(params.get("slot"));
  const { wallet, token, signIn, signingIn } = useAuth();
  const signedIn = Boolean(wallet && token);
  const [load, setLoad] = useState<Load>({ s: "loading" });

  useEffect(() => {
    if (!signedIn || !token || !day) return;
    let dead = false;
    setLoad({ s: "loading" });
    (async () => {
      try {
        const [mine, dd] = await Promise.all([fetchBlitzMineFull(day, token), fetchBlitzDay(day, token).catch(() => null)]);
        let line: number | null = null;
        const id = dd?.contest?.id;
        if (id != null) {
          try {
            const b = await api<Board>(`/contests/${id}/board?limit=5`, { token });
            const fifth = b.rows.find((r) => r.place === 5);
            line = fifth ? fifth.points : null;
          } catch { line = null; }
        }
        if (!dead) setLoad({ s: "ok", day: dd, mine, line });
      } catch (e) {
        if (dead) return;
        const st = (e as ApiError).status;
        // no squads that day, or a stale session: show it as "no such squad"
        if (st === 404) setLoad({ s: "ok", day: null, mine: { squads: [], total: null, captain_points: null, place: null, entrants: 0, prize_lamports: 0, prize_sol: 0 }, line: null });
        else setLoad({ s: "down" });
      }
    })();
    return () => { dead = true; };
  }, [signedIn, token, day]);

  if (!day || !Number.isInteger(slotN) || slotN < 1 || slotN > 3) {
    return <Plain title="No such squad">This link does not point to a Blitz squad. Open Blitz to see yours.</Plain>;
  }
  if (!signedIn) {
    return (
      <Plain title="Banked results need a saved squad"
        extra={<div className="bk-act"><button type="button" className="e2-btn e2-btn-line" onClick={signIn} disabled={signingIn}>{signingIn ? "Check your wallet…" : "Connect wallet"}</button></div>}>
        A squad is banked once its points are final. Connect your wallet to see the squads you saved.
      </Plain>
    );
  }
  if (load.s === "loading") {
    return <Shell><section className="e2-glass bk-card bk-plain" aria-busy="true"><h1 className="bk-h1">Banked</h1><p className="bk-lead">Loading your squad</p></section></Shell>;
  }
  if (load.s === "down") return <Plain title="Banked">Can&apos;t reach elevn right now. Try again in a minute.</Plain>;

  const { mine, line } = load;
  const sq: BlitzSquad | undefined = mine.squads.find((s) => s.slot === slotN);
  if (!sq) return <Plain title="No such squad">You have no squad {slotN} for this Blitz matchday.</Plain>;

  const fx: BlitzFixture | undefined = load.day?.fixtures.find((f) => f.id === sq.fixture_id);
  const home = fx?.home.name ?? "Home";
  const away = fx?.away.name ?? "Away";
  const banked = sq.state === "banked";
  const cap = sq.players.find((p) => p.is_captain) ?? null;
  // the API's captain points are already doubled: show them as they are, never multiply again
  const ordered = [...sq.players].sort((a, b) => Number(b.is_captain) - Number(a.is_captain));
  const left = mine.squads.filter((s) => s.state !== "banked").length;

  // the prize if the matchday ended now: the board's own figure, else what 5th place would pay from the pot
  const contest = load.day?.contest ?? null;
  const fifth = contest ? Math.floor(contest.pot_sol * 0.05 * 1e9) : 0;
  let prize: string;
  if (mine.place == null) prize = "Your place appears once the board has your squads.";
  else if (mine.place <= 5 && mine.prize_lamports > 0) prize = `If the matchday ended now you would win ${sol(mine.prize_lamports)} SOL.`;
  else if (mine.place <= 5) prize = "You are in the prizes if the matchday ended now.";
  else prize = `If the matchday ended now you would win nothing yet.${fifth > 0 ? ` 5th place pays ${contest?.pot_estimated ? "about " : ""}${sol(fifth)} SOL.` : ""}`;
  const placeText = mine.place != null ? `${ordinal(mine.place)}${mine.entrants ? ` of ${count(mine.entrants)}` : ""}` : null;

  const rows = (
    <div className="bk-rows">
      {ordered.map((p) => {
        const hasPts = p.points != null;
        return (
          <div key={p.id} className="bk-prow">
            <span className="bk-pn">
              {p.is_captain ? <span className="bk-cap" aria-label="Captain, double points">×2</span> : <span className="bk-cap ghost" aria-hidden="true" />}
              <span className="nm">{p.name}</span>
              <span className="bk-pos">{posOf(p.position)}</span>
              {hasPts && p.is_captain && <span className="bk-x">{`C ×2 · ${Math.round((p.points! / 2) * 100) / 100} × 2`}</span>}
            </span>
            <span className="v">{hasPts ? p.points : "-"}</span>
          </div>
        );
      })}
    </div>
  );

  const fixtureLine = (
    <p className="bk-fx"><span className="bk-crest" aria-hidden="true">{code(home)}</span>{home} v {away}
      {fx?.league && <span className="bk-mut"> · {fx.league}</span>}</p>
  );

  const figure = cap ? (
    <aside className="bk-fig" aria-label={`Captain: ${cap.name}`}>
      <div className="bk-art"><img src="/blitz-captain.png" alt="" width={688} height={1024} /></div>
      <div className="bk-lab">
        <span className="bk-row2"><span className="bk-cap">×2</span><span className="bk-name">{cap.name}</span></span>
        <span className="bk-role">Captain · double points</span>
      </div>
    </aside>
  ) : null;

  return (
    <Shell>
      <section className="e2-glass bk-card" aria-labelledby="bk-t">
        <div className="bk-bar" aria-hidden="true" />
        <div className={`bk-grid${figure ? "" : " nofig"}`}>
          <div className="bk-in">
            <div className="bk-top">
              <h1 id="bk-t" className={`e2-word bk-word${banked ? "" : " off"}`}>{banked ? "Banked" : "Not banked yet"}</h1>
              <span className="bk-small bk-mut">{`Squad ${slotN} of 3 · ${banked ? "final" : sq.state === "live" ? "live" : sq.state === "full_time" ? "full time" : "kicks off " + ukTime(sq.kickoff)}`}</span>
            </div>
            {fixtureLine}
            {banked ? (
              <>
                <div className="bk-num"><span className="n">+{sq.points ?? 0}</span><span className="u">banked</span></div>
                {placeText && <p className="bk-place">{placeText}</p>}
                <p className="bk-small bk-mut bk-tight">
                  {prize}{line != null ? ` The prize line is 5th place, currently ${count(line)} pts.` : ""}
                  {left > 0 ? ` ${left === 1 ? "One squad" : `${left === 2 ? "Two" : left} squads`} still to play.` : ""}
                </p>
              </>
            ) : (
              <>
                <div className="bk-num"><span className="n">{sq.points ?? 0}</span><span className="u">points so far</span></div>
                <p className="bk-place">{sq.state === "open" ? "This squad has not kicked off." : "Full time. Points are final about 15 minutes after the whistle."}</p>
                <p className="bk-small bk-mut bk-tight">{sq.state === "live" ? "The match is live, so these points can still change. " : sq.state === "open" ? "" : "Until then these points are provisional. "}{placeText ? `You are ${placeText} on the Blitz matchday board now.` : ""}</p>
              </>
            )}
            {rows}
            <Links />
            <p className="bk-small bk-note">Banked about 15 minutes after full time. Banked points are final; later stat corrections are ignored.</p>
          </div>
          {figure}
        </div>
      </section>
    </Shell>
  );
}
