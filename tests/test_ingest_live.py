"""Live loop behaviour with a fake API and fake database: no network, no Postgres."""

import squad.ingest as ingest


def fx(fid, status):
    return {"fixture": {"id": fid, "status": {"short": status}}, "league": {"id": 39},
            "teams": {}, "goals": {}, "events": []}


class FakeClient:
    def __init__(self, live_feeds):
        self.feeds, self.calls, self.player_calls = list(live_feeds), 0, []

    def api(self, path, params, cache_name=None):
        self.calls += 1
        if params.get("live") == "all":
            return {"response": self.feeds.pop(0)}
        self.player_calls.append(params["fixture"])
        return {"response": []}


class FakeConn:
    def commit(self):
        pass


def test_ended_match_is_pulled_once_then_dropped(monkeypatch):
    upserts, details = [], []
    monkeypatch.setattr(ingest, "match_window_open", lambda conn: True)
    monkeypatch.setattr(ingest, "store_response", lambda *a: None)
    monkeypatch.setattr(ingest, "upsert_fixture", lambda conn, f: upserts.append(f["fixture"]["id"]))
    monkeypatch.setattr(ingest, "upsert_player_stats", lambda conn, f, final=False: None)
    monkeypatch.setattr(ingest, "fetch_details",
                        lambda client, conn, ids, use_cache=True: details.append(list(ids)) or [fx(i, "FT") for i in ids])
    monkeypatch.setattr(ingest.time, "sleep", lambda s: None)
    monkeypatch.setitem(ingest.API, "player_stats_poll_seconds", 0)   # poll players every loop

    # poll 1: match 7 live; poll 2: match 7 gone (full time); poll 3: still gone
    client = FakeClient([[fx(7, "2H")], [], []])
    polls = {"n": 0}

    def window(conn):
        polls["n"] += 1
        if polls["n"] > 3:
            raise StopIteration
        return True
    monkeypatch.setattr(ingest, "match_window_open", window)
    try:
        ingest.live_loop(client, FakeConn())
    except StopIteration:
        pass
    assert details == [[], [7], []]          # full-time state fetched exactly once
    assert client.player_calls == [7]       # live player stats only while it was live
