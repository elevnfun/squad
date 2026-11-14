"""Web API for the website (elevn.fun). Run: uv run uvicorn squad.api:app --port 8000

Sign-in: POST /api/auth/message -> the wallet signs it -> POST /api/auth/verify -> token;
send it as `Authorization: Bearer <token>`. Reads are public except a squad's unsaved
draft and its picks for a gameweek that has not locked yet (only the owner sees those).
"""

import hmac
import os
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone

from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

from . import auth, chain, chat, faucet, game, holdings, payouts, profiles
from .config import CFG, launch_leagues
from .db import DEFAULT_URL

SEASON = CFG["seasons"]["current"]
_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = ConnectionPool(os.environ.get("DATABASE_URL", DEFAULT_URL), min_size=1, max_size=10, open=True)
    return _pool


def db():
    with pool().connection() as conn:
        yield conn


@asynccontextmanager
async def lifespan(app):
    yield
    if _pool is not None:
        _pool.close()


app = FastAPI(title="$ELEVN API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CFG["web"]["origins"], allow_methods=["*"],
                   allow_headers=["*"])

# Private until launch: with API_GATE_SECRET set, only the website's own server (which adds the key, see
# web/src/middleware.ts) gets answers; anyone calling the API directly gets a 404.
_GATE = os.environ.get("API_GATE_SECRET", "").encode()


@app.middleware("http")
async def gate(request: Request, call_next):
    if _GATE and not hmac.compare_digest(request.headers.get("x-elevn-gate", "").encode(), _GATE):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return await call_next(request)


def current_wallet(authorization: str | None = Header(default=None)):
    wallet = auth.wallet_from_token(authorization.removeprefix("Bearer ").strip()) if authorization else None
    if not wallet:
        raise HTTPException(401, "Sign in with your wallet first")
    return wallet


def optional_wallet(authorization: str | None = Header(default=None)):
    return auth.wallet_from_token(authorization.removeprefix("Bearer ").strip()) if authorization else None


def league_id(slug):
    if slug not in launch_leagues():
        raise HTTPException(404, "No such league area")
    return launch_leagues()[slug]


def gw_json(gw):
    return gw and {"number": gw.number, "round": gw.round, "state": gw.state,
                   "deadline": gw.first_kickoff, "settles_at": gw.settles_at}


# ------------------------------------------------------------------- auth ---
class WalletIn(BaseModel):
    wallet: str
    origin: str | None = None   # the site asking (window.location.origin); named in the message


class SignedIn(BaseModel):
    wallet: str
    message: str
    signature: str              # base58


class OriginIn(BaseModel):
    origin: str | None = None


@app.post("/api/auth/sign-in")
def auth_sign_in(body: OriginIn, conn=Depends(db)):
    """Fields for the wallet's one-step sign-in (connect and sign in one approval)."""
    try:
        return auth.new_sign_in(conn, body.origin)
    except auth.AuthError as e:
        raise HTTPException(400, str(e))


@app.post("/api/auth/message")
def auth_message(body: WalletIn, conn=Depends(db)):
    try:
        return {"message": auth.new_message(conn, body.wallet, body.origin)}
    except auth.AuthError as e:
        raise HTTPException(400, str(e))


@app.post("/api/auth/verify")
def auth_verify(body: SignedIn, conn=Depends(db)):
    try:
        return {"token": auth.verify(conn, body.wallet, body.message, body.signature), "wallet": body.wallet}
    except auth.AuthError as e:
        raise HTTPException(401, str(e))


@app.post("/api/auth/dev")
def auth_dev(body: WalletIn):
    """Local testing without a browser wallet. Exists only when the API runs with DEV_LOGIN=1."""
    if os.environ.get("DEV_LOGIN") != "1":
        raise HTTPException(404, "Not Found")
    return {"token": auth.token_for(body.wallet), "wallet": body.wallet}


_shown_balances = {}   # wallet -> (read at, balance), for showing the account only


def shown_balance(wallet, max_age=30):
    """A balance for display, re-read from Solana at most every max_age seconds per wallet.
    Anything that gates play (creating, saving, freezing) reads the live balance instead."""
    if os.environ.get("HOLDINGS_DEV_BALANCE"):   # nothing to save without a real chain read
        return holdings.balance(wallet)
    hit = _shown_balances.get(wallet)
    if hit and time.monotonic() - hit[0] < max_age:
        return hit[1]
    bal = holdings.balance(wallet)
    _shown_balances[wallet] = (time.monotonic(), bal)
    return bal


