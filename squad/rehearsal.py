"""Devnet rehearsal: ten test wallets play one gameweek through the real API, the real holdings
watcher and real devnet payouts, and the books are checked against the chain at the end.

  python -m squad.rehearsal [--round 7] [--fee-sol 1.5]

Needs the local Postgres (port 5433) and about 1.7 devnet SOL on the test-token authority
(keys/devnet-mint-authority.json; top it up at https://faucet.solana.com). Devnet only.

  1. Database squad_rehearsal is rebuilt from cached real Premier League data (0 API-Football
     calls). The chosen round is moved to kick off two hours from now, so its transfer window is
     really open and the bots save through the API like the website does.
  2. Ten bot wallets (keys/rehearsal-*.json) get different amounts of test $ELEVN, sign in with
     real signatures and build squads by their own simple rules (bots only: the product never
     builds squads for anyone). Two hold too little and must be refused.
  3. The real watcher (squad.watcher) runs. One bot sells after the lock and must freeze at once;
     buying back must not undo it.
  4. The clock runs ahead through live, settling and settlement on the real match data. Test fee
     income (devnet SOL in a test fee wallet) is booked by a daily batch, prizes go 50/30/20, and
     the fee wallet signs the batches through the admin API: 30% at once, then a daily part only
     to winners who still hold. A burn of bought-back tokens runs too.
  5. Every check prints PASS or FAIL; everything goes to out/rehearsal.txt with explorer links.
"""

import argparse
import base64
import csv
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

import psycopg
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import create_idempotent_associated_token_account, get_associated_token_address, transfer_checked
from spl.token.models import TransferCheckedParams

from . import devnet
from .chain import LAMPORTS, Rpc
from .config import CFG, ROOT, launch_leagues

DB = "squad_rehearsal"
URL = f"postgresql://localhost:5433/{DB}"
LEAGUE = "premier-league"
ORIGIN = "http://localhost:3000"
EXPLORER = "https://explorer.solana.com/tx/{}?cluster=devnet"
REQ = CFG["access"]["per_area_requirement"]
DEC = devnet.DECIMALS
BOT_SOL = 0.01                      # pays a bot's own token transfers

# name, test $ELEVN held, the rule behind each squad it tries to build
BOTS = [
    ("Zero", 0, ["form"]),                          # holds nothing: refused
    ("Short", 100_000, ["form"]),                   # below 150k: refused
    ("Form", 150_000, ["form"]),
    ("Value", 180_000, ["value"]),
    ("Stars", 220_000, ["stars"]),
    ("Late", 160_000, ["late"]),                    # tries an over-budget squad first
    ("Twin", 300_000, ["defence", "attack"]),
    ("Seller", 320_000, ["form", "stars"]),         # sells to 150k after the lock: newest squad freezes
    ("Spread", 450_000, ["value", "differential", "random"]),
    ("Whale", 1_000_000, ["stars", "form", "attack"]),
]
SELLER, SELL_TO, WINNER_SELLS_TO, BOUGHT_BACK = "Seller", 150_000, 100_000, 5_000


