"""Web API for the website (elevn.fun). Run: uv run uvicorn squad.api:app --port 8000

Sign-in: POST /api/auth/message -> the wallet signs it -> POST /api/auth/verify -> token;
send it as `Authorization: Bearer <token>`. Reads are public; a wallet's own squads, teams and
winnings need its token.
"""

import asyncio
import hmac
import os
import threading
import time
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone

from typing import Literal

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

from . import auth, blitz, chain, chat, contests, draft, faucet, holdings, jobs, payouts, pots, profiles, shootout, winnings
from .config import CFG
from .db import DEFAULT_URL

_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = ConnectionPool(os.environ.get("DATABASE_URL", DEFAULT_URL), min_size=1, max_size=10, open=True)
    return _pool


def db():
    with pool().connection() as conn:
        yield conn


def rpc():
    return chain.Rpc()


def _run_jobs():
    with pool().connection() as conn:
        jobs.run_once(conn, rpc())


async def _job_loop():
    while True:
        try:
            await asyncio.to_thread(_run_jobs)
        except Exception as e:
            print(f"job round failed: {e!r}")
        await asyncio.sleep(jobs.EVERY)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(_job_loop()) if os.environ.get("RUN_JOBS") == "1" else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
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
    profile = profiles.get(conn, wallet)
    can_chat, chat_reason = chat.can_post(conn, wallet)
    won = winnings.status(conn, wallet)
    return {"wallet": wallet, "balance": bal, "requirement": CFG["blitz"]["requirement"],
            "is_admin": wallet == chain.fee_wallet(),
            "faucet": {"amount": faucet.F["amount"], "claimed": faucet.claimed(conn, wallet)} if faucet.enabled() else None,
            "username": profile["username"] if profile else None,
            "username_next_change": profile["next_change"] if profile else None,
            "chat": {"can_post": can_chat, "reason": chat_reason},
            "access": {"blitz": bal >= CFG["blitz"]["requirement"], "draft": bal >= CFG["draft"]["requirement"]},
            "winnings": {"ready_sol": won["ready"] / chain.LAMPORTS, "locked_sol": won["locked"] / chain.LAMPORTS,
                         "frozen": won["frozen"]}}


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


# ------------------------------------------------------- elevn 2.0: contests and winnings ---
def sol(lamports):
    return lamports / chain.LAMPORTS


def read_balance(wallet, live=False):
    """The wallet's $ELEVN balance, or None when it cannot be read."""
    try:
        return holdings.balance(wallet) if live else shown_balance(wallet)
    except Exception:
        return None


def sync_freeze(conn, wallet):
    bal = read_balance(wallet, live=True)
    if bal is not None:
        winnings.sync_freeze(conn, wallet, bal)
        conn.commit()


def winnings_json(st):
    return {"ready_lamports": st["ready"], "ready_sol": sol(st["ready"]), "locked_lamports": st["locked"],
            "locked_sol": sol(st["locked"]), "frozen": st["frozen"]}


@app.get("/api/today")
def today(wallet=Depends(optional_wallet), conn=Depends(db)):
    """What a visitor sees today. Works without a wallet; access and winnings are null for a guest."""
    out = {"now": datetime.now(timezone.utc),
           "contests": [{**c, "pot_lamports": shown_pot(conn, c)[0], "pot_sol": sol(shown_pot(conn, c)[0]),
                      "pot_estimated": shown_pot(conn, c)[1]} for c in contests.current(conn)],
           "access": None, "winnings": None}
    if wallet:
        bal = read_balance(wallet)
        out["access"] = {"balance": bal, "blitz": bal is not None and bal >= CFG["blitz"]["requirement"],
                         "draft": bal is not None and bal >= CFG["draft"]["requirement"],
                         "blitz_requirement": CFG["blitz"]["requirement"],
                         "draft_requirement": CFG["draft"]["requirement"]}
        out["winnings"] = winnings_json(winnings.status(conn, wallet))
    return out


def contest_row(conn, contest_id):
    row = conn.cursor(row_factory=dict_row).execute("SELECT * FROM contests WHERE id = %s", (contest_id,)).fetchone()
    if not row:
        raise HTTPException(404, "No such contest")
    return row


def shown_pot(conn, c):
    """(lamports, estimated). An unfunded open, live or review contest shows what its pot would be."""
    if c["kind"] in pots.MODE_OF and not c["pot_lamports"] and c["state"] in ("open", "live", "review"):
        return pots.estimate(conn, c["kind"]), True
    return c["pot_lamports"], False