@app.get("/api/me")
def me(wallet=Depends(current_wallet), conn=Depends(db)):
    try:
        bal = shown_balance(wallet)
    except Exception:
        raise HTTPException(503, "Could not read your token balance. Try again shortly.")
    slugs = {v: k for k, v in launch_leagues().items()}
    squads = conn.execute("""SELECT s.id, s.league_id, s.slot, s.name, (
                                 SELECT f.frozen_at FROM squad_freezes f JOIN gameweeks g ON g.id = f.gameweek_id
                                 WHERE f.squad_id = s.id AND g.state IN ('locked', 'live', 'settling') LIMIT 1),
                             EXISTS (SELECT 1 FROM squad_picks p JOIN gameweeks g ON g.id = p.gameweek_id
                                     WHERE p.squad_id = s.id AND g.state <> 'open')
                             FROM squads s WHERE s.wallet = %s AND s.season = %s ORDER BY s.league_id, s.slot""",
                          (wallet, SEASON)).fetchall()
    unpaid = set(holdings.unpaid_squads(conn, wallet, bal)) if holdings.enabled() else set()
    profile = profiles.get(conn, wallet)
    can_chat, chat_reason = chat.can_post(conn, wallet)
    return {"wallet": wallet, "balance": bal, "requirement": holdings.requirement(),
            "squads_allowed": holdings.squads_allowed(bal), "is_admin": wallet == chain.fee_wallet(),
            "faucet": {"amount": faucet.F["amount"], "claimed": faucet.claimed(conn, wallet)} if faucet.enabled() else None,
            "username": profile["username"] if profile else None,
            "username_next_change": profile["next_change"] if profile else None,
            "chat": {"can_post": can_chat, "reason": chat_reason},
            "squads": [{"id": i, "league": slugs.get(lg), "slot": s, "name": n, "frozen_at": fz, "unpaid": i in unpaid,
                        "can_delete": not played} for i, lg, s, n, fz, played in squads]}


@app.get("/api/me/prizes")
def my_prizes(wallet=Depends(current_wallet), conn=Depends(db)):
    """Your prizes: amount, what has been sent, and the daily vesting left."""
    slugs = {v: k for k, v in launch_leagues().items()}
    rows = conn.execute("""SELECT p.id, g.league_id, g.number, p.place, p.lamports, p.instant, p.instant_paid, p.vest,
                                  p.vest_paid, p.parts_paid, p.below_since, p.returned
                           FROM prizes p JOIN gameweeks g ON g.id = p.gameweek_id WHERE p.wallet = %s
                           ORDER BY p.id DESC""", (wallet,)).fetchall()
    sol = lambda lam: lam / chain.LAMPORTS
    return [{"id": pid, "league": slugs.get(lid), "gameweek": n, "place": place, "sol": sol(lam),
             "sent_sol": sol((inst if paid else 0) + vpaid), "instant_sol": sol(inst), "vest_sol": sol(vest),
             "days_paid": parts, "days": CFG["prizes"]["vesting_days"], "paused": below is not None,
             "returned_sol": sol(ret)}
            for pid, lid, n, place, lam, inst, paid, vest, vpaid, parts, below, ret in rows]


def client_ip(request: Request):
    """The player's address. The website's server passes it on (x-elevn-ip, set in web/src/middleware.ts over
    anything the browser sent). It is trusted only with the gate on, when nothing else reaches the API; with
    the gate off every claim counts as the tunnel's own address, so the per-day limit fails closed."""
    forwarded = request.headers.get("x-elevn-ip") if _GATE else None
    return forwarded or (request.client.host if request.client else "unknown")


# A claim holds a database connection while Solana confirms (seconds, up to a minute when devnet is slow),
# so only a few run at once; the rest are asked to retry rather than tying up the pool the whole site uses.
_faucet_sends = threading.BoundedSemaphore(3)


@app.post("/api/faucet")
def claim_test_tokens(request: Request, wallet=Depends(current_wallet), conn=Depends(db)):
    """The devnet test season: this wallet's free test $ELEVN, once."""
    if not faucet.enabled():
        raise HTTPException(404, "Not Found")
    try:
        payer = faucet.authority()
    except (OSError, ValueError):
        raise HTTPException(503, "The faucet is closed right now. Try again later.")
    if not _faucet_sends.acquire(blocking=False):
        raise HTTPException(503, "The faucet is busy. Try again in a few seconds.")
    try:
        out = faucet.claim(conn, chain.Rpc(), payer, wallet, client_ip(request))
    except faucet.FaucetError as e:
        raise HTTPException(400, str(e))
    finally:
        _faucet_sends.release()
    _shown_balances.pop(wallet, None)   # the account shows the new balance straight away
    return out


# -------------------------------------------------------------- usernames ---
class UsernameIn(BaseModel):
    username: str = Field(max_length=40)


@app.get("/api/usernames/{name}")
def username_available(name: str, wallet=Depends(optional_wallet), conn=Depends(db)):
    """Whether a name can be taken, for the live check while typing (your own name counts as free)."""
    ok, why = profiles.available(conn, name[:40], wallet)
    return {"available": ok, "reason": why}


@app.put("/api/me/username")
def set_username(body: UsernameIn, wallet=Depends(current_wallet), conn=Depends(db)):
    """Pick or change this wallet's username (unique regardless of case; one change a week)."""
    try:
        name = profiles.claim(conn, wallet, body.username.strip())
    except profiles.UsernameError as e:
        raise HTTPException({"taken": 409, "too_soon": 429}.get(e.code, 400), str(e))
    return {"username": name, "next_change": profiles.get(conn, wallet)["next_change"]}


