"""Weekly Draft: personal packs, a five-a-side from the wallet's own 15, lock, swap, scoring (config [draft]).

A week is a 'draft_week' contest; its fixtures (Friday to Monday, `contests.fixtures_of`) are the window and it
locks at `locks_at`. Each wallet is dealt `packs` packs (one top, one mid, one budget player each) once, stored in
`draft_packs` with the value at dealing. The team is one `entries` row (slot 1, no fixture) plus `entry_players`.

Value = a player's latest `player_prices.price` (no price counts as 0, so the player is budget).
Points: each team player's `player_match_scores.base` summed over every window fixture, the captain times
`captain_multiplier`. A final `entry_scores` row (every window fixture over, 15 minutes on, all scores final)
never changes. States of a team: open -> locked -> live -> final.

No network calls: the caller passes the wallet's $ELEVN balance. Callers pass `conn` (they commit) and `now`.
"""

import random
import secrets
from datetime import datetime, timezone

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import blitz, contests
from .config import CFG

D = CFG["draft"]
POSITIONS = ("DEF", "MID", "FWD")
MIN_IN_DEAL = 2                  # every 15 holds at least this many of each outfield position (not in config)
MAX_REDRAWS = 500


class DraftError(Exception):
    """A refusal, with a message a player can read."""


def _now(now):
    return now or datetime.now(timezone.utc)


def _rows(conn, sql, args=()):
    return conn.cursor(row_factory=dict_row).execute(sql, args).fetchall()


def _contest(conn, contest_id):
    rows = _rows(conn, "SELECT * FROM contests WHERE id = %s AND kind = 'draft_week' FOR UPDATE", (contest_id,))
    if not rows:
        raise DraftError("That Draft week does not exist.")
    return rows[0]


def _window(conn, contest):
    """The window's fixtures with their clubs, earliest first."""
    ids = [f["id"] for f in contests.fixtures_of(conn, contest)]
    return _rows(conn, """SELECT id, kickoff, status, home_club_id, away_club_id FROM fixtures
                          WHERE id = ANY(%s) ORDER BY kickoff, id""", (ids,))


def _club_fixtures(window, club_id):
    return [f for f in window if club_id in (f["home_club_id"], f["away_club_id"])]


# ------------------------------------------------------------------ packs ---
def _eligible(conn, contest):
    """Ranked eligible players (best value first) with their tier."""
    clubs = {c for f in _window(conn, contest) for c in (f["home_club_id"], f["away_club_id"])}
    rows = _rows(conn, """SELECT p.id, p.name, p.position, p.club_id, c.name AS club,
                                 COALESCE((SELECT pp.price FROM player_prices pp WHERE pp.player_id = p.id
                                           ORDER BY pp.gameweek_id DESC LIMIT 1), 0)::float AS value
                          FROM players p JOIN clubs c ON c.id = p.club_id
                          WHERE p.club_id = ANY(%s) AND p.position IS NOT NULL
                            AND (p.position <> 'GK' OR %s)""", (list(clubs), D["goalkeepers"]))
    rows.sort(key=lambda r: (-r["value"], r["id"]))
    n = len(rows)
    n_top, n_mid = round(n * D["tier_shares"]["top"]), round(n * D["tier_shares"]["mid"])
    for i, r in enumerate(rows):
        r["tier"] = "top" if i < n_top else "mid" if i < n_top + n_mid else "budget"
    return rows


def _draw(eligible, key):
    """15 players as packs [(pack, tier, player row)], random but repeatable from `key`."""
    by_tier = {t: [r for r in eligible if r["tier"] == t] for t in D["tiers"]}
    if any(len(v) < D["packs"] for v in by_tier.values()):
        raise DraftError("There are not enough players with matches this week to deal packs.")
    rng = random.Random(key)
    for _ in range(MAX_REDRAWS):
        picks = {t: rng.sample(v, D["packs"]) for t, v in by_tier.items()}
        pool = [r for v in picks.values() for r in v]
        if all(sum(r["position"] == pos for r in pool) >= MIN_IN_DEAL for pos in POSITIONS):
            return [(i + 1, t, picks[t][i]) for i in range(D["packs"]) for t in D["tiers"]]
    raise DraftError("Packs could not be dealt for this week.")


def _shape(packs, opened=None):
    return [{"pack": n, "tier": t, "player_id": r["id"], "name": r["name"], "position": r["position"],
             "club": r["club"], "value": r["value"], "opened_at": (opened or {}).get((n, t))} for n, t, r in packs]


def _stored(conn, contest_id, wallet):
    return _rows(conn, """SELECT d.pack, d.tier, d.player_id, p.name, p.position, p.club_id, c.name AS club,
                                 d.value::float AS value, d.opened_at
                          FROM draft_packs d JOIN players p ON p.id = d.player_id JOIN clubs c ON c.id = p.club_id
                          WHERE d.contest_id = %s AND d.wallet = %s
                          ORDER BY d.pack, array_position(%s::text[], d.tier)""",
                 (contest_id, wallet, list(D["tiers"])))


