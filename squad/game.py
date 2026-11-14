"""Game logic: per-league gameweek state machine, squad saving, transfers, scoring and settlement.

  python -m squad.game prices --league SLUG [--round N]    starting prices from out/prices_<league>.csv
  python -m squad.game tick [--league SLUG] [--now ISO]    move every gameweek on whose time has come
  python -m squad.game run [--league SLUG]                 tick every minute
  python -m squad.game table --league SLUG --round N       gameweek leaderboard

Gameweek states, per league area:
  open      transfer window (from 1 h after the previous gameweek's last match); squads can be saved
  locked    first kickoff passed; saved squads are frozen, unsaved ones carry over
  live      matches under way; squad scores refresh on every tick
  settling  every match finished: next week's prices are set, its window opens 1 h later;
            waiting for the settlement delay
  settled   final re-pull, Rising Star levels, final squad scores
"""

import argparse
import csv
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from . import holdings, payouts
from .config import CFG, ROOT, launch_leagues
from .db import connect
from .rules import PlayerInfo, Problem, plan_transfers, validate_squad, weekly_price
from .scoring import MatchScore, Picks, advance_rising_stars, rising_star_next_level, score_gameweek

SEASON = CFG["seasons"]["current"]
GW = CFG["gameweeks"]
NOT_STARTED = {"TBD", "NS"}
VOID = {"PST", "CANC", "ABD", "AWD", "WO"}
FINISHED = {"FT", "AET", "PEN"}
UNAVAILABLE = ("injured", "suspended", "left_league", "off_season")   # 'doubtful' gets no free replacement


@dataclass
class Gameweek:
    id: int
    league_id: int
    season: int
    round: str
    number: int
    state: str
    first_kickoff: datetime | None
    settles_at: datetime | None
    window_opens_at: datetime | None = None


GW_COLS = "id, league_id, season, round, number, state, first_kickoff, settles_at, window_opens_at"


def gameweeks(conn, league_id, season=SEASON):
    rows = conn.execute(f"SELECT {GW_COLS} FROM gameweeks WHERE league_id = %s AND season = %s "
                        "ORDER BY number NULLS LAST, id", (league_id, season)).fetchall()
    return [Gameweek(*r) for r in rows]


def gameweek(conn, gameweek_id):
    return Gameweek(*conn.execute(f"SELECT {GW_COLS} FROM gameweeks WHERE id = %s", (gameweek_id,)).fetchone())


def gameweek_by_round(conn, league_id, rnd, season=SEASON):
    name = f"Regular Season - {rnd}" if str(rnd).isdigit() else rnd
    row = conn.execute(f"SELECT {GW_COLS} FROM gameweeks WHERE league_id = %s AND season = %s AND round = %s",
                       (league_id, season, name)).fetchone()
    return Gameweek(*row) if row else None


def previous(conn, gw):
    row = conn.execute(f"SELECT {GW_COLS} FROM gameweeks WHERE league_id = %s AND season = %s AND number < %s "
                       "ORDER BY number DESC LIMIT 1", (gw.league_id, gw.season, gw.number)).fetchone()
    return Gameweek(*row) if row else None


