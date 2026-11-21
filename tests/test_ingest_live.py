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


def test_players_score_at_their_game_position(conn):
    """A defender listed as a midfielder for one match still scores a goal at 12, not 10."""
    c = conn
    c.execute("INSERT INTO clubs (id, name) VALUES (1, 'Club 1'), (2, 'Club 2')")
    c.execute("INSERT INTO players (id, name, position, club_id, league_id) VALUES (103, 'P103', 'DEF', 1, 39)")
    gw = c.execute("INSERT INTO gameweeks (league_id, season, round, number) VALUES (39, 2026, 'Regular Season - 1', 1) "
                   "RETURNING id").fetchone()[0]
    c.execute("""INSERT INTO fixtures (id, league_id, season, round, gameweek_id, kickoff, status, home_club_id, away_club_id)
                 VALUES (10, 39, 2026, 'Regular Season - 1', %s, now(), 'FT', 1, 2)""", (gw,))
    c.execute("""INSERT INTO player_match_stats (fixture_id, player_id, club_id, position, minutes, goals)
                 VALUES (10, 103, 1, 'MID', 90, 1)""")     # 103 is a DEF in the builder
    assert ingest.rescore(c) == 1
    breakdown = c.execute("SELECT breakdown FROM player_match_scores WHERE player_id = 103").fetchone()[0]
    assert ["goals", 12] in breakdown
