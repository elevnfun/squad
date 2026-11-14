"""Two simulated gameweeks end to end on a throwaway Postgres database (squad_test).

Every expected number is worked out by hand in the comments. Skipped if the local
Postgres (scripts/db.sh start) is not running.
"""

from datetime import date, datetime, timedelta, timezone

import psycopg
import pytest

from squad import game
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
LEAGUE, SEASON = 39, 2026
D1 = datetime(2026, 8, 22, 14, 0, tzinfo=timezone.utc)   # round 1 kickoffs; round 2 a week later


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test")
    admin.execute("CREATE DATABASE squad_test")
    c = psycopg.connect(URL.format("squad_test"))
    init_schema(c)
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test")
    admin.close()


def setup_world(c, d1=D1):
    """6 clubs x (2 GK, 4 DEF, 4 MID, 2 FWD), id = club*100 + n, all 6.0M; 3 rounds of 3 matches."""
    for club in range(1, 7):
        c.execute("INSERT INTO clubs (id, name) VALUES (%s, %s)", (club, f"Club {club}"))
        for n, pos in enumerate(["GK"] * 2 + ["DEF"] * 4 + ["MID"] * 4 + ["FWD"] * 2, start=1):
            c.execute("INSERT INTO players (id, name, position, club_id, league_id) VALUES (%s, %s, %s, %s, %s)",
                      (club * 100 + n, f"P{club * 100 + n}", pos, club, LEAGUE))
    for rnd in (1, 2, 3):
        gw = c.execute("INSERT INTO gameweeks (league_id, season, round, number) VALUES (%s, %s, %s, %s) "
                       "RETURNING id", (LEAGUE, SEASON, f"Regular Season - {rnd}", rnd)).fetchone()[0]
        for i, (home, away) in enumerate([(1, 2), (3, 4), (5, 6)]):
            c.execute("""INSERT INTO fixtures (id, league_id, season, round, gameweek_id, kickoff, status,
                                               home_club_id, away_club_id)
                         VALUES (%s, %s, %s, %s, %s, %s, 'NS', %s, %s)""",
                      (rnd * 10 + i, LEAGUE, SEASON, f"Regular Season - {rnd}", gw,
                       d1 + timedelta(days=7 * (rnd - 1), hours=2 * i), home, away))
        if rnd == 1:
            c.execute("INSERT INTO player_prices SELECT id, %s, 6.0, 'model' FROM players", (gw,))
    c.commit()