# ------------------------------------------------------------------- chat ---
class ChatIn(BaseModel):
    body: str = Field(max_length=2000)   # chat.clean caps the message itself at 500


def chat_call(action, *args):
    try:
        return action(*args)
    except chat.ChatError as e:
        raise HTTPException(e.status, str(e))


MESSAGE_ID = 2 ** 62   # far above any real id, and inside Postgres' bigint, so no value can make the query fail


@app.get("/api/chat")
def chat_messages(after: int | None = Query(None, ge=0, le=MESSAGE_ID), before: int | None = Query(None, ge=1, le=MESSAGE_ID),
                  wallet=Depends(optional_wallet), conn=Depends(db)):
    """The community chat, open to everyone: the latest page, newer than `after` (polling) or older than
    `before` (scrolling back). The admin also sees how often each message was reported."""
    if after is not None and before is not None:
        raise HTTPException(400, "Ask for newer or older messages, not both")
    return chat.messages(conn, after, before, viewer=wallet)


@app.post("/api/chat")
def chat_post(body: ChatIn, request: Request, wallet=Depends(current_wallet), conn=Depends(db)):
    return chat_call(chat.post, conn, wallet, body.body, client_ip(request))


@app.delete("/api/chat/{message_id}")
def chat_delete(message_id: int = Path(ge=1, le=MESSAGE_ID), wallet=Depends(current_wallet), conn=Depends(db)):
    chat_call(chat.hide, conn, wallet, message_id)
    return {"ok": True}


@app.post("/api/chat/{message_id}/report")
def chat_report(message_id: int = Path(ge=1, le=MESSAGE_ID), wallet=Depends(current_wallet), conn=Depends(db)):
    chat_call(chat.report, conn, wallet, message_id)
    return {"ok": True}


# ---------------------------------------------------------------- leagues ---
@app.get("/api/leagues")
def leagues(conn=Depends(db)):
    out = []
    for slug, lid in launch_leagues().items():
        gws = game.gameweeks(conn, lid)
        out.append({"slug": slug, "id": lid,
                    "window": gw_json(game.window_gameweek(conn, lid)),
                    "current": gw_json(next((g for g in gws if g.state in ("locked", "live", "settling")), None)),
                    "next": gw_json(next((g for g in gws if g.state == "open"), None))})
    return out


@app.get("/api/leagues/{slug}")
def league(slug: str, conn=Depends(db)):
    lid = league_id(slug)
    gws = game.gameweeks(conn, lid)
    return {"slug": slug, "window": gw_json(game.window_gameweek(conn, lid)),
            "gameweeks": [gw_json(g) for g in gws]}


def price_gameweek(conn, lid):
    gws = game.gameweeks(conn, lid)
    return next((g for g in gws if g.state == "open"), gws[-1] if gws else None)


@app.get("/api/leagues/{slug}/players")
def players(slug: str, conn=Depends(db)):
    """Every priced player in the area: price for the next gameweek, season points, form, status."""
    lid = league_id(slug)
    gw = price_gameweek(conn, lid)
    if gw is None:
        return {"gameweek": None, "players": []}
    rows = conn.execute("""
        WITH apps AS (
            SELECT st.player_id, s.base, row_number() OVER (PARTITION BY st.player_id ORDER BY f.kickoff DESC) AS rn
            FROM player_match_stats st JOIN player_match_scores s USING (fixture_id, player_id)
            JOIN fixtures f ON f.id = st.fixture_id
            WHERE f.league_id = %(l)s AND f.season = %(s)s AND st.minutes > 0)
        SELECT p.id, p.name, p.position, p.club_id, c.name, c.logo, p.photo,
               coalesce((SELECT sum(base) FROM apps WHERE apps.player_id = p.id), 0),
               (SELECT count(*) FROM apps WHERE apps.player_id = p.id),
               (SELECT avg(base) FROM apps WHERE apps.player_id = p.id AND rn <= 5),
               av.status, av.reason
        FROM players p JOIN clubs c ON c.id = p.club_id
        LEFT JOIN player_availability av ON av.player_id = p.id AND av.gameweek_id = %(gw)s
        WHERE p.league_id = %(l)s AND EXISTS (SELECT 1 FROM player_prices pp WHERE pp.player_id = p.id)
        ORDER BY p.id""", {"l": lid, "s": SEASON, "gw": gw.id}).fetchall()
    prices = game.current_prices(conn, gw, [r[0] for r in rows])
    return {"gameweek": gw_json(gw), "players": [
        {"id": pid, "name": name, "position": pos, "club": {"id": cid, "name": cname, "logo": logo}, "photo": photo,
         "price": prices.get(pid), "points": round(float(total), 1), "appearances": apps,
         "form": round(float(form), 1) if form is not None else None, "status": status, "status_reason": reason}
        for pid, name, pos, cid, cname, logo, photo, total, apps, form, status, reason in rows]}