def deal(conn, contest_id, wallet):
    """The wallet's 15 (pack, tier, player_id, name, position, club, value, opened_at). Dealt once, then stored."""
    contest = _contest(conn, contest_id)
    rows = _stored(conn, contest_id, wallet)
    if not rows:
        for n, t, r in _draw(_eligible(conn, contest), f"draft:{contest_id}:{wallet}"):
            conn.execute("""INSERT INTO draft_packs (contest_id, wallet, pack, tier, player_id, value)
                            VALUES (%s, %s, %s, %s, %s, %s)""", (contest_id, wallet, n, t, r["id"], r["value"]))
        rows = _stored(conn, contest_id, wallet)
    return [{k: v for k, v in r.items() if k != "club_id"} for r in rows]


def sample(conn, contest_id, seed=None):
    """A guest's 15, same rules and shape as `deal`, from a random seed (or the given one). Nothing is stored."""
    contest = _contest(conn, contest_id)
    seed = secrets.token_hex(8) if seed is None else seed
    return _shape(_draw(_eligible(conn, contest), f"sample:{contest_id}:{seed}"))


def open_pack(conn, contest_id, wallet, pack, now=None):
    """Mark a pack opened and return its three players. Raises DraftError if the wallet has no such pack."""
    now = _now(now)
    deal(conn, contest_id, wallet)
    if not conn.execute("""UPDATE draft_packs SET opened_at = COALESCE(opened_at, %s)
                           WHERE contest_id = %s AND wallet = %s AND pack = %s""", (now, contest_id, wallet, pack)).rowcount:
        raise DraftError("There is no such pack.")
    return [r for r in deal(conn, contest_id, wallet) if r["pack"] == pack]


# ------------------------------------------------------------------ rules ---
def _problems(info, team_ids, captain_id):
    """Problems with a team. `info` is {player_id: {position, club, tier}} for the wallet's 15."""
    size, ids, problems = D["team_size"], list(team_ids), []
    if len(ids) != size or len(set(ids)) != len(ids):
        problems.append(f"A team needs exactly {size} different players.")
    if any(p not in info for p in ids):
        problems.append("Every player must come from your own 15.")
        ids = [p for p in ids if p in info]
    for pos, need in D["min_per_position"].items():
        if sum(info[p]["position"] == pos for p in set(ids)) < need:
            problems.append(f"Pick at least {need} {dict(DEF='defender', MID='midfielder', FWD='attacker').get(pos, pos)}.")
    for club in sorted({info[p]["club"] for p in ids}):
        if sum(info[p]["club"] == club for p in set(ids)) > D["max_per_club"]:
            problems.append(f"Pick at most {D['max_per_club']} players from {club}.")
    for tier, most in D["max_per_tier"].items():
        if sum(info[p]["tier"] == tier for p in set(ids)) > most:
            problems.append(f"Pick at most {most} {tier.capitalize()} players.")
    if captain_id not in team_ids:
        problems.append("The captain must be one of the team's players.")
    return problems


def check(conn, contest_id, pool_player_ids, team_ids, captain_id, wallet=None):
    """Plain-English problems with a team picked from a pool of 15 (empty list = valid). Saves nothing.
    A signed-in wallet with dealt packs is checked against its stored tiers, exactly as `save` does."""
    contest = _contest(conn, contest_id)
    if wallet and (info := _info(conn, contest_id, wallet)):
        return _problems(info, team_ids, captain_id)
    tiers = {r["id"]: r for r in _eligible(conn, contest)}
    info = {p: {"position": tiers[p]["position"], "club": tiers[p]["club"], "tier": tiers[p]["tier"]}
            for p in pool_player_ids if p in tiers}
    if len(info) != len(set(pool_player_ids)):
        return ["Some of those players are not available this week."]
    return _problems(info, team_ids, captain_id)


def _info(conn, contest_id, wallet):
    return {r["player_id"]: {"position": r["position"], "club": r["club"], "tier": r["tier"], "value": r["value"],
                             "club_id": r["club_id"]} for r in _stored(conn, contest_id, wallet)}


def _entry(conn, contest_id, wallet):
    rows = _rows(conn, """SELECT e.id, e.captain_id, e.locked_at,
                                 COALESCE(array_agg(p.player_id ORDER BY p.player_id)
                                          FILTER (WHERE p.player_id IS NOT NULL), '{}') AS players
                          FROM entries e LEFT JOIN entry_players p ON p.entry_id = e.id
                          WHERE e.contest_id = %s AND e.wallet = %s AND e.slot = 1 GROUP BY e.id""", (contest_id, wallet))
    return rows[0] if rows else None


