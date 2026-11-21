"""Penalty Shootout, a side game with no prize (rules: docs/build/SHOOTOUT_PLAN.md, config [shootout]).

A game is `rounds` rounds; in each the player shoots (side, power) and then keeps (side), in that order.
The opponent is a stored pick set of an earlier finished game by another wallet (a random set if none), held
in `shootout_games.opp` and never returned: a kick's response shows only that kick. Each call resolves one kick
with the server's random numbers (`rng`, injectable): first the miss roll, then, for a shot on target at the
side the keeper dived to, the save roll. Callers pass `conn` (they commit) and `now`.
"""

import random
import secrets
from datetime import datetime, time, timedelta, timezone

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import CFG
from .contests import UK, uk_date

SO = CFG["shootout"]
_ANY = object()      # wallet not given: the caller has already checked who is asking


class ShootoutError(Exception):
    """A refusal, with a message a player can read."""


def _now(now):
    return now or datetime.now(timezone.utc)


def _rng(rng):
    return rng or random.SystemRandom()


def _day(now):
    """[start, end) of the UK day containing now."""
    d = uk_date(_now(now))
    start = datetime.combine(d, time(0), UK)
    return start, datetime.combine(d + timedelta(days=1), time(0), UK)


def _side(side):
    if side not in SO["sides"]:
        raise ShootoutError("Pick left, centre or right.")
    return side


def _power(power):
    if power not in SO["powers"]:
        raise ShootoutError("Pick low, medium or high power.")
    return power


def _random_set(rng):
    return {"shots": [{"side": rng.choice(SO["sides"]), "power": rng.choice(SO["powers"])}
                      for _ in range(SO["rounds"])],
            "dives": [rng.choice(SO["sides"]) for _ in range(SO["rounds"])]}


def _opponent(conn, wallet, rng):
    """A stored set from another wallet's finished game, else a random one."""
    rows = conn.execute("SELECT picks FROM shootout_sets WHERE wallet IS DISTINCT FROM %s "
                        "ORDER BY id DESC LIMIT %s", (wallet, SO["stored_sets_pool"])).fetchall()
    return rng.choice(rows)[0] if rows else _random_set(rng)


def left_today(conn, wallet, now=None):
    """Ranked games the wallet may still start today (UK day)."""
    a, b = _day(now)
    used = conn.execute("SELECT count(*) FROM shootout_games WHERE wallet = %s AND mode = 'ranked' "
                        "AND created_at >= %s AND created_at < %s", (wallet, a, b)).fetchone()[0]
    return max(0, SO["ranked_games_per_day"] - used)


def start(conn, wallet, mode, now=None, rng=None):
    """Begin a game; returns its safe view (with the token a guest uses to carry on)."""
    if mode not in ("ranked", "practice"):
        raise ShootoutError("Choose a ranked or a practice game.")
    if mode == "ranked":
        if not wallet:
            raise ShootoutError("Ranked games need a connected wallet. Practice is open to everyone.")
        if left_today(conn, wallet, now) <= 0:
            raise ShootoutError(f"Daily limit reached: {SO['ranked_games_per_day']} ranked games a day. "
                                "Practice is unlimited.")
    rng = _rng(rng)
    token = secrets.token_urlsafe(16)
    conn.execute("INSERT INTO shootout_games (token, wallet, mode, opp, created_at) VALUES (%s, %s, %s, %s, %s)",
                 (token, wallet, mode, Jsonb(_opponent(conn, wallet, rng)), _now(now)))
    return status(conn, token)


def _load(conn, token, wallet, lock=False):
    rows = conn.cursor(row_factory=dict_row).execute(
        "SELECT * FROM shootout_games WHERE token = %s" + (" FOR UPDATE" if lock else ""), (token,)).fetchall()
    if not rows:
        raise ShootoutError("Unknown game.")
    g = rows[0]
    if wallet is not _ANY and g["mode"] == "ranked" and g["wallet"] != wallet:
        raise ShootoutError("This ranked game belongs to another wallet.")
    return g


def _turn(g):
    if g["state"] == "done":
        return None
    kicks = g["kicks"]
    return "keep" if len(kicks) % 2 else "shoot"