def contest_json(conn, c):
    pot, estimated = shown_pot(conn, c)
    return {"id": c["id"], "kind": c["kind"], "day": c["day"], "week_start": c["week_start"], "state": c["state"],
            "locks_at": c["locks_at"], "final_at": c["final_at"], "pot_lamports": pot,
            "pot_sol": sol(pot), "pot_estimated": estimated}


@app.get("/api/contests/{contest_id}")
def contest_detail(contest_id: int, conn=Depends(db)):
    c = contest_row(conn, contest_id)
    ids = [f["id"] for f in contests.fixtures_of(conn, c)]
    rows = conn.execute("""SELECT f.id, f.kickoff, f.status, hc.name, f.home_goals, ac.name, f.away_goals
                           FROM fixtures f JOIN clubs hc ON hc.id = f.home_club_id JOIN clubs ac ON ac.id = f.away_club_id
                           WHERE f.id = ANY(%s) ORDER BY f.kickoff, f.id""", (ids,)).fetchall()
    return {**contest_json(conn, c), "fixtures": [{"id": i, "kickoff": ko, "status": st, "home": h, "home_goals": hg,
                                             "away": a, "away_goals": ag} for i, ko, st, h, hg, a, ag in rows]}


def board_rows(conn, c):
    """Every result of a contest, ranked. A live board is worked out from the scores (nothing written); places are filled in on the fly
    unless the contest is final (then the stored places stand, ties included)."""
    live = c["state"] not in ("final", "rolled")
    rows = contests.live_board(conn, c["id"]) if live else contests.board(conn, c["id"], 1_000_000)
    if c["state"] not in ("final", "rolled"):
        rows.sort(key=lambda r: (-r["points"], -r["captain_points"], r["wallet"]))
        prev = None
        for i, r in enumerate(rows, 1):
            key = (r["points"], r["captain_points"])
            r["place"] = rows[i - 2]["place"] if prev == key else i
            prev = key
    return rows


@app.get("/api/contests/{contest_id}/board")
def contest_board(contest_id: int, limit: int = 50, wallet=Depends(optional_wallet), conn=Depends(db)):
    c = contest_row(conn, contest_id)
    rows = board_rows(conn, c)
    users = profiles.names(conn, [r["wallet"] for r in rows])
    unsettled = c["state"] not in ("final", "rolled")
    est = {}
    if unsettled:      # before the result is final: the would-be prize from the shown pot
        est = {w: lam for w, _, lam in pots.split(shown_pot(conn, c)[0],
                                                   [(r["wallet"], r["points"], r["captain_points"]) for r in rows])}

    def line(r):
        lam = est.get(r["wallet"], 0) if unsettled else r["prize_lamports"]
        return {"place": r["place"], "wallet": r["wallet"], "username": users.get(r["wallet"]),
                "points": float(r["points"]), "captain_points": float(r["captain_points"]),
                "prize_lamports": lam, "prize_sol": sol(lam),
                "you": r["wallet"] == wallet}
    lines = [line(r) for r in rows]
    return {"contest": contest_json(conn, c), "rows": lines[:max(1, min(limit, 500))],
            "you": next((x for x in lines if x["you"]), None), "entrants": len(rows)}


# ------------------------------------------------------------------ blitz ---
class BlitzSquadIn(BaseModel):
    fixture_id: int
    player_ids: list[int]
    captain_id: int


def blitz_contest(conn, day):
    """The matchday contest for YYYY-MM-DD, or the first one not final from today on ('next')."""
    cur = conn.cursor(row_factory=dict_row)
    if day == "next":
        row = cur.execute("""SELECT * FROM contests WHERE kind = 'blitz_matchday' AND day >= %s
                             AND state NOT IN ('final', 'rolled') ORDER BY day LIMIT 1""",
                          (contests.uk_date(datetime.now(timezone.utc)),)).fetchone()
    else:
        try:
            d = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(404, "There is no matchday on that date.")
        row = cur.execute("SELECT * FROM contests WHERE kind = 'blitz_matchday' AND day = %s", (d,)).fetchone()
    if not row:
        raise HTTPException(404, "There is no matchday to show.")
    return row


def blitz_balance(wallet):
    bal = read_balance(wallet, live=True)
    if bal is None:
        raise HTTPException(503, "Could not read your token balance. Try again shortly.")
    return bal


@app.get("/api/blitz/{day}")
def blitz_day(day: str, wallet=Depends(optional_wallet), conn=Depends(db)):
    c = blitz_contest(conn, day)
    fixtures = blitz.matchday(conn, c["id"])
    out = {"contest": contest_json(conn, c), "squads_allowed": min(CFG["blitz"]["squads_per_matchday"], len(fixtures)),
           "fixtures": fixtures}
    if wallet:
        out["mine"] = blitz.mine(conn, wallet, c["id"])
    return out