def save(conn, wallet, contest_id, team_ids, captain_id, balance, now=None):
    """Create or replace the wallet's team. Returns the entry id. Raises DraftError on any refusal."""
    now = _now(now)
    contest = _contest(conn, contest_id)
    if balance < D["requirement"]:
        raise DraftError(f"Holding {D['requirement']:,} $ELEVN is needed to save a Draft team.")
    old = _entry(conn, contest_id, wallet)
    if now >= contest["locks_at"] or (old and old["locked_at"]):
        raise DraftError("This week's Draft has locked: teams can no longer change.")
    info = _info(conn, contest_id, wallet)
    if not info:
        raise DraftError("Open your packs first: you have no players to pick from.")
    problems = _problems(info, team_ids, captain_id)
    if problems:
        raise DraftError(" ".join(problems))
    if old:
        conn.execute("UPDATE entries SET captain_id = %s, updated_at = %s WHERE id = %s", (captain_id, now, old["id"]))
        conn.execute("DELETE FROM entry_players WHERE entry_id = %s", (old["id"],))
        entry_id = old["id"]
    else:
        entry_id = conn.execute("""INSERT INTO entries (contest_id, wallet, slot, fixture_id, captain_id, created_at, updated_at)
                                   VALUES (%s, %s, 1, NULL, %s, %s, %s) RETURNING id""",
                                (contest_id, wallet, captain_id, now, now)).fetchone()[0]
    for p in team_ids:
        conn.execute("INSERT INTO entry_players (entry_id, player_id) VALUES (%s, %s)", (entry_id, p))
    return entry_id


def lock(conn, now=None):
    """Set locked_at on every unlocked team whose week has passed its lock time. Returns how many."""
    return conn.execute("""UPDATE entries e SET locked_at = %s FROM contests c
                           WHERE c.id = e.contest_id AND c.kind = 'draft_week' AND e.locked_at IS NULL
                             AND c.locks_at <= %s""", (_now(now), _now(now))).rowcount


# ------------------------------------------------------------------- swap ---
def _called_off(window, club_id):
    """True when none of the club's window fixtures will be played (all postponed/cancelled, or none left)."""
    return all(f["status"] in blitz.NOT_PLAYED for f in _club_fixtures(window, club_id))


def _can_come_in(window, club_id, now):
    return any(f["status"] not in blitz.NOT_PLAYED and not blitz.kicked_off(f, now) for f in _club_fixtures(window, club_id))


def _do_swap(conn, entry, out_id, in_id):
    conn.execute("UPDATE entry_players SET player_id = %s WHERE entry_id = %s AND player_id = %s", (in_id, entry["id"], out_id))
    if entry["captain_id"] == out_id:
        conn.execute("UPDATE entries SET captain_id = %s, updated_at = now() WHERE id = %s", (in_id, entry["id"]))


def _swap_problem(info, window, entry, out_id, in_id, now):
    if out_id not in entry["players"]:
        return "That player is not in your team."
    if not _called_off(window, info[out_id]["club_id"]):
        return "That player's match has not been postponed or cancelled."
    if in_id not in info or in_id in entry["players"]:
        return "The replacement must be an unused player from your own 15."
    if info[in_id]["position"] != info[out_id]["position"]:
        return f"The replacement must be a {info[out_id]['position']}."
    if not _can_come_in(window, info[in_id]["club_id"], now):
        return "The replacement's match has already kicked off."
    team = [in_id if p == out_id else p for p in entry["players"]]
    captain = in_id if entry["captain_id"] == out_id else entry["captain_id"]
    return " ".join(_problems(info, team, captain)) or None


def swap(conn, wallet, contest_id, out_id, in_id, now=None):
    """The manager replaces a team player whose match is off with a player of his own 15. Raises DraftError."""
    now = _now(now)
    contest = _contest(conn, contest_id)
    entry = _entry(conn, contest_id, wallet)
    if not entry or now < contest["locks_at"]:
        raise DraftError("Swaps open once the week has locked and you have a team.")
    problem = _swap_problem(_info(conn, contest_id, wallet), _window(conn, contest), entry, out_id, in_id, now)
    if problem:
        raise DraftError(problem)
    _do_swap(conn, entry, out_id, in_id)


