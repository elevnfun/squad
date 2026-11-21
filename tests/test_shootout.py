"""Penalty Shootout engine. Own database (squad_test_shootout)."""

import json

import psycopg
import pytest

from squad import shootout as so
from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"
DB = "squad_test_shootout"


class Fixed:
    """An rng whose random() is a fixed value; choice takes the first item."""

    def __init__(self, r=0.5):
        self.r = r

    def random(self):
        return self.r

    def choice(self, seq):
        return seq[0]


@pytest.fixture
def conn():
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db-container.sh)")
    admin.execute(f"DROP DATABASE IF EXISTS {DB}")
    admin.execute(f"CREATE DATABASE {DB}")
    c = psycopg.connect(URL.format(DB))
    init_schema(c)
    c.commit()
    yield c
    c.close()
    admin.execute(f"DROP DATABASE {DB}")
    admin.close()


def play(conn, token, shot="left", power="low", dive="left", rng=None, wallet=so._ANY):
    out = None
    for _ in range(5):
        so.shoot(conn, token, shot, power, rng=rng, wallet=wallet)
        out = so.keep(conn, token, dive, rng=rng, wallet=wallet)
    return out


def test_chance_table(conn):
    # the random set's opponent: Fixed picks left everywhere (dive left, shot left low)
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    # low never misses even at r=0.0; guessed low is saved
    k = so.shoot(conn, t, "left", "low", rng=Fixed(0.0))["kick"]
    assert k["result"] == "saved" and k["keeper_side"] == "left"
    so.keep(conn, t, "right", rng=Fixed(0.0))
    # wrong guess is a goal
    assert so.shoot(conn, t, "right", "low", rng=Fixed(0.99))["kick"]["result"] == "goal"
    so.keep(conn, t, "right", rng=Fixed(0.99))
    # medium misses below 0.1, else a wrong guess scores
    assert so.shoot(conn, t, "right", "medium", rng=Fixed(0.05))["kick"]["result"] == "missed"
    so.keep(conn, t, "right", rng=Fixed(0.99))
    assert so.shoot(conn, t, "right", "medium", rng=Fixed(0.5))["kick"]["result"] == "goal"
    so.keep(conn, t, "left", rng=Fixed(0.99))      # guessed the opponent's left shot: low is saved
    # high at 0.2 misses (<0.25); guessed high at 0.29 saved (<0.3), at 0.5 a goal
    assert so.shoot(conn, t, "left", "high", rng=Fixed(0.2))["kick"]["result"] == "missed"
    assert so.keep(conn, t, "left", rng=Fixed(0.99))["kick"]["result"] == "saved"
    t2 = so.start(conn, None, "practice", rng=Fixed())["token"]
    assert so.shoot(conn, t2, "left", "high", rng=Fixed(0.29))["kick"]["result"] == "saved"
    so.keep(conn, t2, "right", rng=Fixed())
    assert so.shoot(conn, t2, "left", "high", rng=Fixed(0.5))["kick"]["result"] == "goal"


def test_turn_order_and_bad_input(conn):
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    with pytest.raises(so.ShootoutError, match="Take your shot first"):
        so.keep(conn, t, "left", rng=Fixed())
    so.shoot(conn, t, "left", "low", rng=Fixed())
    with pytest.raises(so.ShootoutError, match="turn to keep"):
        so.shoot(conn, t, "left", "low", rng=Fixed())
    with pytest.raises(so.ShootoutError, match="left, centre or right"):
        so.keep(conn, t, "up", rng=Fixed())
    with pytest.raises(so.ShootoutError, match="power"):
        so.shoot(conn, so.start(conn, None, "practice")["token"], "left", "mega")
    with pytest.raises(so.ShootoutError, match="Unknown game"):
        so.status(conn, "nope")


def test_five_rounds_score_and_winner(conn):
    t = so.start(conn, None, "practice", rng=Fixed())["token"]    # opponent: dives left, shoots left low
    # we shoot right (goal, r high), dive right (opponent's left shot scores): 5-5 draw
    out = play(conn, t, "right", "low", "right", rng=Fixed(0.99))
    assert out["state"] == "done" and out["score"] == {"for": 5, "against": 5} and out["result"] == "draw"
    assert out["turn"] is None and len(out["kicks"]) == 10
    with pytest.raises(so.ShootoutError, match="over"):
        so.shoot(conn, t, "left", "low")
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    out = play(conn, t, "right", "low", "left", rng=Fixed(0.99))   # we score 5, save all 5
    assert out["score"] == {"for": 5, "against": 0} and out["result"] == "win"
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    out = play(conn, t, "left", "low", "right", rng=Fixed(0.99))   # saved every time, concede 5
    assert out["score"] == {"for": 0, "against": 5} and out["result"] == "loss"