@app.post("/api/blitz/check")
def blitz_check(body: BlitzSquadIn, conn=Depends(db)):
    problems = blitz.check(conn, body.fixture_id, body.player_ids, body.captain_id)
    return {"ok": not problems, "problems": problems}


@app.put("/api/blitz/{day}/squads/{slot}")
def blitz_save(day: str, body: BlitzSquadIn, slot: int = Path(ge=1, le=100), wallet=Depends(current_wallet),
               conn=Depends(db)):
    c = blitz_contest(conn, day)
    bal = blitz_balance(wallet)
    try:
        blitz.save(conn, wallet, c["id"], slot, body.fixture_id, body.player_ids, body.captain_id, bal)
    except blitz.BlitzError as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    conn.commit()
    return blitz.mine(conn, wallet, c["id"])


@app.delete("/api/blitz/{day}/squads/{slot}")
def blitz_delete(day: str, slot: int = Path(ge=1, le=100), wallet=Depends(current_wallet), conn=Depends(db)):
    c = blitz_contest(conn, day)
    try:
        blitz.remove(conn, wallet, c["id"], slot)
    except blitz.BlitzError as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    conn.commit()
    return blitz.mine(conn, wallet, c["id"])


@app.get("/api/blitz/{day}/mine")
def blitz_mine(day: str, wallet=Depends(current_wallet), conn=Depends(db)):
    """The wallet's squads and, if the matchday ended now, its place and prize (same board and split as release)."""
    c = blitz_contest(conn, day)
    return {**blitz.mine(conn, wallet, c["id"]), **place_and_prize(conn, c, wallet)}


def place_and_prize(conn, c, wallet):
    """The wallet's place and prize in a contest if it ended now (same board and split as release)."""
    rows = board_rows(conn, c)
    pot = shown_pot(conn, c)[0]
    prizes = {w: (p, lam) for w, p, lam in pots.split(pot, [(r["wallet"], r["points"], r["captain_points"]) for r in rows])}
    final = c["state"] in ("final", "rolled")
    me_row = next((r for r in rows if r["wallet"] == wallet), None)
    place = me_row["place"] if me_row else None
    lamports = (me_row["prize_lamports"] or 0) if final and me_row else prizes.get(wallet, (None, 0))[1]
    return {"place": place, "entrants": len(rows), "prize_lamports": lamports, "prize_sol": sol(lamports)}


# ------------------------------------------------------------------ draft ---
class DraftCheckIn(BaseModel):
    pool_player_ids: list[int]
    team_ids: list[int]
    captain_id: int


class DraftTeamIn(BaseModel):
    team_ids: list[int]
    captain_id: int


class DraftSwapIn(BaseModel):
    out_id: int
    in_id: int