def _view(g, kick=None):
    out = {"token": g["token"], "mode": g["mode"], "state": g["state"], "turn": _turn(g),
           "round": min(len(g["kicks"]) // 2 + 1, SO["rounds"]), "rounds": SO["rounds"],
           "score": {"for": g["goals_for"], "against": g["goals_against"]}, "kicks": g["kicks"]}
    if g["state"] == "done":
        out["result"] = _result(g["goals_for"], g["goals_against"])
    if kick:
        out["kick"] = kick
    return out


def _result(gf, ga):
    return "win" if gf > ga else "loss" if gf < ga else "draw"


def status(conn, token, wallet=_ANY):
    """A game as the browser may see it: kicks played so far, never the opponent's remaining picks."""
    return _view(_load(conn, token, wallet))


def _kick(g, kind, side, power, rng):
    """Resolve one kick: kind 'shoot' (player vs the opponent's dive) or 'keep' (the opponent's shot vs player)."""
    i = len(g["kicks"]) // 2
    if kind == "shoot":
        shot, keeper = {"side": side, "power": power}, g["opp"]["dives"][i]
    else:
        shot, keeper = g["opp"]["shots"][i], side
    if rng.random() < SO["miss"][shot["power"]]:
        result = "missed"
    elif shot["side"] == keeper and rng.random() < SO["save"][shot["power"]]:
        result = "saved"
    else:
        result = "goal"
    return {"kind": kind, "round": i + 1, "shot_side": shot["side"], "power": shot["power"],
            "keeper_side": keeper, "result": result}


def _play(conn, token, wallet, kind, side, power, rng):
    g = _load(conn, token, wallet, lock=True)
    if g["state"] == "done":
        raise ShootoutError("This game is over. Start a new one.")
    if _turn(g) != kind:
        raise ShootoutError("It is your turn to keep, not to shoot." if kind == "shoot"
                            else "Take your shot first; then you keep.")
    kick = _kick(g, kind, _side(side), _power(power) if kind == "shoot" else None, _rng(rng))
    if kind == "shoot":
        g["goals_for"] += kick["result"] == "goal"
        g["picks"]["shots"].append({"side": side, "power": power})
    else:
        g["goals_against"] += kick["result"] == "goal"
        g["picks"]["dives"].append(side)
    g["kicks"] = g["kicks"] + [kick]
    if len(g["kicks"]) == SO["rounds"] * 2:
        g["state"] = "done"
    done = g["state"] == "done"
    conn.execute("""UPDATE shootout_games SET kicks = %s, picks = %s, goals_for = %s, goals_against = %s,
                    state = %s, finished_at = CASE WHEN %s THEN now() ELSE NULL END WHERE id = %s""",
                 (Jsonb(g["kicks"]), Jsonb(g["picks"]), g["goals_for"], g["goals_against"], g["state"],
                  done, g["id"]))
    if done and g["wallet"]:
        conn.execute("INSERT INTO shootout_sets (wallet, picks) VALUES (%s, %s)", (g["wallet"], Jsonb(g["picks"])))
    return _view(g, kick)


def shoot(conn, token, side, power, rng=None, wallet=_ANY):
    """The player's penalty for this round. Returns the kick and the running score."""
    return _play(conn, token, wallet, "shoot", side, _power(power), rng)


def keep(conn, token, side, rng=None, wallet=_ANY):
    """The player's dive against the opponent's penalty of this round."""
    return _play(conn, token, wallet, "keep", side, None, rng)


def board(conn, now=None, limit=None):
    """Today's finished ranked games per wallet: wins, then goal difference, then goals for."""
    a, b = _day(now)
    return conn.cursor(row_factory=dict_row).execute("""
        SELECT wallet, count(*)::int AS games,
               count(*) FILTER (WHERE goals_for > goals_against)::int AS wins,
               count(*) FILTER (WHERE goals_for = goals_against)::int AS draws,
               count(*) FILTER (WHERE goals_for < goals_against)::int AS losses,
               sum(goals_for)::int AS goals_for, sum(goals_against)::int AS goals_against
        FROM shootout_games WHERE mode = 'ranked' AND state = 'done' AND finished_at >= %s AND finished_at < %s
        GROUP BY wallet ORDER BY wins DESC, sum(goals_for) - sum(goals_against) DESC, goals_for DESC, wallet
        LIMIT %s""", (a, b, limit or SO["board_limit"])).fetchall()