def test_opponent_never_exposed(conn):
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    seen = [so.status(conn, t)]
    for i in range(5):
        seen.append(so.shoot(conn, t, "centre", "medium", rng=Fixed(0.99)))
        seen.append(so.status(conn, t))
        seen.append(so.keep(conn, t, "centre", rng=Fixed(0.99)))
    for view in seen:
        assert "opp" not in view and "dives" not in json.dumps(view)
        assert set(view["kicks"][0]) <= {"kind", "round", "shot_side", "power", "keeper_side", "result"} if view["kicks"] else True
    # before a round is played, no view lists that round's opponent pick
    assert seen[0]["kicks"] == []


def test_stored_set_reuse(conn):
    a, b = "walletA", "walletB"
    ta = so.start(conn, a, "ranked", rng=Fixed())["token"]
    play(conn, ta, "centre", "high", "right", rng=Fixed(0.99))
    stored = conn.execute("SELECT picks FROM shootout_sets WHERE wallet = %s", (a,)).fetchone()[0]
    assert stored["dives"] == ["right"] * 5 and stored["shots"][0] == {"side": "centre", "power": "high"}
    # another wallet gets A's set as its opponent
    tb = so.start(conn, b, "ranked", rng=Fixed())["token"]
    assert conn.execute("SELECT opp FROM shootout_games WHERE token = %s", (tb,)).fetchone()[0] == stored
    # the same wallet never faces its own set: it gets a random one (Fixed -> left everywhere)
    ta2 = so.start(conn, a, "ranked", rng=Fixed())["token"]
    opp = conn.execute("SELECT opp FROM shootout_games WHERE token = %s", (ta2,)).fetchone()[0]
    assert opp != stored and opp["dives"] == ["left"] * 5


def test_ranked_rules_and_daily_limit(conn):
    with pytest.raises(so.ShootoutError, match="connected wallet"):
        so.start(conn, None, "ranked")
    w = "walletA"
    assert so.left_today(conn, w) == 10
    for _ in range(10):
        so.start(conn, w, "ranked", rng=Fixed())
    assert so.left_today(conn, w) == 0
    with pytest.raises(so.ShootoutError, match="Daily limit"):
        so.start(conn, w, "ranked")
    so.start(conn, w, "practice")                      # practice is not limited
    assert so.left_today(conn, "walletB") == 10
    t = so.start(conn, "walletB", "ranked")["token"]
    with pytest.raises(so.ShootoutError, match="another wallet"):
        so.shoot(conn, t, "left", "low", wallet=w)
    with pytest.raises(so.ShootoutError, match="another wallet"):
        so.status(conn, t, wallet=None)


def test_guest_practice_saves_no_set(conn):
    t = so.start(conn, None, "practice", rng=Fixed())["token"]
    play(conn, t, rng=Fixed(0.99))
    assert conn.execute("SELECT count(*) FROM shootout_sets").fetchone()[0] == 0
    assert so.board(conn) == []


def test_board_order(conn):
    # (wallet, we shoot, we dive) against the all-left opponent: scores noted per wallet
    plans = {"win5": ("right", "left"),     # 5-0
             "win5b": ("right", "left"),    # 5-0 (ties win5 on everything)
             "draw": ("right", "right"),    # 5-5
             "lose": ("left", "right")}     # 0-5
    for w, (shot, dive) in plans.items():
        t = so.start(conn, w, "ranked", rng=Fixed())["token"]
        play(conn, t, shot, "low", dive, rng=Fixed(0.99))
        conn.execute("DELETE FROM shootout_sets")      # keep every opponent the all-left random set
    # a second finished game for win5b adds a win and goals, lifting it above win5
    t = so.start(conn, "win5b", "ranked", rng=Fixed())["token"]
    play(conn, t, "right", "low", "left", rng=Fixed(0.99))
    rows = so.board(conn)
    assert [r["wallet"] for r in rows] == ["win5b", "win5", "draw", "lose"]
    top = rows[0]
    assert (top["games"], top["wins"], top["draws"], top["losses"], top["goals_for"], top["goals_against"]) == (2, 2, 0, 0, 10, 0)
    assert so.board(conn, limit=2)[1]["wallet"] == "win5"
    # unfinished and practice games are not on the board
    so.start(conn, "late", "ranked")
    so.start(conn, "prac", "practice")
    assert len(so.board(conn)) == 4