def swap_auto(conn, contest_id, now=None):
    """Swap every locked team's called-off player for the best valid unused same-position player. Returns swaps made."""
    now, made = _now(now), 0
    contest = _contest(conn, contest_id)
    if now < contest["locks_at"]:
        return 0
    window = _window(conn, contest)
    for e in _rows(conn, "SELECT wallet FROM entries WHERE contest_id = %s AND slot = 1 AND locked_at IS NOT NULL ORDER BY id",
                   (contest_id,)):
        info = _info(conn, contest_id, e["wallet"])
        for out_id in _entry(conn, contest_id, e["wallet"])["players"]:
            entry = _entry(conn, contest_id, e["wallet"])           # fresh: an earlier swap changed the team
            if out_id not in entry["players"] or not _called_off(window, info[out_id]["club_id"]):
                continue
            for cand in sorted(info, key=lambda p: (-info[p]["value"], p)):
                if info[cand]["position"] == info[out_id]["position"] and not _swap_problem(info, window, entry, out_id, cand, now):
                    _do_swap(conn, entry, out_id, cand)
                    made += 1
                    break
    return made


# ---------------------------------------------------------------- scoring ---
def _final(conn, window, now):
    """Every window fixture is over (or called off) and its scores are final."""
    return bool(window) and all(f["status"] in blitz.NOT_PLAYED or blitz._is_banked(conn, f, now) for f in window)


def _points(conn, window, player_ids, captain_id):
    """({player_id: points counted}, captain_points) from the scores stored now, over every window fixture."""
    base = {r[0]: float(r[1]) for r in conn.execute(
        """SELECT player_id, sum(base) FROM player_match_scores
           WHERE fixture_id = ANY(%s) AND player_id = ANY(%s) GROUP BY player_id""",
        ([f["id"] for f in window], list(player_ids)))}
    per = {p: round(base.get(p, 0.0) * (D["captain_multiplier"] if p == captain_id else 1), 2) for p in player_ids}
    return per, per.get(captain_id, 0.0)


def score(conn, contest_id, now=None):
    """Write entry_scores for the week's locked teams, final when the whole window is. Final rows never change.
    Returns how many rows were written."""
    now, written = _now(now), 0
    window = _window(conn, _contest(conn, contest_id))
    final = _final(conn, window, now)
    for e in _rows(conn, """SELECT e.id FROM entries e LEFT JOIN entry_scores s ON s.entry_id = e.id
                            WHERE e.contest_id = %s AND e.slot = 1 AND e.locked_at IS NOT NULL
                              AND COALESCE(NOT s.is_final, true) ORDER BY e.id""", (contest_id,)):
        entry = _rows(conn, """SELECT e.id, e.captain_id, array_agg(p.player_id) AS players FROM entries e
                               JOIN entry_players p ON p.entry_id = e.id WHERE e.id = %s GROUP BY e.id""", (e["id"],))[0]
        per, cap = _points(conn, window, entry["players"], entry["captain_id"])
        conn.execute("""INSERT INTO entry_scores (entry_id, points, captain_points, players, is_final, scored_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (entry_id) DO UPDATE SET points = EXCLUDED.points, captain_points = EXCLUDED.captain_points,
                          players = EXCLUDED.players, is_final = EXCLUDED.is_final, scored_at = EXCLUDED.scored_at
                        WHERE NOT entry_scores.is_final""",
                     (e["id"], round(sum(per.values()), 2), cap, Jsonb({str(p): v for p, v in per.items()}), final, now))
        written += 1
    return written


# ------------------------------------------------------------------ reads ---
def mine(conn, wallet, contest_id, now=None):
    """A wallet's packs (marked in_team), team with points, captain, state (open/locked/live/final) and total."""
    now = _now(now)
    contest = _contest(conn, contest_id)
    window = _window(conn, contest)
    entry = _entry(conn, contest_id, wallet)
    team = list(entry["players"]) if entry else []
    packs = [{**{k: v for k, v in r.items() if k != "club_id"}, "in_team": r["player_id"] in team}
             for r in _stored(conn, contest_id, wallet)]
    stored = conn.execute("""SELECT s.players, s.captain_points, s.is_final FROM entry_scores s
                             WHERE s.entry_id = %s""", (entry["id"],)).fetchone() if entry else None
    locked = bool(entry and entry["locked_at"]) or now >= contest["locks_at"]
    started = any(blitz.kicked_off(f, now) for f in window)
    if stored and stored[2]:
        state, per, cap = "final", {int(k): float(v) for k, v in stored[0].items()}, float(stored[1])
    else:
        state = "live" if locked and started else "locked" if locked else "open"
        per, cap = _points(conn, window, team, entry["captain_id"]) if entry and locked else ({}, 0.0)
        if entry and locked and _final(conn, window, now):
            state = "final"                                      # qualifies; `score` will write it
    names = {r["id"]: r for r in _rows(conn, "SELECT id, name, position FROM players WHERE id = ANY(%s)", (team,))}
    return {"state": state, "packs": packs, "captain_id": entry["captain_id"] if entry else None,
            "team": [{"id": p, "name": names[p]["name"], "position": names[p]["position"], "points": per.get(p, 0.0),
                      "is_captain": p == entry["captain_id"]} for p in team],
            "total": round(sum(per.values()), 2), "captain_points": cap}
