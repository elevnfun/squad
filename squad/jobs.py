"""The once-a-minute job: python -m squad.jobs (or the API with RUN_JOBS=1).

Creates the contests fixtures call for, moves finished contests along (to review, or released when the
review switch is off), returns claims never signed, and settles claims sent but not yet seen confirmed.
Each step runs on its own: one failure is printed and the others still run.
"""

import time
from datetime import datetime, timezone

from . import blitz, chain, contests, winnings
from .db import connect

EVERY = 60   # seconds


def blitz_step(conn, now):
    """Lock squads whose match has kicked off, then score every matchday still in play."""
    locked = blitz.lock(conn, now)
    ids = [r[0] for r in conn.execute("SELECT id FROM contests WHERE kind = 'blitz_matchday' "
                                      "AND state IN ('open', 'live', 'review') ORDER BY id")]
    return {"locked": locked, "scored": sum(blitz.score(conn, i, now) for i in ids)}


def run_once(conn, rpc, now=None):
    now = now or datetime.now(timezone.utc)
    steps = [("ensure", lambda: contests.ensure(conn, now)),
             ("blitz", lambda: blitz_step(conn, now)),
             ("tick", lambda: contests.tick(conn, now)),
             ("expire", lambda: winnings.expire(conn, now=now)),
             ("reconcile", lambda: winnings.reconcile(conn, rpc, now))]
    out = {}
    for name, step in steps:
        try:
            out[name] = step()
            conn.commit()
        except Exception as e:
            conn.rollback()
            out[name] = None
            print(f"{datetime.now():%H:%M:%S} job {name} failed: {e!r}")
    return out


def loop():
    conn, rpc = connect(), chain.Rpc()
    while True:
        try:
            run_once(conn, rpc)
        except Exception as e:      # a dropped connection: reconnect next round
            print(f"job round failed: {e!r}")
            try:
                conn.close()
            except Exception:
                pass
            conn = connect()
        time.sleep(EVERY)


if __name__ == "__main__":
    loop()