# ------------------------------------------------------ fixtures -> rounds ---
def refresh_gameweeks(conn, league_id, season=SEASON):
    """Put each fixture in the gameweek it is played in, then set lock and settlement times.

    A fixture belongs to its API-Football round unless it kicks off more than
    reschedule_days from the round's median kickoff (postponed or brought forward); then it
    counts for the gameweek whose window [start, next start) contains its kickoff, so those
    clubs play twice that week. Fixtures move only between gameweeks that are both still open.
    """
    gws = gameweeks(conn, league_id, season)
    by_round = {g.round: g for g in gws}
    fixtures = conn.execute("SELECT id, round, kickoff, status, gameweek_id FROM fixtures "
                            "WHERE league_id = %s AND season = %s", (league_id, season)).fetchall()
    kickoffs = defaultdict(list)
    for _, rnd, ko, status, _ in fixtures:
        if status not in VOID:
            kickoffs[rnd].append(ko)
    median = {rnd: sorted(k)[len(k) // 2] for rnd, k in kickoffs.items()}
    days = timedelta(days=GW["reschedule_days"])

    def core(rnd, ko):
        return rnd in median and abs(ko - median[rnd]) <= days

    starts = sorted((min(k for k in ks if core(rnd, k)), by_round[rnd].id) for rnd, ks in kickoffs.items())
    state = {g.id: g.state for g in gws}

    def played_in(ko):
        found = None
        for start, gid in starts:
            if start <= ko:
                found = gid
        return found

    moved = 0
    for fid, rnd, ko, status, current in fixtures:
        home = by_round[rnd].id
        target = home if status in VOID or core(rnd, ko) else (played_in(ko) or home)
        if current is None or (target != current and state[current] == "open" and state[target] == "open"):
            if target != current:
                conn.execute("UPDATE fixtures SET gameweek_id = %s WHERE id = %s", (target, fid))
                moved += current is not None
    conn.execute("""UPDATE gameweeks g SET first_kickoff = b.first, last_kickoff = b.last,
                      settles_at = b.last + make_interval(hours => %s)
                    FROM (SELECT gameweek_id, min(kickoff) AS first, max(kickoff) AS last FROM fixtures
                          WHERE league_id = %s AND season = %s AND status <> ALL(%s) GROUP BY gameweek_id) b
                    WHERE g.id = b.gameweek_id AND g.state <> 'settled'""",
                 (GW["match_hours"] + CFG["prizes"]["settlement_delay_hours"], league_id, season, list(VOID)))
    return moved


# ----------------------------------------------------------------- prices ---
def load_prices(conn, slug, gameweek_id, path=None):
    """Starting prices from the pricing script's CSV. The CSV's position is the player's game
    position (most frequent across the data)."""
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


def current_prices(conn, gw, player_ids):
    """Price of each player for a gameweek: the latest price set at or before it, else the
    position default."""
    rows = conn.execute("""SELECT p.id, p.position,
                             (SELECT pp.price FROM player_prices pp JOIN gameweeks g ON g.id = pp.gameweek_id
                              WHERE pp.player_id = p.id AND g.league_id = %s AND g.season = %s AND g.number <= %s
                              ORDER BY g.number DESC LIMIT 1)
                           FROM players p WHERE p.id = ANY(%s)""",
                        (gw.league_id, gw.season, gw.number, list(player_ids))).fetchall()
    default = CFG["pricing"]["default_price"]
    return {pid: float(price) if price is not None else default.get(pos, default["MID"]) for pid, pos, price in rows}


def reprice(conn, gw):
    """Weekly prices for the next open gameweek, from form, season PPG and ownership change."""
    target = conn.execute("""SELECT id FROM gameweeks WHERE league_id = %s AND season = %s AND number > %s
                             AND state = 'open' ORDER BY number LIMIT 1""",
                          (gw.league_id, gw.season, gw.number)).fetchone()
    if not target:
        return 0
    priced = [r[0] for r in conn.execute(
        """SELECT DISTINCT pp.player_id FROM player_prices pp JOIN gameweeks g ON g.id = pp.gameweek_id
           WHERE g.league_id = %s AND g.season = %s AND g.number <= %s""",
        (gw.league_id, gw.season, gw.number)).fetchall()]
    prices = current_prices(conn, gw, priced)

    apps = defaultdict(list)                      # player -> base points per appearance, oldest first
    for pid, base in conn.execute(
            """SELECT s.player_id, s.base FROM player_match_scores s
               JOIN player_match_stats st USING (fixture_id, player_id)
               JOIN fixtures f ON f.id = s.fixture_id JOIN gameweeks g ON g.id = f.gameweek_id
               WHERE f.league_id = %s AND f.season = %s AND g.number <= %s AND st.minutes > 0
               ORDER BY f.kickoff, f.id""", (gw.league_id, gw.season, gw.number)).fetchall():
        apps[pid].append(float(base))

    own_delta = defaultdict(float)
    prev = previous(conn, gw)
    if prev:
        # ownership change among squads that played both weeks, so new squads do not move prices
        rows = conn.execute("""SELECT gameweek_id, squad_id, player_id FROM squad_picks
                               WHERE gameweek_id IN (%s, %s)""", (gw.id, prev.id)).fetchall()
        owned = {gw.id: defaultdict(set), prev.id: defaultdict(set)}
        for g, sid, pid in rows:
            owned[g][sid].add(pid)
        common = set(owned[gw.id]) & set(owned[prev.id])
        for sid in common:
            for pid in owned[gw.id][sid] - owned[prev.id][sid]:
                own_delta[pid] += 1 / len(common)
            for pid in owned[prev.id][sid] - owned[gw.id][sid]:
                own_delta[pid] -= 1 / len(common)

    n_form = CFG["pricing"]["weekly"]["form_matches"]
    for pid, price in prices.items():
        pts = apps.get(pid, [])
        form = sum(pts[-n_form:]) / len(pts[-n_form:]) if pts else None
        ppg = sum(pts) / len(pts) if pts else None
        new = weekly_price(price, form, ppg, own_delta[pid])
        conn.execute("""INSERT INTO player_prices (player_id, gameweek_id, price, source) VALUES (%s, %s, %s, 'weekly')
                        ON CONFLICT (player_id, gameweek_id) DO UPDATE SET price = EXCLUDED.price,
                          source = EXCLUDED.source""", (pid, target[0], new))
    return len(prices)


# ----------------------------------------------------------------- squads ---
def create_squad(conn, wallet, league_id, season=SEASON, slot=1, name=None):
    sid = conn.execute("""INSERT INTO squads (wallet, league_id, season, slot, name) VALUES (%s, %s, %s, %s, %s)
                          RETURNING id""", (wallet, league_id, season, slot, name)).fetchone()[0]
    conn.commit()
    return sid


def delete_squad(conn, squad_id):
    """Delete a squad that has never played (no picks in a locked or later gameweek, no prize).
    Returns False, deleting nothing, if it has played: its points and prizes stay on record."""
    played = conn.execute("""SELECT EXISTS (SELECT 1 FROM squad_picks p JOIN gameweeks g ON g.id = p.gameweek_id
                                            WHERE p.squad_id = %s AND g.state <> 'open')
                                OR EXISTS (SELECT 1 FROM squad_gameweek_scores WHERE squad_id = %s)
                                OR EXISTS (SELECT 1 FROM prizes WHERE squad_id = %s)""",
                          (squad_id, squad_id, squad_id)).fetchone()[0]
    if played:
        return False
    for table in ("squad_drafts", "squad_picks", "transfers", "squad_banks", "squad_freezes"):
        conn.execute(f"DELETE FROM {table} WHERE squad_id = %s", (squad_id,))
    conn.execute("DELETE FROM squads WHERE id = %s", (squad_id,))
    conn.commit()
    return True


def save_draft(conn, squad_id, picks):
    """Work in progress: stored as-is, never checked, never scored."""
    conn.execute("""INSERT INTO squad_drafts (squad_id, picks, updated_at) VALUES (%s, %s, now())
                    ON CONFLICT (squad_id) DO UPDATE SET picks = EXCLUDED.picks, updated_at = now()""",
                 (squad_id, Jsonb(picks)))
    conn.commit()


def window_gameweek(conn, league_id, season=SEASON, now=None):
    """The gameweek squads are being saved for, or None if the transfer window is shut."""
    now = now or datetime.now(timezone.utc)
    row = conn.execute(f"SELECT {GW_COLS} FROM gameweeks WHERE league_id = %s AND season = %s AND state = 'open' "
                       "ORDER BY number LIMIT 1", (league_id, season)).fetchone()
    if not row:
        return None
    gw = Gameweek(*row)
    if gw.first_kickoff and now >= gw.first_kickoff:
        return None
    prev = previous(conn, gw)
    if prev is None:
        return gw
    opened = prev.state == "settled" or (prev.state == "settling" and prev.window_opens_at is not None
                                         and now >= prev.window_opens_at)
    return gw if opened else None


def last_picks(conn, squad_id, gw):
    """(player ids, bank) from the squad's latest gameweek before gw, or (None, None)."""
    row = conn.execute("""SELECT g.id FROM squad_picks sp JOIN gameweeks g ON g.id = sp.gameweek_id
                          WHERE sp.squad_id = %s AND g.league_id = %s AND g.season = %s AND g.number < %s
                          ORDER BY g.number DESC LIMIT 1""", (squad_id, gw.league_id, gw.season, gw.number)).fetchone()
    if not row:
        return None, None
    ids = [r[0] for r in conn.execute("SELECT player_id FROM squad_picks WHERE squad_id = %s AND gameweek_id = %s "
                                      "ORDER BY slot", (squad_id, row[0])).fetchall()]
    bank = conn.execute("SELECT bank FROM squad_banks WHERE squad_id = %s AND gameweek_id = %s",
                        (squad_id, row[0])).fetchone()
    return ids, float(bank[0]) if bank else 0.0


def team_value(conn, squad_id, gw):
    """The squad's budget for gw: last week's bank + what last week's players sell for now
    (their current prices, profit included). 100M before the squad's first save."""
    ids, bank = last_picks(conn, squad_id, gw)
    if ids is None:
        return CFG["squad"]["budget"]
    return round(bank + sum(current_prices(conn, gw, ids).values()), 1)


def player_info(conn, ids):
    rows = conn.execute("SELECT id, position, club_id, league_id, name FROM players WHERE id = ANY(%s)",
                        (list(ids),)).fetchall()
    return {r[0]: PlayerInfo(*r) for r in rows}


def rising_star_ids(conn, league_id, season, on_date):
    return {r[0] for r in conn.execute(
        """SELECT player_id FROM rising_stars WHERE league_id = %s AND season = %s
           AND active_from <= %s AND (active_to IS NULL OR active_to >= %s)""",
        (league_id, season, on_date, on_date)).fetchall()}


@dataclass
class SaveResult:
    ok: bool
    problems: list = field(default_factory=list)
    gameweek_id: int | None = None
    cost: float = 0.0
    transfers: list = field(default_factory=list)
    penalty: int = 0
    budget: float = 0.0           # team value the squad was checked against


def save_squad(conn, squad_id, starters, bench, captain, vice_captain, now=None, dry_run=False):
    """Check every squad rule and, if they all pass, save the squad for the open gameweek.
    dry_run: check and count transfers only, write nothing (the builder's live preview).

    Saving again before lock replaces the earlier save; transfers are always counted
    against the squad as it stood last gameweek, so undoing a change costs nothing.
    """
    now = now or datetime.now(timezone.utc)
    league_id, season = conn.execute("SELECT league_id, season FROM squads WHERE id = %s", (squad_id,)).fetchone()
    gw = window_gameweek(conn, league_id, season, now)
    if gw is None:
        return SaveResult(False, [Problem("window_closed", "The transfer window is closed")])
    ids = list(starters) + list(bench)
    prev, _ = last_picks(conn, squad_id, gw)
    players = player_info(conn, set(ids) | set(prev or []))
    cost = current_prices(conn, gw, [p for p in ids if p in players])
    budget = team_value(conn, squad_id, gw)
    stars = rising_star_ids(conn, league_id, season, now.date())
    problems = validate_squad(starters, bench, captain, vice_captain, players, league_id, cost, stars, budget)
    total = round(sum(cost.values()), 1)
    if problems:
        return SaveResult(False, problems, gw.id, total, budget=budget)

    unavailable = set()
    if prev:
        unavailable = {r[0] for r in conn.execute(
            "SELECT player_id FROM player_availability WHERE gameweek_id = %s AND status = ANY(%s)",
            (gw.id, list(UNAVAILABLE))).fetchall()}
        unavailable |= {p for p in prev if players[p].league_id != league_id}
    transfers = plan_transfers(prev, ids,
                               {p: players[p].position for p in players}, unavailable)
    if dry_run:
        return SaveResult(True, [], gw.id, total, transfers, sum(t.penalty for t in transfers), budget)

    conn.execute("DELETE FROM squad_picks WHERE squad_id = %s AND gameweek_id = %s", (squad_id, gw.id))
    for slot, pid in enumerate(ids, start=1):
        conn.execute("""INSERT INTO squad_picks (squad_id, gameweek_id, player_id, slot, is_captain, is_vice, price)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                     (squad_id, gw.id, pid, slot, pid == captain, pid == vice_captain, cost[pid]))
    conn.execute("""INSERT INTO squad_banks (squad_id, gameweek_id, team_value, bank) VALUES (%s, %s, %s, %s)
                    ON CONFLICT (squad_id, gameweek_id) DO UPDATE SET team_value = EXCLUDED.team_value,
                      bank = EXCLUDED.bank""", (squad_id, gw.id, budget, round(budget - total, 1)))
    conn.execute("DELETE FROM transfers WHERE squad_id = %s AND gameweek_id = %s", (squad_id, gw.id))
    for t in transfers:
        conn.execute("""INSERT INTO transfers (squad_id, gameweek_id, player_out, player_in, kind, penalty)
                        VALUES (%s, %s, %s, %s, %s, %s)""",
                     (squad_id, gw.id, t.player_out, t.player_in, t.kind, t.penalty))
    conn.commit()
    return SaveResult(True, [], gw.id, total, transfers, sum(t.penalty for t in transfers), budget)


# ---------------------------------------------------------------- scoring ---
def match_scores(conn, gw):
    """MatchScores of the gameweek's fixtures, in kickoff order."""
    rows = conn.execute("""SELECT s.player_id, s.fixture_id, st.minutes, st.rating, s.core_plus, s.core_minus,
                                  s.involvement, s.breakdown
                           FROM player_match_scores s JOIN player_match_stats st USING (fixture_id, player_id)
                           JOIN fixtures f ON f.id = s.fixture_id
                           WHERE f.gameweek_id = %s ORDER BY f.kickoff, f.id""", (gw.id,)).fetchall()
    return [MatchScore(pid, fid, mins, float(rating), float(cp), float(cm), float(inv), bd)
            for pid, fid, mins, rating, cp, cm, inv, bd in rows]


def rising_star_levels(conn, gw, ordered):
    """({(player, fixture): level used}, {player: level after}, {player: level before the gameweek})."""
    on = (gw.first_kickoff or datetime.now(timezone.utc)).date()
    current = dict(conn.execute("""SELECT player_id, level FROM rising_stars WHERE league_id = %s AND season = %s
                                   AND active_from <= %s AND (active_to IS NULL OR active_to >= %s)""",
                                (gw.league_id, gw.season, on, on)).fetchall())
    # if this gameweek was already settled once, start again from the level it began with
    for pid, before in conn.execute("""SELECT DISTINCT ON (m.player_id) m.player_id, m.level_before
                                       FROM rising_star_matches m JOIN fixtures f ON f.id = m.fixture_id
                                       WHERE f.gameweek_id = %s ORDER BY m.player_id, f.kickoff""",
                                    (gw.id,)).fetchall():
        if pid in current:
            current[pid] = before
    used, after = advance_rising_stars(current, ordered)
    return used, after, current


def score_squads(conn, gw, final=False):
    """Every squad's points for the gameweek, after auto-subs, captain, Rising Stars and
    transfer penalties."""
    ordered = match_scores(conn, gw)
    by_player = defaultdict(list)
    for ms in ordered:
        by_player[ms.player_id].append(ms)
    used, _, _ = rising_star_levels(conn, gw, ordered)
    # a frozen squad keeps only matches that were over before it froze
    frozen = dict(conn.execute("SELECT squad_id, frozen_at FROM squad_freezes WHERE gameweek_id = %s", (gw.id,)).fetchall())
    ends = {fid: ko + timedelta(hours=GW["match_hours"]) for fid, ko in conn.execute(
        "SELECT id, kickoff FROM fixtures WHERE gameweek_id = %s", (gw.id,)).fetchall()}
    rows = conn.execute("""SELECT sp.squad_id, sp.player_id, sp.slot, sp.is_captain, sp.is_vice, p.position
                           FROM squad_picks sp JOIN players p ON p.id = sp.player_id
                           WHERE sp.gameweek_id = %s ORDER BY sp.squad_id, sp.slot""", (gw.id,)).fetchall()
    squads = defaultdict(list)
    for r in rows:
        squads[r[0]].append(r[1:])
    penalties = dict(conn.execute("""SELECT squad_id, sum(penalty) FROM transfers WHERE gameweek_id = %s
                                     GROUP BY squad_id""", (gw.id,)).fetchall())
    for sid, picks in squads.items():
        p = Picks(starters=[pid for pid, slot, *_ in picks if slot <= 11],
                  bench=[pid for pid, slot, *_ in picks if slot > 11],
                  captain=next(pid for pid, _, cap, *_ in picks if cap),
                  vice_captain=next(pid for pid, _, _, vice, _ in picks if vice),
                  positions={pid: pos for pid, *_, pos in picks})
        scores = by_player
        if sid in frozen:
            scores = {pid: [ms for ms in mss if ends[ms.fixture_id] <= frozen[sid]] for pid, mss in by_player.items()}
        res = score_gameweek(p, scores, used)
        penalty = int(penalties.get(sid) or 0)
        conn.execute("""INSERT INTO squad_gameweek_scores (squad_id, gameweek_id, points, transfer_penalty, captain_used,
                                                           auto_subs, players, is_final, scored_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (squad_id, gameweek_id) DO UPDATE SET points = EXCLUDED.points,
                          transfer_penalty = EXCLUDED.transfer_penalty, captain_used = EXCLUDED.captain_used,
                          auto_subs = EXCLUDED.auto_subs, players = EXCLUDED.players, is_final = EXCLUDED.is_final,
                          scored_at = now()""",
                     (sid, gw.id, round(res.points + penalty, 2), penalty, res.captain_used, Jsonb(res.auto_subs),
                      Jsonb({str(k): v for k, v in res.players.items()}), final))
    return len(squads)


def leaderboard(conn, gw):
    return conn.execute("""SELECT rank() OVER (ORDER BY sc.points DESC), s.id, s.wallet, s.name, sc.points,
                                  sc.transfer_penalty, sc.is_final
                           FROM squad_gameweek_scores sc JOIN squads s ON s.id = sc.squad_id
                           WHERE sc.gameweek_id = %s ORDER BY sc.points DESC, s.id""", (gw.id,)).fetchall()


# ---------------------------------------------------------- state machine ---
def lock(conn, gw):
    """Freeze the gameweek: squads not saved this week carry over last week's picks and bank, then
    squads their wallets no longer pay for freeze from the first kickoff."""
    conn.execute("""INSERT INTO squad_banks (squad_id, gameweek_id, team_value, bank)
                    SELECT DISTINCT ON (b.squad_id) b.squad_id, %(gw)s, b.team_value, b.bank
                    FROM squad_banks b JOIN gameweeks g ON g.id = b.gameweek_id JOIN squads s ON s.id = b.squad_id
                    WHERE s.league_id = %(league)s AND s.season = %(season)s AND g.number < %(n)s
                      AND NOT EXISTS (SELECT 1 FROM squad_picks x WHERE x.squad_id = b.squad_id
                                      AND x.gameweek_id = %(gw)s)
                    ORDER BY b.squad_id, g.number DESC""",
                 {"gw": gw.id, "league": gw.league_id, "season": gw.season, "n": gw.number})
    return conn.execute("""INSERT INTO squad_picks (squad_id, gameweek_id, player_id, slot, is_captain, is_vice, price)
                           SELECT sp.squad_id, %(gw)s, sp.player_id, sp.slot, sp.is_captain, sp.is_vice, sp.price
                           FROM squad_picks sp JOIN (
                               SELECT DISTINCT ON (sp.squad_id) sp.squad_id, sp.gameweek_id
                               FROM squad_picks sp JOIN gameweeks g ON g.id = sp.gameweek_id
                               JOIN squads s ON s.id = sp.squad_id
                               WHERE s.league_id = %(league)s AND s.season = %(season)s AND g.number < %(n)s
                               ORDER BY sp.squad_id, g.number DESC) last
                             ON last.squad_id = sp.squad_id AND last.gameweek_id = sp.gameweek_id
                           WHERE NOT EXISTS (SELECT 1 FROM squad_picks x
                                             WHERE x.squad_id = sp.squad_id AND x.gameweek_id = %(gw)s)""",
                        {"gw": gw.id, "league": gw.league_id, "season": gw.season, "n": gw.number}).rowcount // 15


def lock_and_check(conn, gw):
    carried = lock(conn, gw)
    return {"carried_over": carried, "frozen": holdings.enforce_at_lock(conn, gw)}


def finish(conn, gw, now):
    """Last match over: set next week's prices and open its window an hour later."""
    opens = now + timedelta(hours=GW["window_opens_after_last_match_hours"])
    conn.execute("UPDATE gameweeks SET window_opens_at = %s WHERE id = %s", (opens, gw.id))
    gw.window_opens_at = opens
    return {"prices_set": reprice(conn, gw), "window_opens_at": opens.isoformat()}


def settle(conn, gw, final_pull=None, now=None):
    """Final re-pull, Rising Star levels and final scores."""
    fixture_ids = [r[0] for r in conn.execute("SELECT id FROM fixtures WHERE gameweek_id = %s", (gw.id,)).fetchall()]
    if final_pull:
        final_pull(conn, fixture_ids)
    ordered = match_scores(conn, gw)
    used, after, _ = rising_star_levels(conn, gw, ordered)
    conn.execute("DELETE FROM rising_star_matches WHERE fixture_id = ANY(%s)", (fixture_ids,))
    for ms in ordered:
        if (ms.player_id, ms.fixture_id) in used:
            before = used[(ms.player_id, ms.fixture_id)]
            conn.execute("""INSERT INTO rising_star_matches (player_id, season, fixture_id, level_before, level_after)
                            VALUES (%s, %s, %s, %s, %s)""",
                         (ms.player_id, gw.season, ms.fixture_id, before, rising_star_next_level(before, ms)))
    for pid, level in after.items():
        conn.execute("UPDATE rising_stars SET level = %s WHERE player_id = %s AND season = %s",
                     (level, pid, gw.season))
    squads = score_squads(conn, gw, final=True)
    conn.execute("UPDATE player_match_scores SET is_final = true WHERE fixture_id = ANY(%s)", (fixture_ids,))
    return {"squads_scored": squads, "prizes": payouts.award(conn, gw, now)}


def next_state(conn, gw, now, prev_state):
    if gw.state == "open":
        return "locked" if gw.first_kickoff and now >= gw.first_kickoff else None
    statuses = [r[0] for r in conn.execute("SELECT status FROM fixtures WHERE gameweek_id = %s", (gw.id,)).fetchall()]
    if gw.state == "locked":
        return "live" if any(s not in NOT_STARTED | VOID for s in statuses) else None
    if gw.state == "live":
        return "settling" if statuses and all(s in FINISHED | VOID for s in statuses) else None
    if gw.state == "settling":
        # settle in order, so Rising Star levels and prices build week on week
        ready = gw.settles_at and now >= gw.settles_at and prev_state in (None, "settled")
        return "settled" if ready else None
    return None


def tick(conn, league_id, season=SEASON, now=None, final_pull=None):
    """Move every gameweek of a league on as far as `now` allows. Returns [(round, from, to)]."""
    now = now or datetime.now(timezone.utc)
    refresh_gameweeks(conn, league_id, season)
    moves, prev_state = [], None
    for gw in gameweeks(conn, league_id, season):
        while (to := next_state(conn, gw, now, prev_state)):
            detail = {}
            if to == "locked":
                detail = lock_and_check(conn, gw)
            elif to == "settling":
                detail = finish(conn, gw, now)
            elif to == "settled":
                detail = settle(conn, gw, final_pull, now)
            conn.execute("UPDATE gameweeks SET state = %s WHERE id = %s", (to, gw.id))
            conn.execute("""INSERT INTO gameweek_events (gameweek_id, from_state, to_state, at, detail)
                            VALUES (%s, %s, %s, %s, %s)""", (gw.id, gw.state, to, now, Jsonb(detail)))
            moves.append((gw.round, gw.state, to))
            gw.state = to
        if gw.state in ("live", "settling"):
            score_squads(conn, gw)
        prev_state = gw.state
    conn.commit()
    return moves


# ------------------------------------------------------------------- main ---
def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m squad.game", description="$ELEVN game logic")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prices")
    p.add_argument("--league", choices=launch_leagues(), required=True)
    p.add_argument("--round", help="gameweek to price (default: the next open one)")
    for name in ("tick", "run"):
        p = sub.add_parser(name)
        p.add_argument("--league", choices=launch_leagues(), action="append")
        if name == "tick":
            p.add_argument("--now", help="ISO time to tick at (default: now)")
    p = sub.add_parser("table")
    p.add_argument("--league", choices=launch_leagues(), required=True)
    p.add_argument("--round", required=True)
    args = ap.parse_args(argv)
    conn = connect()

    if args.cmd == "prices":
        league_id = launch_leagues()[args.league]
        if args.round:
            gw = gameweek_by_round(conn, league_id, args.round)
        else:
            gw = next((g for g in gameweeks(conn, league_id) if g.state == "open"), None)
        if gw is None:
            raise SystemExit("no such gameweek (run `python -m squad.ingest fixtures` first)")
        from . import ingest
        print(f"{args.league} {gw.round}: {load_prices(conn, args.league, gw.id)} prices loaded")
        print(f"{ingest.rescore(conn, league_id)} player-matches rescored at their game positions")
    elif args.cmd == "table":
        gw = gameweek_by_round(conn, launch_leagues()[args.league], args.round)
        for rank, sid, wallet, name, pts, pen, final in leaderboard(conn, gw):
            print(f"{rank:>4}  {name or wallet:<24} {float(pts):8.2f}  {'final' if final else 'live'}"
                  + (f"  (transfers {pen})" if pen else ""))
    else:
        from . import ingest
        from .apifootball import Client
        key = os.environ.get("APIFOOTBALL_KEY")
        client = Client(key, ROOT / "cache") if key else None
        final_pull = (lambda c, ids: ingest.final_pull(client, c, ids)) if client else None
        if final_pull is None:
            print("APIFOOTBALL_KEY not set: settling without the final re-pull")
        leagues = args.league or list(launch_leagues())
        while True:
            now = datetime.fromisoformat(args.now) if getattr(args, "now", None) else datetime.now(timezone.utc)
            for slug in leagues:
                for rnd, frm, to in tick(conn, launch_leagues()[slug], now=now, final_pull=final_pull):
                    print(f"{now:%Y-%m-%d %H:%M} {slug} {rnd}: {frm} -> {to}")
            if args.cmd == "tick":
                break
            time.sleep(60)


if __name__ == "__main__":
    main()
