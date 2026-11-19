"""elevn 2.0 tables and config: contests, entries, winnings. Skipped if the local Postgres is not running."""

from datetime import date

import psycopg
import pytest

from squad.config import CFG
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
NEW_TABLES = ["contests", "entries", "entry_players", "draft_packs", "entry_scores", "results",
              "winnings", "winnings_events"]


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


def world(c):
    """2 clubs, 2 players, 2 fixtures: the parents the foreign keys need."""
    for club in (1, 2, 3):
        c.execute("INSERT INTO clubs (id, name) VALUES (%s, %s)", (club, f"Club {club}"))
    for pid, club in ((101, 1), (201, 2)):
        c.execute("INSERT INTO players (id, name, position, club_id, league_id) VALUES (%s, %s, 'MID', %s, 39)",
                  (pid, f"P{pid}", club))
    for fid, away in ((1, 2), (2, 3)):
        c.execute("""INSERT INTO fixtures (id, league_id, season, round, kickoff, status, home_club_id, away_club_id)
                     VALUES (%s, 39, 2026, 'R1', now(), 'NS', 1, %s)""", (fid, away))
    conn_commit(c)


def conn_commit(c):
    c.commit()


def refused(c, sql, params=()):
    with pytest.raises(psycopg.errors.IntegrityError):
        c.execute(sql, params)
    c.rollback()


def contest(c, kind, day, week=date(2026, 11, 17)):
    return c.execute("INSERT INTO contests (kind, day, week_start) VALUES (%s, %s, %s) RETURNING id",
                     (kind, day, week)).fetchone()[0]


def test_init_schema_is_rerunnable(conn):
    init_schema(conn)
    init_schema(conn)


def test_new_tables_exist(conn):
    rows = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").fetchall()
    have = {r[0] for r in rows}
    assert set(NEW_TABLES) <= have


def test_contest_constraints(conn):
    refused(conn, "INSERT INTO contests (kind, week_start) VALUES ('blitz_matchday', '2026-11-17')")
    refused(conn, "INSERT INTO contests (kind, day, week_start) VALUES ('blitz_week', '2026-11-17', '2026-11-17')")
    contest(conn, "blitz_matchday", date(2026, 11, 21))
    conn.commit()
    refused(conn, "INSERT INTO contests (kind, day, week_start) VALUES ('blitz_matchday', '2026-11-21', '2026-11-17')")
    contest(conn, "blitz_week", None)
    contest(conn, "draft_week", None)
    conn.commit()
    refused(conn, "INSERT INTO contests (kind, week_start) VALUES ('draft_week', '2026-11-17')")


def test_entry_constraints(conn):
    world(conn)
    cid = contest(conn, "blitz_matchday", date(2026, 11, 21))
    conn.commit()
    ins = "INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id) VALUES (%s, 'w', %s, %s, 101)"
    refused(conn, ins, (cid, 4, 1))
    conn.execute(ins, (cid, 1, 1))
    conn.commit()
    refused(conn, ins, (cid, 2, 1))          # same wallet, same fixture
    conn.execute(ins, (cid, 2, 2))           # a different fixture is fine
    conn.commit()


def test_winnings_constraints(conn):
    cid = contest(conn, "blitz_matchday", date(2026, 11, 21))
    conn.commit()
    refused(conn, "INSERT INTO winnings (wallet, ready_lamports) VALUES ('w', -1)")
    ins = "INSERT INTO winnings_events (wallet, kind, contest_id) VALUES ('w', 'credit', %s)"
    conn.execute(ins, (cid,))
    conn.commit()
    refused(conn, ins, (cid,))


def test_config():
    assert sum(CFG["boards"]["place_split"]) == pytest.approx(1.0, abs=1e-9)
    assert sum(CFG["boards"]["mode_split"].values()) == pytest.approx(1.0, abs=1e-9)
    assert CFG["release"]["collect_share"] == 0.5
    assert CFG["release"]["withdraw_share"] == 0.2
    assert CFG["blitz"]["requirement"] == 150_000
    assert CFG["draft"]["requirement"] == 300_000
    assert CFG["draft"]["max_per_tier"] == {"top": 2, "mid": 2}
    assert "min_holding_hours" not in CFG["access"]
