"""Simulate two real gameweeks end to end on a scratch database, from the API cache (0 calls).

  python -m squad.simulate [--league premier-league] [--round 7] [--open-window]

Uses database squad_sim (dropped and rebuilt each run), real fixtures and player stats from
./cache, and real starting prices from out/prices_<league>.csv. Earlier rounds are loaded as
settled history (for form and PPG); the two rounds then run through the state machine on a
simulated clock: save squads, lock, live, settling, settled, transfers, lock, live, settled.

--open-window then moves the next round's matches to kick off in 2 days, so its transfer
window is open now: a local demo database for the website (API: DATABASE_URL=.../squad_sim).

  python -m squad.simulate --add-leagues la-liga bundesliga

adds other league areas to the existing demo database (0 calls): their season fixture list as
stored in the main database by `python -m squad.ingest fixtures`, and their starting prices
from out/prices_<league>.csv on the first open gameweek. Their gameweeks keep real dates; ones
already under way count as played, so the next one is the open transfer window.

The test squads below are built by simple rules only to drive the simulation; the product
never builds or suggests squads.
"""

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timedelta, timezone

import psycopg

from . import game, ingest
from .apifootball import Client
from .config import CFG, ROOT, launch_leagues
from .db import init_schema

SIM_DB = "squad_sim"
SQ = CFG["squad"]


def fresh_db():
    admin = psycopg.connect("postgresql://localhost:5433/postgres", autocommit=True)
    admin.execute(f"DROP DATABASE IF EXISTS {SIM_DB}")
    admin.execute(f"CREATE DATABASE {SIM_DB}")
    admin.close()
    conn = psycopg.connect(f"postgresql://localhost:5433/{SIM_DB}")
    init_schema(conn)
    return conn


def build_squad(rows, key, club_limit=SQ["max_per_club"]):
    """Greedy 15 by `key` within quota, club limit and budget (keeps enough for the cheapest
    remaining slots). rows: CSV dicts. Returns (starters, bench, captain, vice)."""
    need, clubs, picked, spent = dict(SQ["quota"]), Counter(), [], 0.0
    # reserve the 10th-cheapest price per open slot, so the club limit cannot strand the last picks
    cheapest = {p: sorted(float(r["price"]) for r in rows if r["position"] == p)[9] for p in need}
    for r in sorted(rows, key=key):
        price, pos = float(r["price"]), r["position"]
        reserve = sum(cheapest[p] * (n - (p == pos)) for p, n in need.items())
        if need[pos] and clubs[r["team_id"]] < club_limit and round(spent + price + reserve, 1) <= SQ["budget"]:
            picked.append(r)
            need[pos] -= 1
            clubs[r["team_id"]] += 1
            spent += price
    by_pos = {p: sorted((r for r in picked if r["position"] == p), key=lambda r: -float(r["ppg_blend"] or 0))
              for p in SQ["quota"]}
    xi = by_pos["GK"][:1] + by_pos["DEF"][:4] + by_pos["MID"][:4] + by_pos["FWD"][:2]
    bench = by_pos["GK"][1:] + by_pos["DEF"][4:] + by_pos["MID"][4:] + by_pos["FWD"][2:]
    ranked = sorted(xi, key=lambda r: -float(r["ppg_blend"] or 0))
    ids = lambda rs: [int(r["player_id"]) for r in rs]
    return ids(xi), ids(bench), int(ranked[0]["player_id"]), int(ranked[1]["player_id"])


def play_round(conn, client, gw):
    """The round's matches happen: cached full-time data goes in as live (not final) data."""
    ids = [r[0] for r in conn.execute("SELECT id FROM fixtures WHERE gameweek_id = %s", (gw.id,)).fetchall()]
    for fx in ingest.fetch_details(client, conn, ids):
        ingest.upsert_fixture(conn, fx)
        ingest.upsert_player_stats(conn, fx)
    conn.commit()


