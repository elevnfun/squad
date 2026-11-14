"""API-Football v3 client with an on-disk cache of raw responses (shared by pricing and ingestion)."""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .config import CFG

API_BASE = CFG["api_football"]["base_url"]
SQUAD_POSITIONS = {"Goalkeeper": "GK", "Defender": "DEF", "Midfielder": "MID", "Attacker": "FWD"}
FPL_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"


class Client:
    def __init__(self, key, cache_dir, offline=False, pause=0.25):
        self.key, self.cache, self.offline, self.pause = key, Path(cache_dir), offline, pause
        self.calls = 0
        (self.cache / "fixtures").mkdir(parents=True, exist_ok=True)

    def _get(self, url, headers):
        for attempt in range(6):
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    self.calls += 1
                    remaining = r.headers.get("x-ratelimit-requests-remaining")
                    data = json.loads(r.read().decode())
                    if remaining is not None and int(remaining) < 50:
                        print(f"  ! only {remaining} API requests left today")
                    time.sleep(self.pause)
                    return data
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    wait = 10 * (attempt + 1)
                    print(f"  rate limited, waiting {wait}s")
                    time.sleep(wait)
                    continue
                raise
            except urllib.error.URLError:
                time.sleep(5 * (attempt + 1))
        raise RuntimeError(f"giving up on {url}")

    def api(self, path, params, cache_name=None):
        if cache_name:
            f = self.cache / f"{cache_name}.json"
            if f.exists():
                return json.loads(f.read_text())
        if self.offline:
            raise RuntimeError(f"offline mode and no cache for {path} {params}")
        url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"
        data = self._get(url, {"x-apisports-key": self.key})
        errors = data.get("errors")
        if errors and (isinstance(errors, dict) and errors or isinstance(errors, list) and errors):
            raise RuntimeError(f"API error for {path} {params}: {errors}")
        if cache_name:
            (self.cache / f"{cache_name}.json").write_text(json.dumps(data))
        return data

    def squad_positions(self, team_ids, season):
        """Official squad position of every player at these clubs: their one fixed game position.
        1 call per club, cached per season as cache/squad_<team>_<season>.json."""
        out = {}
        for tid in sorted(team_ids):
            data = self.api("/players/squads", {"team": tid}, cache_name=f"squad_{tid}_{season}")
            for block in data.get("response", []):
                for p in block.get("players", []):
                    if p.get("position") in SQUAD_POSITIONS:
                        out[p["id"]] = SQUAD_POSITIONS[p["position"]]
        return out

    def fpl(self):
        f = self.cache / "fpl_bootstrap.json"
        if f.exists():
            return json.loads(f.read_text())
        if self.offline:
            raise RuntimeError("offline mode and no FPL cache")
        data = self._get(FPL_URL, {"User-Agent": "Mozilla/5.0"})
        f.write_text(json.dumps(data))
        return data