def club_difficulty(conn, lid):
    """Fixture difficulty 1 (easiest) to 5 for each club as an opponent: the league's clubs ranked by
    points per match this season (3 a win, 1 a draw) and split into five equal bands."""
    rows = conn.execute("""SELECT club, avg(pts) FROM (
                               SELECT home_club_id AS club, CASE WHEN home_goals > away_goals THEN 3
                                      WHEN home_goals = away_goals THEN 1 ELSE 0 END AS pts
                               FROM fixtures WHERE league_id = %(l)s AND season = %(s)s AND status = ANY(%(fin)s)
                               UNION ALL
                               SELECT away_club_id, CASE WHEN away_goals > home_goals THEN 3
                                      WHEN home_goals = away_goals THEN 1 ELSE 0 END
                               FROM fixtures WHERE league_id = %(l)s AND season = %(s)s AND status = ANY(%(fin)s)) t
                           GROUP BY club ORDER BY avg(pts)""", {"l": lid, "s": SEASON, "fin": ["FT", "AET", "PEN"]}).fetchall()
    return {club: 1 + i * 5 // max(1, len(rows)) for i, (club, _) in enumerate(rows)}


@app.get("/api/leagues/{slug}/players/{player_id}")
def player_detail(slug: str, player_id: int, conn=Depends(db)):
    """One player for the player card: points in the last five gameweeks, the next five fixtures with
    their difficulty, and the share of the league's squads that hold him."""
    lid = league_id(slug)
    row = conn.execute("SELECT p.club_id FROM players p WHERE p.id = %s AND p.league_id = %s", (player_id, lid)).fetchone()
    if row is None:
        raise HTTPException(404, "No such player")
    club = row[0]
    recent = conn.execute("""SELECT g.number, sum(s.base), max(CASE WHEN f.home_club_id = %(c)s THEN ac.name ELSE hc.name END),
                                    bool_or(f.home_club_id = %(c)s), sum(st.minutes)
                             FROM player_match_scores s JOIN player_match_stats st USING (fixture_id, player_id)
                             JOIN fixtures f ON f.id = s.fixture_id JOIN gameweeks g ON g.id = f.gameweek_id
                             JOIN clubs hc ON hc.id = f.home_club_id JOIN clubs ac ON ac.id = f.away_club_id
                             WHERE s.player_id = %(p)s AND f.league_id = %(l)s AND f.season = %(s)s
                             GROUP BY g.number ORDER BY g.number DESC LIMIT 5""",
                          {"c": club, "p": player_id, "l": lid, "s": SEASON}).fetchall()
    diff = club_difficulty(conn, lid)
    upcoming = conn.execute("""SELECT g.number, f.kickoff, f.home_club_id = %(c)s,
                                      CASE WHEN f.home_club_id = %(c)s THEN f.away_club_id ELSE f.home_club_id END
                               FROM fixtures f JOIN gameweeks g ON g.id = f.gameweek_id
                               WHERE f.league_id = %(l)s AND f.season = %(s)s AND %(c)s IN (f.home_club_id, f.away_club_id)
                                 AND f.status = ANY(%(ns)s) AND f.kickoff > now() - interval '3 hours'
                               ORDER BY f.kickoff LIMIT 5""",
                            {"c": club, "l": lid, "s": SEASON, "ns": ["NS", "TBD", "PST"]}).fetchall()
    clubs = {cid: (name, logo) for cid, name, logo in conn.execute(
        "SELECT id, name, logo FROM clubs WHERE id = ANY(%s)", ([u[3] for u in upcoming],)).fetchall()}
    held = conn.execute("""WITH latest AS (SELECT DISTINCT ON (sp.squad_id) sp.squad_id, sp.gameweek_id
                                           FROM squad_picks sp JOIN squads s ON s.id = sp.squad_id
                                           JOIN gameweeks g ON g.id = sp.gameweek_id
                                           WHERE s.league_id = %(l)s AND s.season = %(s)s
                                           ORDER BY sp.squad_id, g.number DESC)
                           SELECT count(*), count(*) FILTER (WHERE EXISTS (
                               SELECT 1 FROM squad_picks sp WHERE sp.squad_id = latest.squad_id
                                 AND sp.gameweek_id = latest.gameweek_id AND sp.player_id = %(p)s))
                           FROM latest""", {"l": lid, "s": SEASON, "p": player_id}).fetchone()
    return {"recent": [{"gameweek": n, "points": round(float(p), 1), "opponent": opp, "home": home, "minutes": mins}
                       for n, p, opp, home, mins in reversed(recent)],
            "upcoming": [{"gameweek": n, "kickoff": ko, "home": home, "opponent": {"id": o, "name": clubs.get(o, ("?", None))[0],
                          "logo": clubs.get(o, ("?", None))[1]}, "difficulty": diff.get(o, 3)}
                         for n, ko, home, o in upcoming],
            "selected": round(100 * held[1] / held[0], 1) if held[0] else None}


# ----------------------------------------------------------------- squads ---
class NewSquad(BaseModel):
    name: str | None = Field(default=None, max_length=30)


class PicksIn(BaseModel):
    starters: list[int]
    bench: list[int]
    captain: int | None = None
    vice_captain: int | None = None


def own_squad(conn, squad_id, wallet):
    row = conn.execute("SELECT id, wallet, league_id, season, slot, name FROM squads WHERE id = %s",
                       (squad_id,)).fetchone()
    if not row:
        raise HTTPException(404, "No such squad")
    if wallet is not None and row[1] != wallet:
        raise HTTPException(403, "This squad belongs to another wallet")
    return row


@app.post("/api/leagues/{slug}/squads")
def create_squad(slug: str, body: NewSquad, wallet=Depends(current_wallet), conn=Depends(db)):
    lid = league_id(slug)
    try:
        allowed = holdings.squads_allowed(holdings.balance(wallet))
    except Exception:
        raise HTTPException(503, "Could not read your token balance. Try again shortly.")
    have = conn.execute("SELECT count(*) FROM squads WHERE wallet = %s AND season = %s", (wallet, SEASON)).fetchone()[0]
    if have >= allowed:
        need = (have + 1) * holdings.requirement()
        raise HTTPException(403, f"Hold {need:,} tokens to run {have + 1} squad{'s' if have else ''}")
    taken = {r[0] for r in conn.execute("SELECT slot FROM squads WHERE wallet = %s AND league_id = %s AND season = %s",
                                        (wallet, lid, SEASON)).fetchall()}
    slot = next(n for n in range(1, len(taken) + 2) if n not in taken)   # reuse a deleted squad's number
    sid = game.create_squad(conn, wallet, lid, SEASON, slot, body.name)
    return {"id": sid, "league": slug, "slot": slot, "name": body.name}


@app.patch("/api/squads/{squad_id}")
def rename_squad(squad_id: int, body: NewSquad, wallet=Depends(current_wallet), conn=Depends(db)):
    """Rename a squad; an empty name goes back to "Squad <n>"."""
    own_squad(conn, squad_id, wallet)
    name = (body.name or "").strip() or None
    conn.execute("UPDATE squads SET name = %s WHERE id = %s", (name, squad_id))
    conn.commit()
    return {"id": squad_id, "name": name}


@app.delete("/api/squads/{squad_id}")
def delete_squad(squad_id: int, wallet=Depends(current_wallet), conn=Depends(db)):
    own_squad(conn, squad_id, wallet)
    if not game.delete_squad(conn, squad_id):
        raise HTTPException(409, "This squad has already played a gameweek, so its record stays")
    return {"ok": True}


def require_covered(conn, squad_id, wallet):
    """Squads the wallet's holdings don't pay for are unavailable: they can't be changed."""
    if not holdings.enabled():
        return
    try:
        bal = holdings.balance(wallet)
    except Exception:
        raise HTTPException(503, "Could not read your token balance. Try again shortly.")
    if squad_id in holdings.unpaid_squads(conn, wallet, bal):
        n = conn.execute("SELECT count(*) FROM squads WHERE wallet = %s AND season = %s", (wallet, SEASON)).fetchone()[0]
        raise HTTPException(403, f"This squad is unavailable: hold {n * holdings.requirement():,} $ELEVN to use all {n} squads")


def picks_of(conn, squad_id, gameweek_id):
    rows = conn.execute("""SELECT player_id, slot, is_captain, is_vice FROM squad_picks
                           WHERE squad_id = %s AND gameweek_id = %s ORDER BY slot""", (squad_id, gameweek_id)).fetchall()
    if not rows:
        return None
    return {"starters": [r[0] for r in rows if r[1] <= 11], "bench": [r[0] for r in rows if r[1] > 11],
            "captain": next((r[0] for r in rows if r[2]), None), "vice_captain": next((r[0] for r in rows if r[3]), None)}


@app.get("/api/squads/{squad_id}")
def squad(squad_id: int, wallet=Depends(current_wallet), conn=Depends(db)):
    """The owner's view: the squad as saved for the open window (or as it carries over), the draft,
    the budget and this window's transfers."""
    sid, _, lid, season, slot, name = own_squad(conn, squad_id, wallet)
    slugs = {v: k for k, v in launch_leagues().items()}
    window = game.window_gameweek(conn, lid, season)
    latest = conn.execute("""SELECT g.id FROM squad_picks sp JOIN gameweeks g ON g.id = sp.gameweek_id
                             WHERE sp.squad_id = %s ORDER BY g.number DESC LIMIT 1""", (sid,)).fetchone()
    draft = conn.execute("SELECT picks FROM squad_drafts WHERE squad_id = %s", (sid,)).fetchone()
    out = {"id": sid, "league": slugs.get(lid), "slot": slot, "name": name, "window": gw_json(window),
           "picks": picks_of(conn, sid, latest[0]) if latest else None,
           "saved_for_window": bool(window and latest and latest[0] == window.id),
           "draft": draft[0] if draft else None, "budget": None, "transfers": []}
    if window:
        out["budget"] = game.team_value(conn, sid, window)
        out["transfers"] = [{"out": o, "in": i, "kind": k, "penalty": p} for o, i, k, p in conn.execute(
            "SELECT player_out, player_in, kind, penalty FROM transfers WHERE squad_id = %s AND gameweek_id = %s "
            "ORDER BY id", (sid, window.id)).fetchall()]
    return out


@app.put("/api/squads/{squad_id}/draft")
def put_draft(squad_id: int, body: dict, wallet=Depends(current_wallet), conn=Depends(db)):
    """Anything goes in a draft: any players, any cost. Nothing is checked until save."""
    own_squad(conn, squad_id, wallet)
    game.save_draft(conn, squad_id, body)
    return {"ok": True}


def result_json(res):
    return {"ok": res.ok, "problems": [asdict(p) for p in res.problems], "cost": res.cost, "budget": res.budget,
            "penalty": res.penalty, "transfers": [asdict(t) for t in res.transfers]}


@app.post("/api/squads/{squad_id}/check")
def check(squad_id: int, body: PicksIn, wallet=Depends(current_wallet), conn=Depends(db)):
    """What a save would do (problems, cost, transfers, penalty), without saving."""
    own_squad(conn, squad_id, wallet)
    return result_json(game.save_squad(conn, squad_id, body.starters, body.bench, body.captain, body.vice_captain,
                                       dry_run=True))


@app.post("/api/squads/{squad_id}/save")
def save(squad_id: int, body: PicksIn, wallet=Depends(current_wallet), conn=Depends(db)):
    own_squad(conn, squad_id, wallet)
    require_covered(conn, squad_id, wallet)
    res = game.save_squad(conn, squad_id, body.starters, body.bench, body.captain, body.vice_captain)
    if not res.ok:
        raise HTTPException(422, result_json(res))
    return result_json(res)


# ----------------------------------------------------------------- points ---
@app.get("/api/squads/{squad_id}/gameweeks/{number}")
def squad_gameweek(squad_id: int, number: int, wallet=Depends(optional_wallet), conn=Depends(db)):
    """A squad's points for a gameweek (live or final), player by player."""
    sid, owner, lid, season, slot, name = own_squad(conn, squad_id, None)
    gw = game.gameweek_by_round(conn, lid, number, season)
    if gw is None:
        raise HTTPException(404, "No such gameweek")
    if gw.state == "open" and wallet != owner:
        raise HTTPException(403, "Squads are hidden until the gameweek locks")
    picks = conn.execute("""SELECT sp.player_id, sp.slot, sp.is_captain, sp.is_vice, p.name, p.position, c.name, p.photo
                            FROM squad_picks sp JOIN players p ON p.id = sp.player_id JOIN clubs c ON c.id = p.club_id
                            WHERE sp.squad_id = %s AND sp.gameweek_id = %s ORDER BY sp.slot""", (sid, gw.id)).fetchall()
    score = conn.execute("""SELECT points, transfer_penalty, captain_used, auto_subs, players, is_final,
                                   (SELECT count(*) + 1 FROM squad_gameweek_scores o
                                    WHERE o.gameweek_id = s.gameweek_id AND o.points > s.points),
                                   (SELECT count(*) FROM squad_gameweek_scores o WHERE o.gameweek_id = s.gameweek_id)
                            FROM squad_gameweek_scores s WHERE squad_id = %s AND gameweek_id = %s""",
                         (sid, gw.id)).fetchone()
    matches = {}
    for pid, fid, mins, base, bd, home, away, status in conn.execute(
            """SELECT s.player_id, s.fixture_id, st.minutes, s.base, s.breakdown, hc.name, ac.name, f.status
               FROM player_match_scores s JOIN player_match_stats st USING (fixture_id, player_id)
               JOIN fixtures f ON f.id = s.fixture_id JOIN clubs hc ON hc.id = f.home_club_id
               JOIN clubs ac ON ac.id = f.away_club_id
               WHERE f.gameweek_id = %s AND s.player_id = ANY(%s) ORDER BY f.kickoff""",
            (gw.id, [p[0] for p in picks])).fetchall():
        matches.setdefault(pid, []).append({"fixture": fid, "match": f"{home} - {away}", "status": status,
                                            "minutes": mins, "points": float(base), "breakdown": bd})
    counted = score[4] if score else {}
    frozen = conn.execute("SELECT frozen_at FROM squad_freezes WHERE squad_id = %s AND gameweek_id = %s",
                          (sid, gw.id)).fetchone()
    return {"squad": {"id": sid, "name": name, "wallet": owner, "username": profiles.names(conn, [owner]).get(owner),
                      "slot": slot}, "gameweek": gw_json(gw),
            "points": float(score[0]) if score else 0.0, "transfer_penalty": score[1] if score else 0,
            "captain_used": score[2] if score else None, "auto_subs": score[3] if score else [],
            "is_final": score[5] if score else False, "rank": score[6] if score else None,
            "squads": score[7] if score else 0, "frozen_at": frozen[0] if frozen else None,
            "players": [{"id": pid, "slot": s, "captain": cap, "vice_captain": vice, "name": n, "position": pos,
                         "club": club, "photo": photo, "counted": counted.get(str(pid)),
                         "matches": matches.get(pid, [])}
                        for pid, s, cap, vice, n, pos, club, photo in picks]}


@app.get("/api/leagues/{slug}/gameweeks/{number}/table")
def table(slug: str, number: int, limit: int = 50, conn=Depends(db)):
    gw = game.gameweek_by_round(conn, league_id(slug), number)
    if gw is None:
        raise HTTPException(404, "No such gameweek")
    rows = game.leaderboard(conn, gw)
    frozen = {r[0] for r in conn.execute("SELECT squad_id FROM squad_freezes WHERE gameweek_id = %s", (gw.id,)).fetchall()}
    shown = rows[:max(1, min(limit, 500))]
    users = profiles.names(conn, [r[2] for r in shown])
    return {"gameweek": gw_json(gw), "squads": len(rows), "rows": [
        {"rank": r, "squad": sid, "name": name or f"{wallet[:4]}…{wallet[-4:]}", "wallet": wallet,
         "username": users.get(wallet), "points": float(pts), "transfer_penalty": pen, "final": final,
         "frozen": sid in frozen}
        for r, sid, wallet, name, pts, pen, final in shown]}


@app.get("/api/leagues/{slug}/gameweeks/{number}/fixtures")
def gameweek_fixtures(slug: str, number: int, conn=Depends(db)):
    """The gameweek's matches in kickoff order, with scores once they start."""
    gw = game.gameweek_by_round(conn, league_id(slug), number)
    if gw is None:
        raise HTTPException(404, "No such gameweek")
    rows = conn.execute("""SELECT f.id, f.kickoff, f.status, f.elapsed, f.home_goals, f.away_goals,
                                  hc.id, hc.name, hc.logo, ac.id, ac.name, ac.logo
                           FROM fixtures f JOIN clubs hc ON hc.id = f.home_club_id JOIN clubs ac ON ac.id = f.away_club_id
                           WHERE f.gameweek_id = %s ORDER BY f.kickoff, f.id""", (gw.id,)).fetchall()
    return {"gameweek": gw_json(gw), "fixtures": [
        {"id": fid, "kickoff": ko, "status": status, "elapsed": elapsed,
         "home": {"id": hid, "name": hname, "logo": hlogo, "goals": hg},
         "away": {"id": aid, "name": aname, "logo": alogo, "goals": ag}}
        for fid, ko, status, elapsed, hg, ag, hid, hname, hlogo, aid, aname, alogo in rows]}


@app.get("/api/leagues/{slug}/standings")
def standings(slug: str, limit: int = 50, conn=Depends(db)):
    """The season table: every squad's points added up over the gameweeks it has scored."""
    rows = conn.execute("""SELECT rank() OVER (ORDER BY sum(sc.points) DESC), s.id, s.wallet, s.name,
                                  sum(sc.points), count(*)
                           FROM squad_gameweek_scores sc JOIN squads s ON s.id = sc.squad_id
                           WHERE s.league_id = %s AND s.season = %s
                           GROUP BY s.id ORDER BY sum(sc.points) DESC, s.id""", (league_id(slug), SEASON)).fetchall()
    shown = rows[:max(1, min(limit, 500))]
    users = profiles.names(conn, [r[2] for r in shown])
    return {"squads": len(rows), "rows": [
        {"rank": r, "squad": sid, "name": name or f"{wallet[:4]}…{wallet[-4:]}", "wallet": wallet,
         "username": users.get(wallet), "points": float(pts), "gameweeks": n}
        for r, sid, wallet, name, pts, n in shown]}


@app.get("/api/squads/{squad_id}/history")
def squad_history(squad_id: int, conn=Depends(db)):
    """A squad's season so far: points and rank in every gameweek it scored, and its season total and rank."""
    sid, owner, lid, season, slot, name = own_squad(conn, squad_id, None)
    rows = conn.execute("""SELECT g.number, sc.points, sc.transfer_penalty, sc.is_final,
                                  (SELECT count(*) + 1 FROM squad_gameweek_scores o
                                   WHERE o.gameweek_id = sc.gameweek_id AND o.points > sc.points),
                                  (SELECT count(*) FROM squad_gameweek_scores o WHERE o.gameweek_id = sc.gameweek_id)
                           FROM squad_gameweek_scores sc JOIN gameweeks g ON g.id = sc.gameweek_id
                           WHERE sc.squad_id = %s ORDER BY g.number""", (sid,)).fetchall()
    totals = conn.execute("""SELECT sc.squad_id, sum(sc.points) FROM squad_gameweek_scores sc
                             JOIN squads s ON s.id = sc.squad_id WHERE s.league_id = %s AND s.season = %s
                             GROUP BY sc.squad_id""", (lid, season)).fetchall()
    mine = next((float(t) for s, t in totals if s == sid), 0.0)
    return {"squad": {"id": sid, "name": name, "wallet": owner, "username": profiles.names(conn, [owner]).get(owner),
                      "slot": slot},
            "total": mine, "rank": (1 + sum(1 for _, t in totals if float(t) > mine)) if rows else None,
            "squads": len(totals),
            "gameweeks": [{"number": n, "points": float(p), "transfer_penalty": pen, "final": final, "rank": r, "squads": c}
                          for n, p, pen, final, r, c in rows]}


# ------------------------------------------------------------------ admin ---
def admin_wallet(wallet=Depends(current_wallet)):
    """Only the fee wallet's owner, signed in with that wallet, runs payouts and moderates the chat."""
    if not chain.fee_wallet() or wallet != chain.fee_wallet():
        raise HTTPException(403, "Only the fee wallet can do this")
    return wallet


class ModerateIn(BaseModel):
    action: Literal["mute", "unmute", "ban", "unban"]
    hours: int = Field(default=24, ge=1, le=24 * 30)  # how long a mute lasts


@app.post("/api/admin/chat/{target}")
def chat_moderate(target: str, body: ModerateIn, admin=Depends(admin_wallet), conn=Depends(db)):
    """Mute, unmute, ban or unban a wallet in the chat. A ban also hides all of its messages."""
    chat_call(chat.moderate, conn, admin, target, body.action, None, body.hours)
    return {"ok": True}


@app.post("/api/admin/chat/messages/{message_id}/restore")
def chat_restore(message_id: int = Path(ge=1, le=MESSAGE_ID), admin=Depends(admin_wallet), conn=Depends(db)):
    """Put back a message that reports hid; further reports no longer hide it."""
    chat_call(chat.restore, conn, admin, message_id)
    return {"ok": True}


def batch_json(conn, bid):
    b = conn.execute("SELECT id, created_at, status, summary FROM payout_batches WHERE id = %s", (bid,)).fetchone()
    if not b:
        raise HTTPException(404, "No such batch")
    items = conn.execute("""SELECT id, kind, wallet, lamports, tokens, prize_id, status, signature, note
                            FROM payout_items WHERE batch_id = %s ORDER BY id""", (bid,)).fetchall()
    return {"id": b[0], "created_at": b[1], "status": b[2], "summary": b[3], "items": [
        {"id": i, "kind": k, "wallet": w, "sol": lam / chain.LAMPORTS, "tokens": t, "prize": p, "status": st,
         "signature": sig, "note": note} for i, k, w, lam, t, p, st, sig, note in items]}


@app.get("/api/admin/overview")
def admin_overview(_=Depends(admin_wallet), conn=Depends(db)):
    rpc = chain.Rpc()
    try:
        balance = rpc.sol_balance(chain.fee_wallet()) / chain.LAMPORTS
    except Exception:
        balance = None
    buckets = {b: lam / chain.LAMPORTS for b, lam in conn.execute("SELECT bucket, lamports FROM fee_buckets ORDER BY bucket")}
    last = conn.execute("SELECT id FROM payout_batches ORDER BY id DESC LIMIT 1").fetchone()
    return {"fee_wallet": chain.fee_wallet(), "cluster": CFG["fees"]["cluster"], "wallet_sol": balance,
            "accounted_sol": payouts.accounted(conn) / chain.LAMPORTS, "buckets": buckets,
            "last_batch": batch_json(conn, last[0]) if last else None}


@app.post("/api/admin/batches")
def admin_prepare(_=Depends(admin_wallet), conn=Depends(db)):
    try:
        return batch_json(conn, payouts.prepare_batch(conn, chain.Rpc()))
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/batches/{batch_id}/transactions")
def admin_transactions(batch_id: int, _=Depends(admin_wallet), conn=Depends(db)):
    return {"transactions": payouts.build_transactions(conn, chain.Rpc(), batch_id)}


class SignedTxs(BaseModel):
    signed: list[dict]          # [{"idx": 0, "tx": "<base64 signed transaction>"}]


@app.post("/api/admin/batches/{batch_id}/submit")
def admin_submit(batch_id: int, body: SignedTxs, _=Depends(admin_wallet), conn=Depends(db)):
    results = payouts.submit(conn, chain.Rpc(), batch_id, body.signed)
    return {"results": [{"idx": i, "result": r} for i, r in results], "batch": batch_json(conn, batch_id)}


@app.get("/api/health")
def health(conn=Depends(db)):
    conn.execute("SELECT 1")
    return {"ok": True, "time": datetime.now(timezone.utc)}