def run_round(conn, client, league_id, gw, log):
    gw = game.gameweek(conn, gw.id)
    final_pull = lambda c, ids: ingest.final_pull(client, c, ids, use_cache=True)
    for when, label in ((gw.first_kickoff, "first kickoff"), (None, "matches played"),
                        (game.gameweek(conn, gw.id).settles_at, "settlement time")):
        if when is None:
            play_round(conn, client, gw)
            when = game.gameweek(conn, gw.id).settles_at - timedelta(hours=CFG["prizes"]["settlement_delay_hours"])
        for rnd, frm, to in game.tick(conn, league_id, now=when, final_pull=final_pull):
            log(f"  {when:%a %d %b %H:%M}  {label:<16} {rnd}: {frm} -> {to}")


def describe(conn, sid, gw, names, log):
    pts, pen, cap, subs, players = conn.execute(
        """SELECT points, transfer_penalty, captain_used, auto_subs, players FROM squad_gameweek_scores
           WHERE squad_id = %s AND gameweek_id = %s""", (sid, gw.id)).fetchone()
    log(f"    {float(pts):.2f} points" + (f" (incl. transfers {pen})" if pen else "")
        + f", captain {names.get(cap, cap)}")
    for out_id, in_id in subs:
        log(f"    auto-sub: {names.get(out_id, out_id)} -> {names.get(in_id, in_id)}")
    for pid, p in sorted(players.items(), key=lambda kv: -kv[1]):
        log(f"      {p:6.2f}  {names.get(int(pid), pid)}")