def play(c, rnd, special=(), status="FT"):
    """Every player plays 90 minutes for 2 points (core+ 2); `special` overrides
    {player: (minutes, core_plus, core_minus)}."""
    special = dict(special)
    for i, (home, away) in enumerate([(1, 2), (3, 4), (5, 6)]):
        fid = rnd * 10 + i
        c.execute("UPDATE fixtures SET status = %s WHERE id = %s", (status, fid))
        for pid, pos, club in c.execute("SELECT id, position, club_id FROM players WHERE club_id IN (%s, %s)",
                                        (home, away)).fetchall():
            mins, plus, minus = special.get(pid, (90, 2, 0))
            c.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes)
                         VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""", (fid, pid, club, pos, mins))
            c.execute("""INSERT INTO player_match_scores (fixture_id, player_id, core_plus, core_minus, involvement,
                                                          base, breakdown) VALUES (%s, %s, %s, %s, 0, %s, '[]')
                         ON CONFLICT DO NOTHING""", (fid, pid, plus if mins else 0, minus if mins else 0,
                                                     (plus + minus) if mins else 0))
    c.commit()


def points(c, sid, rnd):
    return c.execute("""SELECT sc.points, sc.transfer_penalty, sc.is_final, sc.auto_subs FROM squad_gameweek_scores sc
                        JOIN gameweeks g ON g.id = sc.gameweek_id WHERE sc.squad_id = %s AND g.number = %s""",
                     (sid, rnd)).fetchone()


def state(c, rnd):
    return c.execute("SELECT state FROM gameweeks WHERE number = %s", (rnd,)).fetchone()[0]


# Squad A: XI = GK 101, DEF 103 203 303 403, MID 107 207 307 507, FWD 611 511; bench GK 201, DEF 603, MID 607, FWD 411
A_XI = [101, 103, 203, 303, 403, 107, 207, 307, 507, 611, 511]
A_BENCH = [201, 603, 607, 411]
# Squad B: no overlap with A
B_XI = [102, 104, 204, 304, 404, 108, 208, 308, 508, 612, 512]
B_BENCH = [202, 604, 608, 412]


def test_two_gameweeks_end_to_end(conn):
    c = conn
    setup_world(c)
    c.execute("INSERT INTO rising_stars (player_id, season, league_id, level, active_from) VALUES (207, %s, %s, 1, %s)",
              (SEASON, LEAGUE, date(2026, 8, 1)))
    c.commit()
    a = game.create_squad(c, "wallet-A", LEAGUE, name="A")
    b = game.create_squad(c, "wallet-B", LEAGUE, name="B")
    before = D1 - timedelta(days=1)

    # --- window open for round 1 (no earlier round) --------------------------
    assert game.tick(c, LEAGUE, now=before) == []
    bad = game.save_squad(c, a, [101, 103, 104, 105, 403, 107, 207, 307, 507, 611, 511], A_BENCH, 107, 207, before)
    assert not bad.ok and {p.code for p in bad.problems} == {"club_limit"}          # 4 from club 1
    assert c.execute("SELECT count(*) FROM squad_picks").fetchone()[0] == 0       # nothing written
    ok = game.save_squad(c, a, A_XI, A_BENCH, 107, 307, before)
    assert ok.ok and ok.cost == 90.0 and ok.transfers == []                        # first build is free
    assert game.save_squad(c, b, B_XI, B_BENCH, 108, 208, before).ok

    # --- lock at first kickoff ----------------------------------------------
    assert game.tick(c, LEAGUE, now=D1) == [("Regular Season - 1", "open", "locked")]
    assert game.save_squad(c, a, A_XI, A_BENCH, 107, 307, D1).problems[0].code == "window_closed"

    # --- live: A's captain 107 scores 10 core+ / -2 core-, DEF 103 does not play,
    #     Rising Star 207 (level 1, x1.1) scores 12 ------------------------------
    special = {107: (90, 10, -2), 103: (0, 0, 0), 207: (90, 12, 0)}
    play(c, 1, special, status="2H")
    assert game.tick(c, LEAGUE, now=D1 + timedelta(hours=1)) == [("Regular Season - 1", "locked", "live")]
    # A: captain 10 x 2 - 2 = 18; 207: 12 x 1.1 = 13.2; 8 other starters x 2 = 16;
    #    103 out, bench DEF 603 in (bench GK skipped): 2  ->  49.2
    pts, pen, final, subs = points(c, a, 1)
    assert (float(pts), pen, final, subs) == (49.2, 0, False, [[103, 603]])
    assert float(points(c, b, 1)[0]) == 24.0                                       # captain 4 + 10 x 2

    # --- all matches over -> settling: round 2 prices are set and its window opens 1 h later,
    #     before round 1 is settled
    c.execute("UPDATE fixtures SET status = 'FT' WHERE gameweek_id = (SELECT id FROM gameweeks WHERE number = 1)")
    c.commit()
    over = D1 + timedelta(hours=8)
    assert game.tick(c, LEAGUE, now=over) == [("Regular Season - 1", "live", "settling")]
    assert game.window_gameweek(c, LEAGUE, now=over + timedelta(minutes=59)) is None
    assert game.window_gameweek(c, LEAGUE, now=over + timedelta(hours=1)).number == 2
    assert c.execute("""SELECT count(*) FROM player_prices pp JOIN gameweeks g ON g.id = pp.gameweek_id
                        WHERE g.number = 2 AND pp.source = 'weekly'""").fetchone()[0] == 72

    # --- settled (last kickoff + 2 h + 24 h) ---------------------------------
    moves = game.tick(c, LEAGUE, now=D1 + timedelta(hours=30))
    assert moves == [("Regular Season - 1", "settling", "settled")]
    assert points(c, a, 1)[2] is True
    assert c.execute("SELECT level FROM rising_stars WHERE player_id = 207").fetchone()[0] == 2   # 12+ points

    # --- round 2 window: 611 is injured -> free replacement; then 4 more changes:
    #     3 free + 1 extra (-8). B saves nothing and carries over. ------------
    w2 = D1 + timedelta(days=3)
    gw2 = game.window_gameweek(c, LEAGUE, now=w2)
    assert gw2 is not None and gw2.number == 2
    c.execute("INSERT INTO player_availability (gameweek_id, player_id, status, reason) VALUES (%s, 611, 'injured', 'Knee')",
              (gw2.id,))
    c.commit()
    swaps = {611: 311, 303: 504, 403: 505, 507: 509, 511: 312}   # in-players keep max 3 per club
    xi2 = [swaps.get(p, p) for p in A_XI]
    res = game.save_squad(c, a, xi2, A_BENCH, 107, 307, w2)
    assert res.ok, res.problems
    assert sorted(t.kind for t in res.transfers) == ["extra", "free", "free", "free", "replacement"]
    assert res.penalty == -8
    assert [t.player_out for t in res.transfers if t.kind == "replacement"] == [611]
    # saving again (captain change only) re-counts against last week, so nothing extra
    res = game.save_squad(c, a, xi2, A_BENCH, 207, 307, w2)
    assert res.ok and res.penalty == -8

    d2 = D1 + timedelta(days=7)
    assert game.tick(c, LEAGUE, now=d2) == [("Regular Season - 2", "open", "locked")]
    assert c.execute("""SELECT count(*) FROM squad_picks sp JOIN gameweeks g ON g.id = sp.gameweek_id
                        WHERE g.number = 2 AND sp.squad_id = %s""", (b,)).fetchone()[0] == 15   # carried over

    play(c, 2)
    moves = game.tick(c, LEAGUE, now=d2 + timedelta(hours=30))
    assert moves == [("Regular Season - 2", "locked", "live"), ("Regular Season - 2", "live", "settling"),
                     ("Regular Season - 2", "settling", "settled")]
    # A: captain 207 is a level-2 Rising Star: 2 x 1.15 x 2 = 4.6; 10 others x 2 = 20; -8  ->  16.6
    pts, pen, final, _ = points(c, a, 2)
    assert (float(pts), pen, final) == (16.6, -8, True)
    assert float(points(c, b, 2)[0]) == 24.0

    # --- round 3 prices: among the 2 squads in both weeks, A sold 611 (-50%) and bought 311 (+50%);
    #     form = PPG for everyone (all 2s), so ownership alone moves the price: +/-10%, capped at 0.3M
    def price(pid):
        return float(c.execute("""SELECT pp.price FROM player_prices pp JOIN gameweeks g ON g.id = pp.gameweek_id
                                  WHERE g.number = 3 AND pp.player_id = %s""", (pid,)).fetchone()[0])
    assert (price(611), price(311), price(101)) == (5.7, 6.3, 6.0)

    # --- round 3 budget: A built at 90.0M (bank 10.0); the 5 players it bought in round 2 each
    #     rose 0.3M, so A can spend 10.0 + 10 x 6.0 + 5 x 6.3 = 101.5M; B (no risers or fallers)
    #     still has 10.0 + 15 x 6.0 = 100.0M
    gw3 = game.gameweek_by_round(c, LEAGUE, 3)
    assert game.team_value(c, a, gw3) == 101.5
    assert game.team_value(c, b, gw3) == 100.0

    table = game.leaderboard(c, gw2)
    assert [(r[3], float(r[4])) for r in table] == [("B", 24.0), ("A", 16.6)]
    assert [r[0] for r in c.execute("SELECT to_state FROM gameweek_events ORDER BY id").fetchall()] == \
        ["locked", "live", "settling", "settled"] * 2


def test_players_score_at_their_game_position(conn):
    """A defender listed as a midfielder for one match still scores a goal at 12, not 10."""
    from squad import ingest
    c = conn
    setup_world(c)
    c.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes, goals)
                 VALUES (10, 103, 1, 'MID', 90, 1)""")     # 103 is a DEF in the builder
    assert ingest.rescore(c) == 1
    breakdown = c.execute("SELECT breakdown FROM player_match_scores WHERE player_id = 103").fetchone()[0]
    assert ["goals", 12] in breakdown