def expected_squads(held, rules):
    """How many of a bot's squads the 150k-per-squad rule lets it create."""
    return min(len(rules), int(held // REQ))


def rule_key(rule, rng):
    """Sort key for simulate.build_squad: each bot's own way of ranking players."""
    ppg = lambda r: float(r["ppg_blend"] or 0)
    price = lambda r: float(r["price"])
    jitter = lambda: 1 + rng.uniform(-0.15, 0.15)
    return {
        "form": lambda r: -ppg(r) * jitter(),
        "late": lambda r: -ppg(r) * jitter(),
        "value": lambda r: -ppg(r) / price(r) * jitter(),
        "stars": lambda r: (-price(r) * jitter(), -ppg(r)),
        "defence": lambda r: (r["position"] not in ("GK", "DEF"), -ppg(r) * jitter()),
        "attack": lambda r: (r["position"] not in ("MID", "FWD"), -ppg(r) * jitter()),
        "differential": lambda r: -ppg(r) * jitter() / (1 + price(r) / 5),
        "random": lambda r: rng.random(),
    }[rule]


class Report:
    def __init__(self):
        self.lines, self.checks = [], []

    def log(self, s=""):
        print(s, flush=True)
        self.lines.append(s)

    def check(self, ok, what):
        self.checks.append((bool(ok), what))
        self.log(f"  {'PASS' if ok else 'FAIL'}  {what}")

    def tx(self, label, sig):
        self.log(f"    {label}: {EXPLORER.format(sig)}")


def short(wallet):
    w = str(wallet)
    return f"{w[:4]}…{w[-4:]}"


# ------------------------------------------------------------------ chain ---
def sol(rpc, wallet):
    return rpc.sol_balance(str(wallet))


def tokens(rpc, wallet, mint):
    return rpc.token_balance_raw(str(wallet), str(mint)) / 10 ** DEC


def send_sol(rpc, payer, to, lamports):
    ix = transfer(TransferParams(from_pubkey=payer.pubkey(), to_pubkey=Pubkey.from_string(str(to)), lamports=int(lamports)))
    return devnet.send(rpc, [ix], payer)


def mint_tokens(rpc, authority, mint, owner, amount):
    return devnet.send(rpc, devnet.mint_ixs(authority.pubkey(), mint, Pubkey.from_string(str(owner)),
                                            round(amount * 10 ** DEC)), authority)


def send_tokens(rpc, kp, mint, to, amount):
    """A bot moves tokens away (a sale, as far as the game can tell)."""
    to = Pubkey.from_string(str(to))
    return devnet.send(rpc, [create_idempotent_associated_token_account(kp.pubkey(), to, mint),
                             transfer_checked(TransferCheckedParams(
                                 program_id=TOKEN_PROGRAM_ID, source=get_associated_token_address(kp.pubkey(), mint),
                                 mint=mint, dest=get_associated_token_address(to, mint), owner=kp.pubkey(),
                                 amount=int(round(amount * 10 ** DEC)), decimals=DEC))], kp)


def set_tokens(rpc, authority, mint, kp, target):
    have = tokens(rpc, kp.pubkey(), mint)
    if have < target:
        mint_tokens(rpc, authority, mint, kp.pubkey(), target - have)
    elif have > target:
        send_tokens(rpc, kp, mint, authority.pubkey(), have - target)


def sign_tx(tx_b64, kp):
    """What the owner's wallet does on the admin page: sign the offered transaction as it is."""
    tx = Transaction.from_bytes(base64.b64decode(tx_b64))
    tx.sign([kp], tx.message.recent_blockhash)
    return base64.b64encode(bytes(tx)).decode()


# --------------------------------------------------------------- database ---
def build_db(round_no, kickoff_in):
    """Real history up to the round, settled; the round and later ones moved to start soon."""
    from . import game, ingest
    from .apifootball import Client
    from .db import init_schema
    admin = psycopg.connect("postgresql://localhost:5433/postgres", autocommit=True)
    admin.execute(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)")
    admin.execute(f"CREATE DATABASE {DB}")
    admin.close()
    conn = psycopg.connect(URL)
    init_schema(conn)
    league_id, season = launch_leagues()[LEAGUE], CFG["seasons"]["current"]
    client = Client(None, ROOT / "cache", offline=True)
    fixtures = json.loads((ROOT / "cache" / f"list_{league_id}_{season}_2026-11-01.json").read_text())["response"]
    number = lambda fx: int(fx["league"]["round"].split()[-1])
    for fx in fixtures:
        if number(fx) >= round_no:
            fx = {**fx, "fixture": {**fx["fixture"], "status": {"short": "NS", "elapsed": None}},
                  "goals": {"home": None, "away": None}}
        ingest.upsert_fixture(conn, fx)
    game.refresh_gameweeks(conn, league_id, season)
    ingest.final_pull(client, conn, [fx["fixture"]["id"] for fx in fixtures if number(fx) < round_no], use_cache=True)
    conn.execute("UPDATE gameweeks SET state = 'settled' WHERE league_id = %s AND number < %s", (league_id, round_no))
    gw = game.gameweek_by_round(conn, league_id, round_no)
    shift = clock_shift(gw.first_kickoff, datetime.now(timezone.utc), kickoff_in)
    conn.execute("""UPDATE fixtures f SET kickoff = f.kickoff + %s FROM gameweeks g
                    WHERE g.id = f.gameweek_id AND g.league_id = %s AND g.number >= %s""", (shift, league_id, round_no))
    game.refresh_gameweeks(conn, league_id, season)
    game.load_prices(conn, LEAGUE, gw.id)
    ingest.rescore(conn, league_id)
    conn.commit()
    return conn, client, league_id, game.gameweek(conn, gw.id), shift


def clock_shift(first_kickoff, now, lead):
    """Whole hours that move the round to kick off at least `lead` from now (times stay on :00 / :30)."""
    hours = -(-(now + lead - first_kickoff) // timedelta(hours=1))
    return timedelta(hours=hours)


def reshift(conn, ids, shift, before):
    """Cached match data carries the real dates; move those fixtures back onto the rehearsal clock."""
    conn.execute("UPDATE fixtures SET kickoff = kickoff + %s WHERE id = ANY(%s) AND kickoff < %s", (shift, ids, before))


# ------------------------------------------------------------------- run ---
def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m squad.rehearsal")
    ap.add_argument("--round", type=int, default=7, help="Premier League round to play (cached data)")
    ap.add_argument("--fee-sol", type=float, default=1.5, help="test fee income the fee wallet holds")
    args = ap.parse_args(argv)
    rep, rpc = Report(), Rpc(devnet.DEVNET)
    started = datetime.now(timezone.utc)
    rep.log(f"$ELEVN devnet rehearsal, {started:%Y-%m-%d %H:%M} UTC: ten wallets, one gameweek, real API and payouts")

    mint_str = devnet.state().get("mint")
    if not mint_str:
        raise SystemExit("No test mint yet: run `python -m squad.devnet setup` first")
    mint, authority = Pubkey.from_string(mint_str), devnet.keypair("devnet-mint-authority")
    bots = [(name, held, rules, devnet.keypair(f"rehearsal-{name.lower()}")) for name, held, rules in BOTS]
    fee_kp = devnet.keypair("rehearsal-fee-wallet")
    fee = str(fee_kp.pubkey())
    need = sum(max(0, BOT_SOL * LAMPORTS - sol(rpc, kp.pubkey())) for *_, kp in bots)
    need += max(0, args.fee_sol * LAMPORTS - sol(rpc, fee)) + 0.06 * LAMPORTS
    if sol(rpc, authority.pubkey()) < need:
        raise SystemExit(f"The test-token wallet needs about {need / LAMPORTS:.2f} devnet SOL. Get some at\n"
                         f"  https://faucet.solana.com  for  {authority.pubkey()}")

    rep.log("\n1. Wallets and test $ELEVN")
    for name, held, _, kp in bots:
        if sol(rpc, kp.pubkey()) < BOT_SOL * LAMPORTS / 2:
            send_sol(rpc, authority, kp.pubkey(), BOT_SOL * LAMPORTS)
        set_tokens(rpc, authority, mint, kp, held)
    if sol(rpc, fee) < args.fee_sol * LAMPORTS:
        rep.tx("fee income sent to the test fee wallet",
               send_sol(rpc, authority, fee, args.fee_sol * LAMPORTS - sol(rpc, fee)))
    for name, held, _, kp in bots:
        got = tokens(rpc, kp.pubkey(), mint)
        rep.log(f"  {name:<7} {short(kp.pubkey())}  {got:>11,.0f} test $ELEVN")
    rep.check(all(abs(tokens(rpc, kp.pubkey(), mint) - held) < 1 for _, held, _, kp in bots),
              "every wallet holds exactly its planned amount")
    rep.log(f"  fee wallet {short(fee)} holds {sol(rpc, fee) / LAMPORTS:.4f} devnet SOL")

    os.environ.update({"DATABASE_URL": URL, "SQUAD_TOKEN_MINT": mint_str, "FEE_WALLET": fee,
                       "SOLANA_RPC": devnet.DEVNET, "API_GATE_SECRET": ""})
    for var in ("DEV_LOGIN", "HOLDINGS_DEV_BALANCE"):
        os.environ.pop(var, None)
    conn, client, league_id, gw, shift = build_db(args.round, timedelta(hours=2))
    from fastapi.testclient import TestClient
    from . import api as api_module, game, holdings, ingest, payouts
    from .simulate import build_squad
    rep.log(f"\n2. Gameweek {gw.number} (real matches) now kicks off {gw.first_kickoff:%a %d %b %H:%M} UTC; window open")

    with TestClient(api_module.app) as api:
        session = {}

        def sign_in(kp, signer=None):
            msg = api.post("/api/auth/message", json={"wallet": str(kp.pubkey()), "origin": ORIGIN}).json()["message"]
            sig = (signer or kp).sign_message(msg.encode())
            return api.post("/api/auth/verify", json={"wallet": str(kp.pubkey()), "message": msg, "signature": str(sig)})

        def call(method, path, kp, **kw):
            return api.request(method, path, headers={"Authorization": f"Bearer {session[str(kp.pubkey())]}"}, **kw)

        rep.log("\n3. Sign in with real wallet signatures")
        for name, _, _, kp in bots + [("fee wallet", 0, [], fee_kp)]:
            r = sign_in(kp)
            if r.status_code == 200:
                session[str(kp.pubkey())] = r.json()["token"]
        rep.check(len(session) == len(bots) + 1, f"all {len(bots)} bots and the fee wallet signed in")
        rep.check(sign_in(bots[2][3], signer=Keypair()).status_code == 401, "a signature from another key is refused")

        rep.log("\n4. Squads (each bot by its own rule; the website never picks for anyone)")
        rows = list(csv.DictReader(open(ROOT / "out" / f"prices_{LEAGUE}.csv", encoding="utf-8")))
        names = {int(r["player_id"]): r["name"] for r in rows}
        squad_of, saved = {}, 0
        for name, held, rules, kp in bots:
            for i, rule in enumerate(rules):
                label = f"{name} {i + 1}"
                r = call("POST", f"/api/leagues/{LEAGUE}/squads", kp, json={"name": label})
                if i >= expected_squads(held, rules):
                    rep.check(r.status_code == 403, f"{label}: refused at {held:,} tokens ({r.json().get('detail')})")
                    continue
                sid = r.json()["id"]
                squad_of[sid] = (name, label, kp)
                rng = random.Random(label)
                if rule == "late":        # an over-budget bench first: refused, told why, nothing saved
                    xi, bench, cap, vice = build_squad(rows, rule_key("stars", rng))
                    pricey = sorted(rows, key=lambda r: -float(r["price"]))
                    big = []
                    for b in bench:
                        pos = next(r["position"] for r in rows if int(r["player_id"]) == b)
                        big.append(next(int(r["player_id"]) for r in pricey if r["position"] == pos
                                        and int(r["player_id"]) not in xi + bench + big))
                    r = call("POST", f"/api/squads/{sid}/save", kp, json={"starters": xi, "bench": big, "captain": cap,
                                                                           "vice_captain": vice})
                    problems = [p["message"] for p in r.json().get("detail", {}).get("problems", [])]
                    rep.check(r.status_code == 422 and problems, f"{label}: over-budget save refused: {'; '.join(problems)}")
                xi, bench, cap, vice = build_squad(rows, rule_key(rule, rng))
                r = call("POST", f"/api/squads/{sid}/save", kp, json={"starters": xi, "bench": bench, "captain": cap,
                                                                       "vice_captain": vice})
                ok = r.status_code == 200 and r.json()["ok"]
                saved += ok
                rep.log(f"  {label:<9} ({rule:<12}) {'saved' if ok else 'NOT saved: ' + str(r.json())[:160]}, "
                        f"captain {names.get(cap, cap)}")
        want = sum(expected_squads(h, rs) for _, h, rs, _ in bots)
        rep.check(saved == want, f"{saved} of {want} allowed squads saved through the API")

        rep.log("\n5. Daily batch before kickoff books the fee income")
        b = call("POST", "/api/admin/batches", fee_kp).json()
        income = b["summary"]["income"]
        rep.check(income > 0 and abs(income - sol(rpc, fee)) < 10, f"income booked: {income / LAMPORTS:.4f} SOL")
        rep.check(call("POST", "/api/admin/batches", bots[2][3]).status_code == 403, "a player cannot run payouts")
        rep.log(f"  prize pot {payouts.bucket(conn, f'pot:{league_id}') / LAMPORTS:.4f}, buyback "
                f"{payouts.bucket(conn, 'buyback') / LAMPORTS:.4f}, reserve {payouts.bucket(conn, 'reserve') / LAMPORTS:.4f}, "
                f"operations {payouts.bucket(conn, 'operations') / LAMPORTS:.4f} SOL")

        log_path = ROOT / "out" / "rehearsal-watcher.log"
        watcher = subprocess.Popen([sys.executable, "-u", "-m", "squad.watcher"], cwd=ROOT, env=dict(os.environ),
                                   stdout=open(log_path, "w"), stderr=subprocess.STDOUT)

        def wait_log(text, seconds):
            end = time.time() + seconds
            while time.time() < end:
                if text in log_path.read_text():
                    return True
                time.sleep(1)
            return False

        try:
            rep.check(wait_log("watching", 60), "the holdings watcher is running on devnet")
            final_pull = lambda c, ids: (ingest.final_pull(client, c, ids, use_cache=True), reshift(c, ids, shift, started))

            def advance(when, label):
                for rnd, frm, to in game.tick(conn, league_id, now=when, final_pull=final_pull):
                    rep.log(f"  {when:%a %d %b %H:%M}  {label:<16} {rnd}: {frm} -> {to}")
                conn.commit()

            rep.log("\n6. The clock runs: kickoff")
            advance(gw.first_kickoff, "first kickoff")

            rep.log("\n7. Seller sells after the lock")
            seller = next(kp for n, _, _, kp in bots if n == SELLER)
            seller_squads = sorted(s for s, (n, _, _) in squad_of.items() if n == SELLER)
            t0 = time.time()
            rep.tx(f"Seller sends {320_000 - SELL_TO:,} away", send_tokens(rpc, seller, mint, authority.pubkey(), 320_000 - SELL_TO))
            froze = wait_log(f"{short(seller.pubkey())} holds", 90)
            took = time.time() - t0
            conn.commit()
            frozen = {r[0] for r in conn.execute("SELECT squad_id FROM squad_freezes WHERE gameweek_id = %s", (gw.id,))}
            rep.check(froze and frozen == {seller_squads[-1]}, f"watcher froze only Seller's newest squad, {took:.0f}s after the sale")
            rep.tx("Seller buys back", mint_tokens(rpc, authority, mint, seller.pubkey(), 320_000 - SELL_TO))
            time.sleep(15)
            conn.commit()
            still = {r[0] for r in conn.execute("SELECT squad_id FROM squad_freezes WHERE gameweek_id = %s", (gw.id,))}
            rep.check(still == frozen and (holdings.stored_balance(conn, str(seller.pubkey())) or 0) >= 320_000,
                      "watcher saw the buy-back, and the squad stays frozen")

            rep.log("\n8. Matches played, settling, settlement")
            ids = [r[0] for r in conn.execute("SELECT id FROM fixtures WHERE gameweek_id = %s", (gw.id,))]
            for fx in ingest.fetch_details(client, conn, ids):
                ingest.upsert_fixture(conn, fx)
                ingest.upsert_player_stats(conn, fx)
            reshift(conn, ids, shift, started)
            conn.commit()
            settles = game.gameweek(conn, gw.id).settles_at
            advance(settles - timedelta(hours=CFG["prizes"]["settlement_delay_hours"]), "matches played")
            advance(settles, "settlement time")
            gw = game.gameweek(conn, gw.id)
            rep.check(gw.state == "settled", f"gameweek {gw.number} settled")
            rep.log("\n  Table")
            for rank, sid, _, sname, pts, _, _ in game.leaderboard(conn, gw):
                rep.log(f"  {rank:>2}. {sname:<9} {float(pts):6.1f}{'  (frozen)' if sid in frozen else ''}")

            prizes = conn.execute("""SELECT id, place, wallet, squad_id, lamports, instant FROM prizes
                                     WHERE gameweek_id = %s ORDER BY place""", (gw.id,)).fetchall()
            pot = sum(p[4] for p in prizes)
            bot_of = {str(kp.pubkey()): n for n, _, _, kp in bots}
            rep.log("\n  Prizes")
            for _, place, wallet, sid, lam, inst in prizes:
                rep.log(f"  {place}. {bot_of[wallet]:<7} {squad_of[sid][1]:<9} {lam / LAMPORTS:.4f} SOL "
                        f"({inst / LAMPORTS:.4f} now, the rest over {CFG['prizes']['vesting_days']} days)")
            rep.check(len(prizes) == 3 and len({p[2] for p in prizes}) == 3, "three prizes, one per wallet")
            rep.check(all(abs(p[4] - pot * s) <= 2 for p, s in zip(prizes, CFG["prizes"]["place_split"])), "split 50 / 30 / 20")
            rep.check(not {p[3] for p in prizes} & frozen, "the frozen squad wins nothing")

            def pay(batch, label):
                """Sign every offered transaction with the fee wallet, as the admin page does."""
                before = {w: sol(rpc, w) for w in bot_of}
                txs = call("POST", f"/api/admin/batches/{batch['id']}/transactions", fee_kp).json()["transactions"]
                res = call("POST", f"/api/admin/batches/{batch['id']}/submit", fee_kp,
                           json={"signed": [{"idx": t["idx"], "tx": sign_tx(t["tx"], fee_kp)} for t in txs]}).json()
                for t, r in zip(txs, res["results"]):
                    rep.tx(f"{label}: {t['label']}", r["result"])
                paid = [i for i in res["batch"]["items"] if i["status"] == "paid" and i["wallet"] in bot_of]
                rep.check(res["batch"]["status"] == "done", f"{label}: batch fully sent")
                owed = lambda w: round(sum(i["sol"] for i in paid if i["wallet"] == w) * LAMPORTS)
                rep.check(paid and all(abs(sol(rpc, w) - before[w] - owed(w)) <= 1 for w in {i["wallet"] for i in paid}),
                          f"{label}: every winner received exactly what was owed")

            rep.log("\n9. Day 1: the owner approves the batch (30% of each prize, plus a burn)")
            rep.tx(f"{BOUGHT_BACK:,} bought-back tokens arrive", mint_tokens(rpc, authority, mint, fee, BOUGHT_BACK))
            b = call("POST", "/api/admin/batches", fee_kp).json()
            rep.log(f"  batch {b['id']}: " + ", ".join(
                f"{i['kind']} {i['sol']:.4f} SOL" if i["sol"] else f"{i['kind']} {i['tokens'] / 10 ** DEC:,.0f} tokens"
                for i in b["items"]))
            pay(b, "day 1")
            rep.check(tokens(rpc, fee, mint) == 0, "bought-back tokens burned")

            rep.log("\n10. A winner sells below 150k before day 2")
            second = prizes[1][2]
            second_kp = next(kp for _, _, _, kp in bots if str(kp.pubkey()) == second)
            have = tokens(rpc, second, mint)
            rep.tx(f"{bot_of[second]} sends {have - WINNER_SELLS_TO:,.0f} away",
                   send_tokens(rpc, second_kp, mint, authority.pubkey(), have - WINNER_SELLS_TO))
            end = time.time() + 60
            while time.time() < end and (holdings.stored_balance(conn, second) or 0) >= REQ:
                time.sleep(1)
                conn.commit()
            rep.check((holdings.stored_balance(conn, second) or 0) < REQ, f"watcher recorded {bot_of[second]}'s new balance")

            rep.log("\n11. Day 2: one daily part to winners who still hold")
            bid = payouts.prepare_batch(conn, rpc, now=settles + timedelta(days=1))   # the rehearsal clock, a day on
            b = api_module.batch_json(conn, bid)
            vests = {i["wallet"] for i in b["items"] if i["kind"] == "vest"}
            rep.check(vests == {p[2] for p in prizes} - {second}, f"daily part for the holders, none for {bot_of[second]}")
            pay(b, "day 2")
        finally:
            watcher.terminate()

        rep.log("\n12. Books against the chain")
        wallet_sol, books = sol(rpc, fee), payouts.accounted(conn)
        rep.log(f"  fee wallet {wallet_sol / LAMPORTS:.6f} SOL on chain, books say {books / LAMPORTS:.6f}")
        rep.check(abs(wallet_sol - books) <= 1, "the books match the fee wallet exactly")
        for bucket, lam in conn.execute("SELECT bucket, lamports FROM fee_buckets ORDER BY bucket"):
            rep.log(f"  {bucket:<16} {lam / LAMPORTS:.6f} SOL")

    passed = sum(ok for ok, _ in rep.checks)
    rep.log(f"\n{passed} of {len(rep.checks)} checks passed")
    for ok, what in rep.checks:
        if not ok:
            rep.log(f"  FAILED: {what}")
    out = ROOT / "out" / "rehearsal.txt"
    out.write_text("\n".join(rep.lines) + "\n", encoding="utf-8")
    print(f"written to {out.relative_to(ROOT)}")
    return 0 if passed == len(rep.checks) else 1


if __name__ == "__main__":
    sys.exit(main())
