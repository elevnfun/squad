"""Contest calendar, finality and release. Dates are the real 2026 calendar:
Tue 17 Nov starts a week; Wed 18, Fri 20, Sat 21, Sun 22, Mon 23 Nov. The UK is on GMT (= UTC) in November.
Runs against the real squad/winnings.py."""

from datetime import date, datetime, timedelta, timezone

import psycopg
import pytest

from squad import contests, payouts
from squad.config import CFG
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
SOL = 1_000_000_000
PL, LALIGA, SERIE_A = 39, 140, 135      # Serie A is not a launch league


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db.sh start)")
    admin.execute("DROP DATABASE IF EXISTS squad_test_contests")
    admin.execute("CREATE DATABASE squad_test_contests")
    c = psycopg.connect(URL.format("squad_test_contests"))
    init_schema(c)
    c.execute("INSERT INTO clubs (id, name) VALUES (1, 'A'), (2, 'B')")
    c.execute("INSERT INTO players (id, name, position, club_id) VALUES (1, 'P', 'MID', 1)")
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test_contests")
    admin.close()


def t(day, hm, month=11):
    """A UTC timestamp in 2026."""
    h, m = hm.split(":")
    return datetime(2026, month, day, int(h), int(m), tzinfo=timezone.utc)


def fx(conn, fid, kickoff, status="NS", league=PL):
    conn.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id)
                    VALUES (%s, %s, 2026, 'R', %s, %s, 1, 2)""", (fid, league, kickoff, status))


def world(conn):
    """Wed 18 20:00 (1), Fri 20 15:00 (2), Fri 20 19:45 (3), Sat 21 12:30 (4), Sun 22 16:30 (5), and a
    Serie A match on Thu 19 (9, ignored). Matchdays: 18, 20, 21, 22 -> 4 contests, + 1 week + 1 draft = 6."""
    for fid, k in [(1, t(18, "20:00")), (2, t(20, "15:00")), (3, t(20, "19:45")), (4, t(21, "12:30")), (5, t(22, "16:30"))]:
        fx(conn, fid, k)
    fx(conn, 9, t(19, "20:00"), league=SERIE_A)


def by_kind(conn, kind, **where):
    q = "SELECT id, state FROM contests WHERE kind = %s" + "".join(f" AND {k} = %s" for k in where)
    return conn.execute(q + " ORDER BY id", (kind, *where.values())).fetchall()


def cid(conn, kind, day=None):
    q, a = ("SELECT id FROM contests WHERE kind = %s AND day = %s", (kind, day)) if day else \
           ("SELECT id FROM contests WHERE kind = %s", (kind,))
    return conn.execute(q, a).fetchone()[0]


def state(conn, c):
    return conn.execute("SELECT state FROM contests WHERE id = %s", (c,)).fetchone()[0]


def enter(conn, c, wallet, pts, cap=0, slot=1, fixture=None):
    e = conn.execute("""INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id)
                        VALUES (%s, %s, %s, %s, 1) RETURNING id""", (c, wallet, slot, fixture)).fetchone()[0]
    if pts is not None:
        conn.execute("INSERT INTO entry_scores (entry_id, points, captain_points) VALUES (%s, %s, %s)", (e, pts, cap))
    return e


def five(conn, c, fixture=None, pts=(50, 40, 30, 20, 10)):
    for i, p in enumerate(pts, 1):
        enter(conn, c, f"w{i}", p, fixture=fixture)


def single_day(conn):
    """One matchday: Fri 20 Nov 15:00. Estimated end 17:00 (match_hours = 2), final at 17:15."""
    fx(conn, 2, t(20, "15:00"))
    contests.ensure(conn, t(20, "09:00"))
    return cid(conn, "blitz_matchday", date(2026, 11, 20))


# --------------------------------------------------------------- calendar ---
def test_week_start():
    assert contests.week_start(date(2026, 11, 17)) == date(2026, 11, 17)    # Tuesday
    assert contests.week_start(date(2026, 11, 23)) == date(2026, 11, 17)    # Monday belongs to the week before
    assert contests.week_start(date(2026, 11, 24)) == date(2026, 11, 24)


def test_uk_date_winter_and_summer():
    assert contests.uk_date(t(21, "23:30")) == date(2026, 11, 21)           # GMT: same date
    assert contests.uk_date(t(15, "23:30", month=8)) == date(2026, 8, 16)   # BST (UTC+1): 00:30 on Sunday


def test_summer_kickoff_after_uk_midnight_is_next_matchday(conn):
    # Sat 15 Aug 2026 23:30 UTC = Sun 16 Aug 00:30 BST. The week starts Tue 11 Aug.
    fx(conn, 1, t(15, "23:30", month=8))
    # Sunday 16 Aug lies in Fri 14 .. Mon 17 of that week, so: matchday + blitz_week + draft_week = 3
    assert contests.ensure(conn, t(15, "12:00", month=8)) == 3
    assert by_kind(conn, "blitz_matchday", day=date(2026, 8, 16))
    assert not by_kind(conn, "blitz_matchday", day=date(2026, 8, 15))


# ----------------------------------------------------------------- ensure ---
def test_ensure_creates_each_contest_once(conn):
    world(conn)
    assert contests.ensure(conn, t(17, "09:00")) == 6
    days = [r[0] for r in conn.execute("SELECT day FROM contests WHERE kind = 'blitz_matchday' ORDER BY day")]
    assert days == [date(2026, 11, d) for d in (18, 20, 21, 22)]    # not Thursday: only Serie A played
    assert len(by_kind(conn, "blitz_week")) == 1 and len(by_kind(conn, "draft_week")) == 1
    assert conn.execute("SELECT week_start FROM contests WHERE kind = 'draft_week'").fetchone()[0] == date(2026, 11, 17)
    assert contests.ensure(conn, t(17, "10:00")) == 0               # again: nothing new


def test_draft_locks_at_fridays_first_kickoff_and_opens_tuesday(conn):
    world(conn)
    contests.ensure(conn, t(17, "09:00"))
    locks, opens = conn.execute("SELECT locks_at, opens_at FROM contests WHERE kind = 'draft_week'").fetchone()
    assert locks == t(20, "15:00")
    assert opens == t(17, "00:00")      # Tuesday 00:00 UK = 00:00 UTC in November


def test_draft_locks_saturday_when_no_friday_fixture(conn):
    fx(conn, 1, t(18, "20:00"))
    fx(conn, 4, t(21, "14:00"))
    fx(conn, 5, t(21, "12:30"))
    contests.ensure(conn, t(17, "09:00"))
    assert conn.execute("SELECT locks_at FROM contests WHERE kind = 'draft_week'").fetchone()[0] == t(21, "12:30")


def test_wednesday_only_week_has_no_draft(conn):
    fx(conn, 1, t(18, "20:00"))
    assert contests.ensure(conn, t(17, "09:00")) == 2               # matchday + blitz_week
    assert not by_kind(conn, "draft_week")


def test_open_draft_lock_follows_moved_fixture(conn):
    world(conn)
    contests.ensure(conn, t(17, "09:00"))
    conn.execute("UPDATE fixtures SET kickoff = %s WHERE id = 2", (t(20, "13:00"),))
    contests.ensure(conn, t(17, "10:00"))
    assert conn.execute("SELECT locks_at FROM contests WHERE kind = 'draft_week'").fetchone()[0] == t(20, "13:00")


def test_fixtures_of(conn):
    world(conn)
    contests.ensure(conn, t(17, "09:00"))
    ids = lambda c: [f["id"] for f in contests.fixtures_of(conn, c)]
    assert ids(cid(conn, "blitz_matchday", date(2026, 11, 20))) == [2, 3]
    assert ids(cid(conn, "blitz_week")) == [1, 2, 3, 4, 5]          # Tue 17 .. Mon 23, launch leagues only
    assert ids(cid(conn, "draft_week")) == [2, 3, 4, 5]             # Fri 20 .. Mon 23, not Wednesday


# ------------------------------------------------------------------- tick ---
def test_live_review_timeline(conn):
    c = single_day(conn)
    assert (c, "open", "live") not in contests.tick(conn, t(20, "14:59"))
    assert state(conn, c) == "open"
    assert (c, "open", "live") in contests.tick(conn, t(20, "15:00"))
    conn.execute("UPDATE fixtures SET status = '2H'")
    assert contests.tick(conn, t(22, "00:00")) == []                # a match in play holds it open, however late
    conn.execute("UPDATE fixtures SET status = 'FT'")
    assert contests.tick(conn, t(20, "17:14")) == []                # 15:00 + 2h = 17:00, + 15 min = 17:15
    assert (c, "live", "review") in contests.tick(conn, t(20, "17:15"))
    assert conn.execute("SELECT last_match_ends_at, final_at FROM contests WHERE id = %s", (c,)).fetchone() \
        == (t(20, "17:00"), t(20, "17:15"))


def test_postponed_match_does_not_hold_it_open(conn):
    fx(conn, 2, t(20, "15:00"), "FT")
    fx(conn, 3, t(20, "19:45"), "PST")
    contests.ensure(conn, t(20, "09:00"))
    c = cid(conn, "blitz_matchday", date(2026, 11, 20))
    # only the 15:00 match was played: it ends 17:00, final 17:15 (the postponed one is ignored)
    out = contests.tick(conn, t(20, "17:15"))
    assert (c, "live", "review") in out


def test_all_called_off_rolls(conn):
    fx(conn, 2, t(20, "15:00"), "PST")
    fx(conn, 3, t(20, "19:45"), "CANC")
    contests.ensure(conn, t(20, "09:00"))
    c = cid(conn, "blitz_matchday", date(2026, 11, 20))
    assert (c, "live", "rolled") in contests.tick(conn, t(20, "16:00"))
    assert state(conn, c) == "rolled"


def test_blitz_week_waits_for_matchdays(conn):
    c = single_day(conn)
    w = cid(conn, "blitz_week")
    conn.execute("UPDATE fixtures SET status = 'FT'")
    out = contests.tick(conn, t(20, "17:15"))
    assert (c, "live", "review") in out and (w, "live", "review") not in out
    assert state(conn, w) == "live"
    five(conn, c, fixture=2)
    contests.release(conn, c, "admin", t(20, "18:00"))
    assert (w, "live", "review") in contests.tick(conn, t(20, "18:01"))


# ---------------------------------------------------------------- release ---
def winnings_of(conn, wallet):
    return conn.execute("SELECT ready_lamports, locked_lamports FROM winnings WHERE wallet = %s", (wallet,)).fetchone()


def test_manual_review_then_release_credits_half_and_half(conn):
    c = single_day(conn)
    conn.execute("UPDATE fixtures SET status = 'FT'")
    five(conn, c, fixture=2)
    payouts.add(conn, "pot:blitz", SOL, "test")
    contests.tick(conn, t(20, "17:15"))
    assert state(conn, c) == "review"                               # manual_review is on: waits
    assert conn.execute("SELECT count(*) FROM winnings").fetchone()[0] == 0
    prizes = contests.release(conn, c, "admin-wallet", t(20, "17:30"))
    assert [(w, p, lam) for w, p, lam in prizes][:2] == [("w1", 1, SOL // 2), ("w2", 2, SOL // 4)]
    # 1 SOL pot, 1st gets 50% = 0.5 SOL: 0.25 ready + 0.25 locked
    assert winnings_of(conn, "w1") == (SOL // 4, SOL // 4)
    assert winnings_of(conn, "w5") == (25_000_000, 25_000_000)      # 5th: 5% = 0.05 SOL
    assert conn.execute("SELECT state, released_by, released_at FROM contests WHERE id = %s", (c,)).fetchone() \
        == ("final", "admin-wallet", t(20, "17:30"))
    assert contests.board(conn, c)[0] == {"place": 1, "wallet": "w1", "points": 50, "captain_points": 0,
                                          "prize_lamports": SOL // 2}
    with pytest.raises(ValueError):                                 # a second release pays nothing more
        contests.release(conn, c, "admin-wallet", t(20, "17:31"))
    assert winnings_of(conn, "w1") == (SOL // 4, SOL // 4)
    assert conn.execute("SELECT count(*) FROM winnings_events WHERE contest_id = %s", (c,)).fetchone()[0] == 5


def test_release_needs_review_state(conn):
    c = single_day(conn)
    with pytest.raises(ValueError, match="review"):
        contests.release(conn, c, "admin", t(20, "10:00"))


def test_review_switch_off_releases_automatically(conn, monkeypatch):
    monkeypatch.setitem(CFG["boards"], "manual_review", False)
    c = single_day(conn)
    conn.execute("UPDATE fixtures SET status = 'FT'")
    five(conn, c, fixture=2)
    payouts.add(conn, "pot:blitz", SOL, "test")
    out = contests.tick(conn, t(20, "17:15"))
    assert (c, "live", "review") in out and (c, "review", "final") in out
    assert state(conn, c) == "final"
    assert winnings_of(conn, "w1") == (SOL // 4, SOL // 4)
    assert conn.execute("SELECT released_by FROM contests WHERE id = %s", (c,)).fetchone()[0] == "auto"


def test_under_three_entrants_rolls_and_credits_nobody(conn):
    c = single_day(conn)
    conn.execute("UPDATE fixtures SET status = 'FT'")
    enter(conn, c, "w1", 10)
    enter(conn, c, "w2", 5)
    payouts.add(conn, "pot:blitz", SOL, "test")
    contests.tick(conn, t(20, "17:15"))
    assert contests.release(conn, c, "admin", t(20, "17:30")) == []
    assert state(conn, c) == "rolled"
    assert conn.execute("SELECT count(*) FROM winnings").fetchone()[0] == 0
    assert payouts.bucket(conn, "pot:blitz") == SOL                 # the money stays for the next board


# ------------------------------------------------------------- blitz week ---
def two_days(conn):
    """Fri 20 15:00 (fixture 2) and Sat 21 12:30 (fixture 4), both played."""
    fx(conn, 2, t(20, "15:00"), "FT")
    fx(conn, 4, t(21, "12:30"), "FT")
    contests.ensure(conn, t(20, "09:00"))
    fri, sat = cid(conn, "blitz_matchday", date(2026, 11, 20)), cid(conn, "blitz_matchday", date(2026, 11, 21))
    five(conn, fri, fixture=2, pts=(10, 20, 30, 40, 50))
    five(conn, sat, fixture=4, pts=(50, 0, 0, 0, 0))
    return fri, sat


def test_blitz_week_sums_matchdays_and_pays_fixed_prize(conn):
    fri, sat = two_days(conn)
    w = cid(conn, "blitz_week")
    out = contests.tick(conn, t(21, "15:00"))                       # Sat ends 14:30, final 14:45
    assert (fri, "live", "review") in out and (sat, "live", "review") in out and state(conn, w) == "live"
    for c in (fri, sat):
        payouts.add(conn, "pot:blitz", SOL, "test")
        contests.release(conn, c, "admin", t(21, "15:05"))
    assert (w, "live", "review") in contests.tick(conn, t(21, "15:10"))
    with pytest.raises(ValueError, match="price"):
        contests.release(conn, w, "admin", t(21, "15:11"))          # needs sol_usd
    with pytest.raises(ValueError, match="price"):
        contests.release(conn, w, "admin", t(21, "15:11"), sol_usd=0)
    assert state(conn, w) == "review"
    contests.release(conn, w, "admin", t(21, "15:12"), sol_usd=160)
    # sums: w1 10+50 = 60, w5 50+0, w4 40, w3 30, w2 20
    assert [(r["wallet"], r["points"]) for r in contests.board(conn, w)] == \
        [("w1", 60), ("w5", 50), ("w4", 40), ("w3", 30), ("w2", 20)]
    # $500 / $160 = 3.125 SOL; 1st = 50% = 1.5625 SOL, half ready = 0.78125 SOL
    assert conn.execute("SELECT pot_lamports FROM contests WHERE id = %s", (w,)).fetchone()[0] == 3_125_000_000
    assert conn.execute("""SELECT ready_delta, locked_delta FROM winnings_events WHERE contest_id = %s AND wallet = 'w1'""",
                        (w,)).fetchone() == (781_250_000, 781_250_000)
    assert state(conn, w) == "final"


def test_auto_release_of_week_needs_price(conn, monkeypatch):
    monkeypatch.setitem(CFG["boards"], "manual_review", False)
    fri, _ = two_days(conn)
    contests.tick(conn, t(21, "15:00"))
    w = cid(conn, "blitz_week")
    contests.tick(conn, t(21, "15:10"))                             # matchdays final now
    assert state(conn, w) == "review"                               # no sol_usd: waits for the owner
    assert (w, "review", "final") in contests.tick(conn, t(21, "15:11"), sol_usd=160)   # price given: released
    assert state(conn, w) == "final"


# ---------------------------------------------------------- build_results ---
def test_build_results_sums_entries_and_zero_for_unscored(conn):
    c = single_day(conn)
    enter(conn, c, "w1", 10, cap=4, slot=1)
    enter(conn, c, "w1", 5, cap=2, slot=2)
    enter(conn, c, "w2", None, slot=1)                              # no score yet
    contests.build_results(conn, c)
    rows = {r["wallet"]: (r["points"], r["captain_points"]) for r in contests.board(conn, c)}
    assert rows == {"w1": (15, 6), "w2": (0, 0)}


def test_build_results_leaves_final_rows(conn):
    c = single_day(conn)
    e1 = enter(conn, c, "w1", 10)
    e2 = enter(conn, c, "w2", 20)
    contests.build_results(conn, c)
    conn.execute("UPDATE results SET is_final = true WHERE wallet = 'w1'")
    conn.execute("UPDATE entry_scores SET points = 99 WHERE entry_id IN (%s, %s)", (e1, e2))
    contests.build_results(conn, c)
    assert {r["wallet"]: r["points"] for r in contests.board(conn, c)} == {"w1": 10, "w2": 99}


# ---------------------------------------------------------------- current ---
def test_current(conn):
    world(conn)
    contests.ensure(conn, t(17, "09:00"))
    got = contests.current(conn, t(19, "12:00"))                    # Thursday: no matchday, next is Fri 20
    assert [(c["kind"], c["day"]) for c in got] == [("blitz_matchday", date(2026, 11, 20)), ("blitz_week", None),
                                                    ("draft_week", None)]
    assert [c["fixtures"] for c in got] == [2, 5, 4]
    assert got[0]["first_kickoff"] == t(20, "15:00") and got[2]["locks_at"] == t(20, "15:00")
    assert contests.current(conn, t(18, "12:00"))[0]["day"] == date(2026, 11, 18)


def test_blitz_week_counts_only_the_best_three_matchdays(conn):
    """A wallet with matchday totals 10, 40, 30 and 20 (captain points 1, 4, 3, 2) scores its best three:
    40 + 30 + 20 = 90, captain points 4 + 3 + 2 = 9. A wallet with two matchdays (50, 5) scores both: 55."""
    week = date(2026, 11, 17)
    wk = conn.execute("INSERT INTO contests (kind, week_start) VALUES ('blitz_week', %s) RETURNING id", (week,)).fetchone()[0]
    days = []
    for i in range(4):
        days.append(conn.execute("""INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', %s, %s)
                                    RETURNING id""", (week + timedelta(days=i), week)).fetchone()[0])
    for cid, pts, cap in zip(days, (10, 40, 30, 20), (1, 4, 3, 2)):
        conn.execute("INSERT INTO results (contest_id, wallet, points, captain_points) VALUES (%s, 'four', %s, %s)",
                     (cid, pts, cap))
    for cid, pts in zip(days, (50, 5)):
        conn.execute("INSERT INTO results (contest_id, wallet, points) VALUES (%s, 'two', %s)", (cid, pts))
    contests.build_results(conn, wk)
    rows = dict((w, (float(p), float(c))) for w, p, c in conn.execute(
        "SELECT wallet, points, captain_points FROM results WHERE contest_id = %s", (wk,)))
    assert rows == {"four": (90.0, 9.0), "two": (55.0, 0.0)}
