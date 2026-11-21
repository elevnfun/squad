"""Ingestion service: API-Football -> Postgres, scoring every player-match as data arrives.

  python -m squad.ingest init                          create tables, load leagues
  python -m squad.ingest fixtures [--league SLUG]      fixture list (grouped by league round) for the season
  python -m squad.ingest round --league SLUG --round N finished/played matches of one round
  python -m squad.ingest final --league SLUG --round N settlement re-pull, marks scores final
  python -m squad.ingest live                          poll live matches (15 s events, 60 s player stats)
  python -m squad.ingest prices --league SLUG [--round N]  starting prices (player_prices) from out/prices_<league>.csv
  python -m squad.ingest rescore [--league SLUG]       re-derive stored scores at each player's game position

Players score at their game position (their builder section, set by the starting prices),
never the position API-Football lists them at for one match.

Every raw response is stored in api_responses so scores can be re-derived and audited.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from .apifootball import Client
from .config import CFG, ROOT, launch_leagues
from .db import connect, init_schema
from .scoring import PlayerMatch, parse_fixture, score_match

API = CFG["api_football"]
SEASON = CFG["seasons"]["current"]
LIVE_STATUSES = {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"}
FINISHED = {"FT", "AET", "PEN"}


# ------------------------------------------------------------------ store ---
def store_response(conn, endpoint, params, body):
    conn.execute("INSERT INTO api_responses (endpoint, params, body) VALUES (%s, %s, %s)",
                 (endpoint, Jsonb(params), Jsonb(body)))


def round_number(name):
    m = re.search(r"(\d+)\s*$", name or "")
    return int(m.group(1)) if m else None


def upsert_fixture(conn, fx):
    """League round, clubs and the fixture row (status, score). Returns the gameweek id."""
    f, lg, teams, goals = fx["fixture"], fx["league"], fx["teams"], fx["goals"]
    for side in ("home", "away"):
        t = teams[side]
        conn.execute("""INSERT INTO clubs (id, name, logo) VALUES (%s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, logo = EXCLUDED.logo""",
                     (t["id"], t["name"], t.get("logo")))
    gw = conn.execute("""INSERT INTO gameweeks (league_id, season, round, number) VALUES (%s, %s, %s, %s)
                         ON CONFLICT (league_id, season, round) DO UPDATE SET number = EXCLUDED.number
                         RETURNING id""",
                      (lg["id"], lg["season"], lg["round"], round_number(lg["round"]))).fetchone()[0]
    conn.execute("""INSERT INTO fixtures (id, league_id, season, round, gameweek_id, kickoff, status, elapsed,
                                          home_club_id, away_club_id, home_goals, away_goals, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (id) DO UPDATE SET
                      round = EXCLUDED.round, kickoff = EXCLUDED.kickoff,
                      -- keep the fixture's gameweek row unless its round changed
                      gameweek_id = CASE WHEN fixtures.round = EXCLUDED.round THEN fixtures.gameweek_id
                                         ELSE EXCLUDED.gameweek_id END,
                      status = EXCLUDED.status, elapsed = EXCLUDED.elapsed, home_goals = EXCLUDED.home_goals,
                      away_goals = EXCLUDED.away_goals, updated_at = now()""",
                 (f["id"], lg["id"], lg["season"], lg["round"], gw, f["date"], f["status"]["short"],
                  f["status"].get("elapsed"), teams["home"]["id"], teams["away"]["id"],
                  goals["home"], goals["away"]))
    return gw


def upsert_player_stats(conn, fx, final=False):
    """Players, per-match stats and base scores for every player in the fixture."""
    league_id = fx["league"]["id"]
    photos = {p["player"]["id"]: p["player"].get("photo")
              for block in fx.get("players") or [] for p in block.get("players", [])}
    rows = parse_fixture(fx)
    for pm in rows:
        game_pos = conn.execute("""INSERT INTO players (id, name, position, club_id, league_id, photo, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, club_id = EXCLUDED.club_id,
                          league_id = EXCLUDED.league_id, photo = COALESCE(EXCLUDED.photo, players.photo),
                          position = COALESCE(players.position, EXCLUDED.position), updated_at = now()
                        RETURNING position""",
                     (pm.player_id, pm.name, pm.position, pm.team_id, league_id, photos.get(pm.player_id))).fetchone()[0]
        cols = ["position", "minutes", "goals", "assists", "conceded", "saves", "pen_saved", "pen_missed",
                "yellow", "red", "own_goals", "accurate_passes", "key_passes", "shots_on", "tackles",
                "duels_won", "rating", "substitute"]
        vals = [getattr(pm, c) for c in cols]
        conn.execute(f"""INSERT INTO player_match_stats (fixture_id, player_id, club_id, {", ".join(cols)}, updated_at)
                         VALUES (%s, %s, %s, {", ".join(["%s"] * len(cols))}, now())
                         ON CONFLICT (fixture_id, player_id) DO UPDATE SET club_id = EXCLUDED.club_id,
                           {", ".join(f"{c} = EXCLUDED.{c}" for c in cols)}, updated_at = now()""",
                     [pm.fixture_id, pm.player_id, pm.team_id, *vals])
        store_score(conn, replace(pm, position=game_pos), final)
    return len(rows)


def store_score(conn, pm, final=False):
    """Base score of one player-match. pm.position must be the player's game position (their
    builder section, players.position), not the position they played that match."""
    s = score_match(pm)
    conn.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus,
                                                         involvement, base, breakdown, is_final, scored_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (fixture_id, player_id) DO UPDATE SET core_plus = EXCLUDED.core_plus,
                          core_minus = EXCLUDED.core_minus, involvement = EXCLUDED.involvement,
                          base = EXCLUDED.base, breakdown = EXCLUDED.breakdown,
                          is_final = player_match_scores.is_final OR EXCLUDED.is_final, scored_at = now()""",
                 (pm.fixture_id, pm.player_id, s.core_plus, s.core_minus, s.involvement, s.base,
                  Jsonb(s.breakdown), final))


STAT_COLS = ["minutes", "goals", "assists", "conceded", "saves", "pen_saved", "pen_missed", "yellow", "red",
             "own_goals", "accurate_passes", "key_passes", "shots_on", "tackles", "duels_won", "rating", "substitute"]


def rescore(conn, league_id=None):
    """Re-derive every stored base score from its stats at the player's current game position
    (after starting prices set positions, or a scoring config change). Final flags are kept."""
    rows = conn.execute(f"""SELECT st.fixture_id, st.player_id, st.club_id, p.position, {", ".join("st." + c for c in STAT_COLS)}
                            FROM player_match_stats st JOIN players p ON p.id = st.player_id
                            JOIN fixtures f ON f.id = st.fixture_id
                            WHERE %(league)s::int IS NULL OR f.league_id = %(league)s""",
                        {"league": league_id}).fetchall()
    for fid, pid, club, pos, *vals in rows:
        pm = PlayerMatch(player_id=pid, fixture_id=fid, team_id=club, position=pos,
                         **dict(zip(STAT_COLS, vals)))
        pm.rating = float(pm.rating)
        store_score(conn, pm)
    conn.commit()
    return len(rows)


# ------------------------------------------------------------------ fetch ---
def fetch_details(client, conn, ids, use_cache=True):
    """Full fixtures (events, lineups, players) for ids, 20 per request. Finished matches are
    read from ./cache when present; anything else is fetched and stored."""
    out, missing = [], []
    for fid in ids:
        f = client.cache / "fixtures" / f"{fid}.json"
        if use_cache and f.exists():
            out.append(json.loads(f.read_text()))
        else:
            missing.append(fid)
    step = API["fixtures_per_request"]
    for i in range(0, len(missing), step):
        params = {"ids": "-".join(map(str, missing[i:i + step]))}
        data = client.api("/fixtures", params)
        store_response(conn, "/fixtures", params, data)
        for fx in data.get("response", []):
            if not fx.get("players") and fx["fixture"]["status"]["short"] not in ("NS", "TBD", "PST", "CANC"):
                pp = {"fixture": fx["fixture"]["id"]}
                pdata = client.api("/fixtures/players", pp)
                store_response(conn, "/fixtures/players", pp, pdata)
                fx["players"] = pdata.get("response", [])
            if fx["fixture"]["status"]["short"] in FINISHED:
                (client.cache / "fixtures" / f"{fx['fixture']['id']}.json").write_text(json.dumps(fx))
            out.append(fx)
    return out


def ingest_fixtures(client, conn, slugs, season=SEASON):
    """Season fixture list -> fixtures, each in its league round. 1 call per league."""
    for slug in slugs:
        params = {"league": launch_leagues()[slug], "season": season}
        data = client.api("/fixtures", params)
        store_response(conn, "/fixtures", params, data)
        gws = [upsert_fixture(conn, fx) for fx in data.get("response", [])]
        conn.commit()
        print(f"{slug}: {len(gws)} fixtures in {len(set(gws))} rounds")


def ingest_round(client, conn, slug, rnd, season=SEASON, final=False):
    round_name = rnd if not str(rnd).isdigit() else f"Regular Season - {rnd}"
    params = {"league": launch_leagues()[slug], "season": season, "round": round_name}
    data = client.api("/fixtures", params)
    store_response(conn, "/fixtures", params, data)
    played = [fx["fixture"]["id"] for fx in data.get("response", [])
              if fx["fixture"]["status"]["short"] not in ("NS", "TBD", "PST", "CANC")]
    players = 0
    for fx in fetch_details(client, conn, played, use_cache=not final):
        upsert_fixture(conn, fx)
        players += upsert_player_stats(conn, fx, final=final and fx["fixture"]["status"]["short"] in FINISHED)
    for fx in data.get("response", []):
        upsert_fixture(conn, fx)   # unplayed fixtures keep their kickoff/status current
    conn.commit()
    print(f"{slug} {round_name}: {len(played)} played matches, {players} player-matches scored"
          + (" (final)" if final else ""))


def final_pull(client, conn, fixture_ids, use_cache=False):
    """Re-pull: fresh full-time data for fixtures, scores marked final."""
    for fx in fetch_details(client, conn, fixture_ids, use_cache=use_cache):
        upsert_fixture(conn, fx)
        upsert_player_stats(conn, fx, final=fx["fixture"]["status"]["short"] in FINISHED)


def load_prices(conn, slug, gameweek_id, path=None):
    """Starting prices from the pricing script's CSV (squad_pricing.py), into player_prices (Draft ranks
    players by their latest price). The CSV's position is the player's game position (most frequent across
    the data)."""
    league_id = launch_leagues()[slug] if slug in launch_leagues() else CFG["leagues"][slug]["id"]
    path = path or ROOT / "out" / f"prices_{slug}.csv"
    n = 0
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            conn.execute("INSERT INTO clubs (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                         (int(r["team_id"]), r["team"]))
            conn.execute("""INSERT INTO players (id, name, position, club_id, league_id, updated_at)
                            VALUES (%s, %s, %s, %s, %s, now())
                            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position,
                              club_id = EXCLUDED.club_id, league_id = EXCLUDED.league_id, updated_at = now()""",
                         (int(r["player_id"]), r["name"], r["position"], int(r["team_id"]), league_id))
            conn.execute("""INSERT INTO player_prices (player_id, gameweek_id, price, source) VALUES (%s, %s, %s, %s)
                            ON CONFLICT (player_id, gameweek_id) DO UPDATE SET price = EXCLUDED.price,
                              source = EXCLUDED.source""",
                         (int(r["player_id"]), gameweek_id, float(r["price"]), r["price_source"]))
            n += 1
    conn.commit()
    return n


def price_gameweek(conn, league_id, rnd=None, season=SEASON):
    """The league round row the prices hang on: the named round, else the first with a match still to play."""
    if rnd is not None:
        name = f"Regular Season - {rnd}" if str(rnd).isdigit() else rnd
        row = conn.execute("SELECT id FROM gameweeks WHERE league_id = %s AND season = %s AND round = %s",
                           (league_id, season, name)).fetchone()
    else:
        row = conn.execute("""SELECT g.id FROM gameweeks g WHERE g.league_id = %s AND g.season = %s
                              AND EXISTS (SELECT 1 FROM fixtures f WHERE f.gameweek_id = g.id
                                          AND f.status IN ('NS', 'TBD'))
                              ORDER BY g.number NULLS LAST, g.id LIMIT 1""", (league_id, season)).fetchone()
    return row[0] if row else None


# ------------------------------------------------------------------- live ---
def match_window_open(conn):
    """True if any of our fixtures is live or kicks off within 5 min (no API call needed)."""
    now = datetime.now(timezone.utc)
    row = conn.execute("""SELECT count(*) FROM fixtures
                          WHERE status = ANY(%s) OR kickoff BETWEEN %s AND %s""",
                       (list(LIVE_STATUSES), now - timedelta(hours=3), now + timedelta(minutes=5))).fetchone()
    return row[0] > 0


def live_loop(client, conn, once=False):
    """Every 15 s: /fixtures?live=all (scores, status, events for all live matches in one call).
    Every 60 s: /fixtures/players for our in-progress matches (skipping half-time)."""
    ours = set(launch_leagues().values())
    last_players, latest = 0.0, {}
    while True:
        if not match_window_open(conn):
            if once:
                print("no match window open")
                return
            time.sleep(60)
            continue
        data = client.api("/fixtures", {"live": "all"})
        live = [fx for fx in data.get("response", []) if fx["league"]["id"] in ours]
        store_response(conn, "/fixtures", {"live": "all", "kept": [fx["fixture"]["id"] for fx in live]},
                       {"response": live})
        live_ids = {fx["fixture"]["id"] for fx in live}
        # a match that left the live feed has ended (or been abandoned): pull its full-time state once
        ended = [fid for fid in latest if fid not in live_ids]
        for fx in fetch_details(client, conn, ended, use_cache=False):
            upsert_fixture(conn, fx)
            upsert_player_stats(conn, fx)
        for fid in ended:
            latest.pop(fid)
        for fx in live:
            upsert_fixture(conn, fx)
            latest[fx["fixture"]["id"]] = fx
        if time.time() - last_players >= API["player_stats_poll_seconds"]:
            last_players = time.time()
            for fid, fx in latest.items():
                if fx["fixture"]["status"]["short"] in ("HT", "BT", "P"):
                    continue
                pp = {"fixture": fid}
                pdata = client.api("/fixtures/players", pp)
                store_response(conn, "/fixtures/players", pp, pdata)
                upsert_player_stats(conn, {**fx, "players": pdata.get("response", [])})
        conn.commit()
        print(f"{datetime.now():%H:%M:%S} live: {len(live)} of our matches, {client.calls} calls this run")
        if once:
            return
        time.sleep(API["live_poll_seconds"])


# ------------------------------------------------------------------- main ---
def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m squad.ingest", description="$ELEVN ingestion")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    p = sub.add_parser("fixtures")
    p.add_argument("--league", choices=launch_leagues(), action="append")
    for name in ("round", "final"):
        p = sub.add_parser(name)
        p.add_argument("--league", choices=launch_leagues(), required=True)
        p.add_argument("--round", required=True, help='number (9) or full name ("Regular Season - 9")')
    p = sub.add_parser("live")
    p.add_argument("--once", action="store_true", help="one poll, then exit")
    p = sub.add_parser("prices")
    p.add_argument("--league", choices=launch_leagues(), required=True)
    p.add_argument("--round", help="league round to hang the prices on (default: the next one with a match to play)")
    p = sub.add_parser("rescore")
    p.add_argument("--league", choices=launch_leagues())
    args = ap.parse_args(argv)

    conn = connect()
    if args.cmd == "init":
        init_schema(conn)
        print("schema ready")
        return
    if args.cmd == "prices":
        league_id = launch_leagues()[args.league]
        gw = price_gameweek(conn, league_id, args.round)
        if gw is None:
            raise SystemExit("no such round (run `python -m squad.ingest fixtures` first)")
        print(f"{args.league}: {load_prices(conn, args.league, gw)} prices loaded")
        print(f"{rescore(conn, league_id)} player-matches rescored at their game positions")
        return
    if args.cmd == "rescore":
        n = rescore(conn, launch_leagues()[args.league] if args.league else None)
        print(f"{n} player-matches rescored")
        return
    key = os.environ.get("APIFOOTBALL_KEY")
    if not key:
        sys.exit("Set APIFOOTBALL_KEY in .env")
    client = Client(key, ROOT / "cache")
    if args.cmd == "fixtures":
        ingest_fixtures(client, conn, args.league or list(launch_leagues()))
    elif args.cmd in ("round", "final"):
        ingest_round(client, conn, args.league, args.round, final=args.cmd == "final")
    elif args.cmd == "live":
        live_loop(client, conn, once=args.once)
    print(f"API calls: {client.calls}")


if __name__ == "__main__":
    main()