def draft_contest(conn, week):
    """The Draft contest for the week starting YYYY-MM-DD, or this week's if not final, else the next ('next')."""
    cur = conn.cursor(row_factory=dict_row)
    if week == "next":
        row = cur.execute("""SELECT * FROM contests WHERE kind = 'draft_week' AND week_start >= %s
                             AND state NOT IN ('final', 'rolled') ORDER BY week_start LIMIT 1""",
                          (contests.week_start(contests.uk_date(datetime.now(timezone.utc))),)).fetchone()
    else:
        try:
            d = datetime.strptime(week, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(404, "There is no Draft for that week.")
        row = cur.execute("SELECT * FROM contests WHERE kind = 'draft_week' AND week_start = %s", (d,)).fetchone()
    if not row:
        raise HTTPException(404, "There is no Draft to show.")
    return row


def draft_call(conn, fn, *args):
    """Run a draft.py call; a refusal becomes HTTP 400 with its message."""
    try:
        return fn(conn, *args)
    except draft.DraftError as e:
        conn.rollback()
        raise HTTPException(400, str(e))


@app.get("/api/draft/{week}")
def draft_week(week: str, wallet=Depends(optional_wallet), conn=Depends(db)):
    c = draft_contest(conn, week)
    ids = [f["id"] for f in contests.fixtures_of(conn, c)]
    rows = conn.execute("""SELECT f.id, f.kickoff, f.status, hc.name, ac.name FROM fixtures f
                           JOIN clubs hc ON hc.id = f.home_club_id JOIN clubs ac ON ac.id = f.away_club_id
                           WHERE f.id = ANY(%s) ORDER BY f.kickoff, f.id""", (ids,)).fetchall()
    D = CFG["draft"]
    out = {"contest": contest_json(conn, c), "locks_at": c["locks_at"],
           "fixtures": [{"id": i, "kickoff": ko, "status": st, "home": h, "away": a} for i, ko, st, h, a in rows],
           "rules": {"team_size": D["team_size"], "min_per_position": D["min_per_position"],
                     "max_per_club": D["max_per_club"], "max_per_tier": D["max_per_tier"],
                     "captain_multiplier": D["captain_multiplier"], "requirement": D["requirement"]}}
    if wallet:
        draft_call(conn, draft.deal, c["id"], wallet)
        conn.commit()
        out["mine"] = draft.mine(conn, wallet, c["id"])
    else:
        out["sample"] = draft_call(conn, draft.sample, c["id"])
    return out


@app.post("/api/draft/{week}/packs/{pack}/open")
def draft_open_pack(week: str, pack: int = Path(ge=1, le=100), wallet=Depends(current_wallet), conn=Depends(db)):
    c = draft_contest(conn, week)
    draft_call(conn, draft.open_pack, c["id"], wallet, pack)
    conn.commit()
    return draft.mine(conn, wallet, c["id"])


@app.post("/api/draft/{week}/check")
def draft_check(week: str, body: DraftCheckIn, wallet=Depends(optional_wallet), conn=Depends(db)):
    c = draft_contest(conn, week)
    problems = draft_call(conn, draft.check, c["id"], body.pool_player_ids, body.team_ids, body.captain_id, wallet)
    return {"ok": not problems, "problems": problems}


@app.put("/api/draft/{week}/team")
def draft_save(week: str, body: DraftTeamIn, wallet=Depends(current_wallet), conn=Depends(db)):
    c = draft_contest(conn, week)
    bal = blitz_balance(wallet)
    draft_call(conn, lambda cn: draft.save(cn, wallet, c["id"], body.team_ids, body.captain_id, bal))
    conn.commit()
    return draft.mine(conn, wallet, c["id"])


@app.post("/api/draft/{week}/swap")
def draft_swap(week: str, body: DraftSwapIn, wallet=Depends(current_wallet), conn=Depends(db)):
    c = draft_contest(conn, week)
    draft_call(conn, lambda cn: draft.swap(cn, wallet, c["id"], body.out_id, body.in_id))
    conn.commit()
    return draft.mine(conn, wallet, c["id"])


@app.get("/api/draft/{week}/mine")
def draft_mine(week: str, wallet=Depends(current_wallet), conn=Depends(db)):
    """The wallet's packs and team and, if the week ended now, its place and prize."""
    c = draft_contest(conn, week)
    return {**draft.mine(conn, wallet, c["id"]), **place_and_prize(conn, c, wallet)}


@app.get("/api/winnings")
def my_winnings(wallet=Depends(current_wallet), conn=Depends(db)):
    sync_freeze(conn, wallet)
    st = winnings.status(conn, wallet)
    hist = winnings.history(conn, wallet)
    info = {r[0]: r[1:] for r in conn.execute("SELECT id, kind, day, week_start FROM contests WHERE id = ANY(%s)",
                                              ([h["contest_id"] for h in hist if h["contest_id"]],)).fetchall()}
    for h in hist:
        h["ready_sol"], h["locked_sol"] = sol(h["ready_delta"]), sol(h["locked_delta"])
        kind, day, ws = info.get(h["contest_id"], (None, None, None))
        h["contest"] = {"kind": kind, "day": day, "week_start": ws} if kind else None
    return {**st, "ready_lamports": st["ready"], "ready_sol": sol(st["ready"]), "locked_lamports": st["locked"],
            "locked_sol": sol(st["locked"]), "withdrawable_lamports": st["withdrawable"],
            "withdrawable_sol": sol(st["withdrawable"]), "history": hist,
            "requirement": winnings.FREEZE_BELOW}


@app.post("/api/winnings/submit")
def winnings_submit(body: dict = Body(...), wallet=Depends(current_wallet), conn=Depends(db)):
    try:
        return winnings.submit(conn, rpc(), wallet, int(body["event_id"]), str(body["transaction"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Send the claim's event_id and the signed transaction")
    except winnings.ClaimError as e:
        raise HTTPException(400, str(e))


@app.post("/api/winnings/{kind}/prepare")
def winnings_prepare(kind: Literal["collect", "withdraw"], wallet=Depends(current_wallet), conn=Depends(db)):
    sync_freeze(conn, wallet)
    try:
        out = winnings.prepare(conn, rpc(), wallet, kind)
    except winnings.ClaimError as e:
        conn.commit()
        raise HTTPException(400, str(e))
    conn.commit()
    return out


def prize_preview(conn, c, sol_usd):
    """The pot a release would use and the prizes it would credit, computed without writing prizes."""
    kind = c["kind"]
    if kind == "blitz_week":
        if not (sol_usd and sol_usd > 0):
            return None, None
        pot = round(CFG["blitz"]["weekly_prize_usd"] / sol_usd * chain.LAMPORTS)
    else:
        have = payouts.bucket(conn, f"pot:{pots.MODE_OF[kind]}")
        pot = c["pot_lamports"]
        if not pot:
            pot = have = pots.estimate(conn, kind)
        pot = min(pot, max(have, 0))
    ranked = [(r["wallet"], r["points"], r["captain_points"]) for r in board_rows(conn, c)]
    return pot, pots.split(pot, ranked)


def prizes_json(prizes):
    return [{"wallet": w, "place": p, "lamports": lam, "sol": sol(lam)} for w, p, lam in prizes]


@app.get("/api/admin/contests")
def admin_contests(sol_usd: float | None = None, _=Depends(admin_wallet), conn=Depends(db)):
    cur = conn.cursor(row_factory=dict_row)
    review = cur.execute("SELECT * FROM contests WHERE state = 'review' ORDER BY final_at, id").fetchall()
    done = cur.execute("SELECT * FROM contests WHERE state IN ('final', 'rolled') ORDER BY id DESC LIMIT 10").fetchall()
    out = []
    for c in review:
        pot, prizes = prize_preview(conn, c, sol_usd)
        rows = board_rows(conn, c)
        users = profiles.names(conn, [r["wallet"] for r in rows[:10]])
        out.append({**contest_json(conn, c), "entrants": len(rows), "preview_pot_lamports": pot,
                    "preview_pot_sol": sol(pot) if pot is not None else None,
                    "preview_prizes": prizes_json(prizes) if prizes is not None else None,
                    "board": [{"place": r["place"], "wallet": r["wallet"], "username": users.get(r["wallet"]),
                               "points": float(r["points"]), "captain_points": float(r["captain_points"])}
                              for r in rows[:10]]})
    conn.commit()
    return {"review": out, "recent": [contest_json(conn, c) for c in done]}


class ReleaseIn(BaseModel):
    sol_usd: float | None = None
    expect_pot_lamports: int


@app.post("/api/admin/contests/{contest_id}/release")
def admin_release(contest_id: int, body: ReleaseIn, admin=Depends(admin_wallet), conn=Depends(db)):
    contest_row(conn, contest_id)
    try:
        prizes = contests.release(conn, contest_id, admin, sol_usd=body.sol_usd, expect_pot=body.expect_pot_lamports)
    except ValueError as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    conn.commit()
    return {"prizes": prizes_json(prizes), "contest": contest_json(conn, contest_row(conn, contest_id))}


# --------------------------------------------------------------- shootout ---
class ShootoutStartIn(BaseModel):
    mode: str


class ShootoutShootIn(BaseModel):
    side: str
    power: str


class ShootoutKeepIn(BaseModel):
    side: str


def shootout_call(conn, fn, *args, **kw):
    try:
        out = fn(conn, *args, **kw)
    except shootout.ShootoutError as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    conn.commit()
    return out


@app.post("/api/shootout/start")
def shootout_start(body: ShootoutStartIn, wallet=Depends(optional_wallet), conn=Depends(db)):
    return shootout_call(conn, shootout.start, wallet, body.mode)


@app.post("/api/shootout/{token}/shoot")
def shootout_shoot(token: str, body: ShootoutShootIn, wallet=Depends(optional_wallet), conn=Depends(db)):
    return shootout_call(conn, shootout.shoot, token, body.side, body.power, wallet=wallet)


@app.post("/api/shootout/{token}/keep")
def shootout_keep(token: str, body: ShootoutKeepIn, wallet=Depends(optional_wallet), conn=Depends(db)):
    return shootout_call(conn, shootout.keep, token, body.side, wallet=wallet)


@app.get("/api/shootout/{token}")
def shootout_status(token: str, wallet=Depends(optional_wallet), conn=Depends(db)):
    return shootout_call(conn, shootout.status, token, wallet)


@app.get("/api/shootout")
def shootout_home(wallet=Depends(optional_wallet), conn=Depends(db)):
    so = CFG["shootout"]
    out = {"rules": {k: so[k] for k in ("rounds", "ranked_games_per_day", "sides", "powers", "miss", "save")},
           "board": shootout.board(conn)}
    if wallet:
        out["ranked_left"] = shootout.left_today(conn, wallet)
    return out


@app.get("/api/health")
def health(conn=Depends(db)):
    conn.execute("SELECT 1")
    return {"ok": True, "time": datetime.now(timezone.utc)}