def add_leagues(slugs, source="postgresql://localhost:5433/squad"):
    """Copy league areas' fixture lists from the main database and load their prices."""
    season = CFG["seasons"]["current"]
    src = psycopg.connect(source)
    conn = psycopg.connect(f"postgresql://localhost:5433/{SIM_DB}")
    for slug in slugs:
        league_id = launch_leagues()[slug]
        row = src.execute("""SELECT body FROM api_responses WHERE endpoint = '/fixtures'
                             AND params = %s ORDER BY fetched_at DESC LIMIT 1""",
                          (json.dumps({"league": league_id, "season": season}),)).fetchone()
        if not row:
            raise SystemExit(f"{slug}: no stored fixture list; run `python -m squad.ingest fixtures` first")
        rounds = {ingest.upsert_fixture(conn, fx) for fx in row[0]["response"]}
        game.refresh_gameweeks(conn, league_id, season)
        # demo shortcut: gameweeks that have already kicked off count as played, so the next real
        # gameweek is the open transfer window (the live service gets there through its own ticks)
        conn.execute("""UPDATE gameweeks g SET state = 'settled' WHERE league_id = %s AND season = %s
                        AND (SELECT min(kickoff) FROM fixtures f WHERE f.gameweek_id = g.id) < now()""",
                     (league_id, season))
        conn.commit()
        gw = conn.execute("""SELECT id, number FROM gameweeks WHERE league_id = %s AND season = %s AND state = 'open'
                             ORDER BY number LIMIT 1""", (league_id, season)).fetchone()
        n = game.load_prices(conn, slug, gw[0])
        print(f"{slug}: {len(rounds)} gameweeks, {n} priced players from gameweek {gw[1]}")
    conn.close()
    src.close()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m squad.simulate")
    ap.add_argument("--add-leagues", nargs="+", choices=launch_leagues(), metavar="LEAGUE",
                    help="add these league areas to the existing demo database and stop")
    ap.add_argument("--league", choices=launch_leagues(), default="premier-league")
    ap.add_argument("--round", type=int, default=7, help="first of the two simulated rounds")
    ap.add_argument("--open-window", action="store_true", help="demo: next round kicks off in 2 days")
    args = ap.parse_args(argv)
    if args.add_leagues:
        return add_leagues(args.add_leagues)
    league_id, season = launch_leagues()[args.league], CFG["seasons"]["current"]
    lines = []

    def log(s=""):
        print(s)
        lines.append(s)

    conn = fresh_db()
    client = Client(None, ROOT / "cache", offline=True)
    fixtures = json.loads((ROOT / "cache" / f"list_{league_id}_{season}_2026-11-01.json").read_text())["response"]
    r1, r2 = f"Regular Season - {args.round}", f"Regular Season - {args.round + 1}"
    for fx in fixtures:
        if fx["league"]["round"] in (r1, r2):
            fx = {**fx, "fixture": {**fx["fixture"], "status": {"short": "NS", "elapsed": None}},
                  "goals": {"home": None, "away": None}}
        ingest.upsert_fixture(conn, fx)
    game.refresh_gameweeks(conn, league_id, season)
    # history: earlier rounds' real stats, already settled
    history = [fx["fixture"]["id"] for fx in fixtures if int(fx["league"]["round"].split()[-1]) < args.round]
    ingest.final_pull(client, conn, history, use_cache=True)
    conn.execute("UPDATE gameweeks SET state = 'settled' WHERE league_id = %s AND number < %s",
                 (league_id, args.round))
    gw1 = game.gameweek_by_round(conn, league_id, args.round)
    gw2 = game.gameweek_by_round(conn, league_id, args.round + 1)
    n = game.load_prices(conn, args.league, gw1.id)
    ingest.rescore(conn, league_id)              # history scored again at the priced game positions
    rows = list(csv.DictReader(open(ROOT / "out" / f"prices_{args.league}.csv", encoding="utf-8")))
    names = {int(r["player_id"]): f"{r['name']} ({r['position']}, {r['team']}, {r['price']}M)" for r in rows}
    log(f"$ELEVN simulation: {args.league}, {r1} and {r2} (real data, simulated clock)")
    log(f"{len(history)} earlier matches loaded as history; {n} starting prices")

    # --- three test squads ---------------------------------------------------
    strategies = {
        "Form": lambda r: -float(r["ppg_blend"] or 0),
        "Value": lambda r: -float(r["ppg_blend"] or 0) / float(r["price"]),
        "Stars": lambda r: (-float(r["price"]), -float(r["ppg_blend"] or 0)),
    }
    before = gw1.first_kickoff - timedelta(days=1)
    log(f"\n{r1} transfer window ({before:%a %d %b})")
    squads, picks = {}, {}
    for i, (label, key) in enumerate(strategies.items(), start=1):
        sid = game.create_squad(conn, f"sim-wallet-{i}", league_id, name=label)
        squads[label] = sid
        picks[label] = build_squad(rows, key)
        res = game.save_squad(conn, sid, *picks[label], now=before)
        log(f"  {label}: saved={res.ok}, cost {res.cost}M" + ("" if res.ok else f" {res.problems}"))
    # an over-budget save is refused, nothing is written, and the builder is told why
    xi, bench, cap, vice = picks["Stars"]
    pricier = sorted(rows, key=lambda r: -float(r["price"]))
    big_bench = []
    for b in bench:
        pos = next(r["position"] for r in rows if int(r["player_id"]) == b)
        big_bench.append(next(int(r["player_id"]) for r in pricier if r["position"] == pos
                              and int(r["player_id"]) not in xi + bench + big_bench))
    res = game.save_squad(conn, squads["Stars"], xi, big_bench, cap, vice, now=before)
    log(f"  Stars tries a bench of {', '.join(names[p].split(' (')[0] for p in big_bench)}: saved={res.ok}")
    for p in res.problems:
        log(f"    - {p.message}")

    run_round(conn, client, league_id, gw1, log)
    log(f"\n{r1} results")
    for rank, sid, wallet, name, pts, pen, final in game.leaderboard(conn, gw1):
        log(f"  {rank}. {name}: {float(pts):.2f} ({'final' if final else 'live'})")
        describe(conn, sid, gw1, names, log)

    # --- round 2 window: transfers -------------------------------------------
    gw2 = game.gameweek(conn, gw2.id)
    w2 = gw2.first_kickoff - timedelta(days=1)
    log(f"\n{r2} transfer window ({w2:%a %d %b}); window open: "
        f"{game.window_gameweek(conn, league_id, season, w2) is not None}")
    played2 = {pid for pid, in conn.execute(
        """SELECT DISTINCT st.player_id FROM player_match_stats st JOIN fixtures f ON f.id = st.fixture_id
           WHERE f.round = %s AND st.minutes > 0""", (r2,)).fetchall()}
    priced = {int(r["player_id"]): r for r in rows}
    p2 = game.current_prices(conn, gw2, list(priced))

    def swap(label, n_changes, injured=None):
        """Replace the n lowest-PPG outfield starters with the best-PPG affordable players."""
        xi, bench, cap, vice = picks[label]
        squad = xi + bench
        value = game.team_value(conn, squads[label], gw2)     # bank + today's selling prices
        outs = [injured] if injured else []
        outs += sorted((p for p in xi if p not in (cap, vice, injured) and priced[p]["position"] != "GK"),
                       key=lambda p: float(priced[p]["ppg_blend"] or 0))[:n_changes - len(outs)]
        new = list(squad)
        for o in outs:
            pos, clubs = priced[o]["position"], Counter(priced[p]["team_id"] for p in new if p != o)
            budget = value - sum(p2[p] for p in new if p != o)
            best = max((r for r in rows if r["position"] == pos and int(r["player_id"]) not in new
                        and clubs[r["team_id"]] < SQ["max_per_club"] and p2[int(r["player_id"])] <= budget),
                       key=lambda r: float(r["ppg_blend"] or 0))
            new[new.index(o)] = int(best["player_id"])
        picks[label] = (new[:11], new[11:], cap, vice)
        if injured:
            conn.execute("""INSERT INTO player_availability (gameweek_id, player_id, status, reason)
                            VALUES (%s, %s, 'injured', 'simulated')""", (gw2.id, injured))
            conn.commit()
        res = game.save_squad(conn, squads[label], *picks[label], now=w2)
        log(f"  {label}: saved={res.ok}, cost {res.cost}M of {res.budget}M, penalty {res.penalty}"
            + ("" if res.ok else f" {res.problems}"))
        for t in res.transfers:
            log(f"    {t.kind:<11} {names[t.player_out]}  ->  {names[t.player_in]}" + (f"  ({t.penalty})" if t.penalty else ""))

    # Form: a starter who misses round 2 is flagged injured -> free replacement, plus 2 free
    form_xi = picks["Form"][0]
    missing = next((p for p in form_xi if p not in played2 and p not in picks["Form"][2:]), None)
    swap("Form", 3, injured=missing)
    swap("Value", 5)                     # 3 free + 2 extra = -16
    log("  Stars: no save, carries over at lock")

    run_round(conn, client, league_id, gw2, log)
    log(f"\n{r2} results")
    for rank, sid, wallet, name, pts, pen, final in game.leaderboard(conn, gw2):
        log(f"  {rank}. {name}: {float(pts):.2f} ({'final' if final else 'live'})")
        describe(conn, sid, gw2, names, log)

    # --- prices for the next round --------------------------------------------
    nxt = conn.execute("""SELECT pp.player_id, pp.price, prev.price FROM player_prices pp
                          JOIN player_prices prev ON prev.player_id = pp.player_id AND prev.gameweek_id = %s
                          JOIN gameweeks g ON g.id = pp.gameweek_id
                          WHERE g.league_id = %s AND g.number = %s""",
                       (gw2.id, league_id, args.round + 2)).fetchall()
    moves = sorted(((float(new) - float(old), pid) for pid, new, old in nxt), reverse=True)
    log(f"\nPrices for Regular Season - {args.round + 2}: {sum(1 for d, _ in moves if d > 0)} up, "
        f"{sum(1 for d, _ in moves if d < 0)} down, {sum(1 for d, _ in moves if d == 0)} unchanged")
    for d, pid in moves[:5] + moves[-5:]:
        log(f"  {d:+.1f}M  {names.get(pid, pid)}")
    events = conn.execute("SELECT count(*) FROM gameweek_events").fetchone()[0]
    log(f"\n{events} state changes logged; API calls: {client.calls}")
    if args.open_window:
        nxt = game.gameweek_by_round(conn, league_id, args.round + 2)
        shift = datetime.now(timezone.utc) + timedelta(days=2) - nxt.first_kickoff
        conn.execute("""UPDATE fixtures f SET kickoff = f.kickoff + %s, status = 'NS', elapsed = NULL,
                          home_goals = NULL, away_goals = NULL
                        FROM gameweeks g WHERE g.id = f.gameweek_id AND g.league_id = %s AND g.number >= %s""",
                     (shift, league_id, args.round + 2))
        game.refresh_gameweeks(conn, league_id, season)
        conn.commit()
        log(f"\ndemo: Regular Season - {args.round + 2} now kicks off in 2 days; its transfer window is open")
    out = ROOT / "out" / f"simulation_{args.league}.txt"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwritten to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
