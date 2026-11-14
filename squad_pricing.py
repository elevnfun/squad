#!/usr/bin/env python3
"""
$ELEVN player pricing - v0.1 (Premier League, La Liga, Bundesliga)

What it does
  1. Pulls every finished league match for last season (2025/26) and this
     season so far (2026/27) from API-Football, 20 matches per request.
  2. Scores every player-match with the platform's scoring:
       core points (FPL x 2, no bonus / defensive contributions yet)
       + involvement points (capped at 4 per match).
  3. Blends points per game: 60% last season + 40% this season
     (the 40% shrinks if a player has under 450 minutes this season).
  4. Calibrates price = a + b * PPG per position against FPL prices for
     matched Premier League players, then applies the same lines to all
     three leagues (clamped to 4.0M - 15.0M).
  5. Writes price lists, a calibration report and a 100M squad check.

Run
  put APIFOOTBALL_KEY in .env (see .env.example) or export it, then
  python3 squad_pricing.py

All numbers come from config.toml. Raw API responses are cached in ./cache,
so a rerun costs no API calls. No third-party packages needed (Python 3.11+).
"""

import argparse
import bisect
import csv
import difflib
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from dataclasses import replace
from pathlib import Path

from squad.apifootball import Client
from squad.config import CFG, ROOT, launch_leagues
from squad.scoring import parse_fixture, score_match

LEAGUES = launch_leagues()
LAST_SEASON, CUR_SEASON = CFG["seasons"]["last"], CFG["seasons"]["current"]
FIXTURES_PER_REQUEST = CFG["api_football"]["fixtures_per_request"]

# ---------------------------------------------------------------- pricing ---
PR = CFG["pricing"]
W_LAST, W_CUR = PR["weight_last_season"], PR["weight_this_season"]
MIN_MINUTES = PR["min_minutes"]
PRICE_MIN, PRICE_MAX = PR["price_min"], PR["price_max"]
DEFAULT_PRICE = PR["default_price"]
PRICE_METHOD = PR["method"]
SHRINK_MINUTES = PR["shrink_minutes"]
MIN_FIT_PLAYERS, WEAK_SLOPE, WEAK_R2 = PR["min_fit_players"], PR["weak_fit_min_slope"], PR["weak_fit_min_r2"]
FPL_POS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
SQUAD_QUOTA = CFG["squad"]["quota"]
BUDGET, MAX_PER_CLUB = CFG["squad"]["budget"], CFG["squad"]["max_per_club"]

TEAM_ALIASES = {
    "man utd": "manchester united", "man city": "manchester city",
    "spurs": "tottenham", "nott'm forest": "nottingham forest",
    "nottm forest": "nottingham forest", "wolves": "wolverhampton",
    "newcastle": "newcastle", "west ham": "west ham", "brighton": "brighton",
    "sheffield utd": "sheffield utd", "leeds": "leeds",
}


# ------------------------------------------------------------------ utils ---
def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9' ]+", " ", s.lower()).strip()


# --------------------------------------------------------------- fetching ---
def fixture_ids(client, league_id, season):
    # last season's list never changes; this season's list is cached per day
    suffix = "" if season != CUR_SEASON else "_" + time.strftime("%Y-%m-%d")
    data = client.api("/fixtures", {"league": league_id, "season": season, "status": "FT-AET-PEN"},
                      cache_name=f"list_{league_id}_{season}{suffix}")
    return [(fx["fixture"]["id"], fx["fixture"]["date"]) for fx in data.get("response", [])]


def fixture_details(client, ids):
    out, missing = {}, []
    for fid in ids:
        f = client.cache / "fixtures" / f"{fid}.json"
        if f.exists():
            out[fid] = json.loads(f.read_text())
        else:
            missing.append(fid)
    for i in range(0, len(missing), FIXTURES_PER_REQUEST):
        chunk = missing[i:i + FIXTURES_PER_REQUEST]
        data = client.api("/fixtures", {"ids": "-".join(map(str, chunk))})
        for fx in data.get("response", []):
            fid = fx["fixture"]["id"]
            if not fx.get("players"):
                pdata = client.api("/fixtures/players", {"fixture": fid})
                fx["players"] = pdata.get("response", [])
            (client.cache / "fixtures" / f"{fid}.json").write_text(json.dumps(fx))
            out[fid] = fx
        print(f"    fetched {min(i + FIXTURES_PER_REQUEST, len(missing))}/{len(missing)} new matches")
    return out


# ---------------------------------------------------------------- scoring ---
def count_positions(fx, players):
    """First pass: parse a fixture and count each player's per-match positions."""
    pms = parse_fixture(fx)
    for pm in pms:
        rec = players[pm.player_id]
        rec["name"] = rec.get("name") or pm.name
        rec["positions"][pm.position] += 1
    return pms


def process_fixture(fx, pms, season, league_slug, players):
    """Second pass: score every player-match at the player's game position with the shared
    engine (squad.scoring) and add it to the season totals."""
    date = fx["fixture"]["date"]
    team_names = {fx["teams"][side]["id"]: fx["teams"][side]["name"] for side in ("home", "away")}
    for pm in pms:
        rec = players[pm.player_id]
        if pm.minutes <= 0:
            continue
        s = score_match(replace(pm, position=rec["position"]))
        team = {"id": pm.team_id, "name": team_names.get(pm.team_id, "")}
        ss = rec["seasons"][season]
        ss["matches"] += 1
        ss["minutes"] += s.minutes
        ss["points"] += s.base
        ss["core"] += s.core_plus + s.core_minus
        ss["inv"] += s.involvement
        if season == CUR_SEASON and date >= rec.get("last_date", ""):
            rec["last_date"], rec["league"], rec["team"], rec["team_id"] = date, league_slug, team["name"], team["id"]
        if not rec.get("team"):
            rec["team"], rec["team_id"], rec["league_last"] = team["name"], team["id"], league_slug


def new_player():
    return {"positions": Counter(),
            "seasons": defaultdict(lambda: {"matches": 0, "minutes": 0, "points": 0.0, "core": 0.0, "inv": 0.0})}


def blended_ppg(rec):
    last, cur = rec["seasons"].get(LAST_SEASON), rec["seasons"].get(CUR_SEASON)
    ppg = lambda s: s["points"] / s["matches"] if s and s["matches"] else None
    p_last, p_cur = ppg(last), ppg(cur)
    minutes = (last["minutes"] if last else 0) + (cur["minutes"] if cur else 0)
    if p_last is not None and p_cur is not None:
        w_cur = W_CUR * min(1.0, cur["minutes"] / MIN_MINUTES)
        blend = (W_LAST * p_last + w_cur * p_cur) / (W_LAST + w_cur)
    else:
        blend = p_last if p_last is not None else p_cur
    return p_last, p_cur, blend, minutes


# ------------------------------------------------------------ calibration ---
def fit_line(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return my, 0.0, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return a, b, (1 - ss_res / ss_tot) if ss_tot else 0.0


def ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    a, b, r2 = fit_line(rx, ry)
    return (1 if b >= 0 else -1) * r2 ** 0.5


def fit_curve(xs, ys):
    """Percentile curve: the k-th lowest PPG maps to the k-th lowest FPL price.

    Keeps FPL's own price spread (including the long tail at the top), where a
    least-squares line pulls the best players back toward the average. Beyond the
    calibration range it extends with a spread-matched slope (sd price / sd PPG).
    """
    pairs = list(zip(sorted(xs), sorted(ys)))
    knots, i = [], 0
    while i < len(pairs):   # tied PPGs share their average price
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        group = pairs[i:j + 1]
        knots.append((group[0][0], sum(p for _, p in group) / len(group)))
        i = j + 1
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sx = (sum((x - mx) ** 2 for x in xs) / n) ** 0.5
    sy = (sum((y - my) ** 2 for y in ys) / n) ** 0.5
    return {"knots": knots, "tail_slope": sy / sx if sx else 0.0, "rho": spearman(xs, ys), "n": n}


def curve_value(curve, x):
    k, slope = curve["knots"], curve["tail_slope"]
    if x <= k[0][0]:
        return k[0][1] + slope * (x - k[0][0])
    if x >= k[-1][0]:
        return k[-1][1] + slope * (x - k[-1][0])
    hi = bisect.bisect_right([p for p, _ in k], x)
    (x0, y0), (x1, y1) = k[hi - 1], k[hi]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def match_teams(fpl_teams, api_teams):
    api_norm = {norm(t): t for t in api_teams}
    out = {}
    for t in fpl_teams:
        key = TEAM_ALIASES.get(norm(t["name"]), norm(t["name"]))
        cands = [n for n in api_norm if key in n or n in key]
        best = cands[0] if len(cands) == 1 else None
        if not best:
            close = difflib.get_close_matches(key, list(api_norm), n=1, cutoff=0.5)
            best = close[0] if close else None
        if best:
            out[t["id"]] = api_norm[best]
    return out


def name_score(el, api_name):
    a_tokens = norm(api_name).split()
    if not a_tokens:
        return 0
    a_last, a_first = a_tokens[-1], a_tokens[0]
    f_tokens = set(norm(el["second_name"]).split()) | set(norm(el["web_name"]).split())
    if a_last in f_tokens or norm(el["web_name"]) == norm(api_name):
        initial_ok = norm(el["first_name"])[:1] == a_first[:1]
        return 0.9 + (0.1 if initial_ok else 0)
    full = norm(f"{el['first_name']} {el['second_name']}")
    return max(difflib.SequenceMatcher(None, full, norm(api_name)).ratio(),
               difflib.SequenceMatcher(None, norm(el["web_name"]), a_last).ratio() * 0.95)


def match_fpl(fpl, pl_players):
    """pl_players: list of (pid, rec) currently in the Premier League."""
    team_map = match_teams(fpl["teams"], sorted({r["team"] for _, r in pl_players}))
    by_team = defaultdict(list)
    for pid, rec in pl_players:
        by_team[rec["team"]].append((pid, rec))
    pairs = []
    for el in fpl["elements"]:
        api_team = team_map.get(el["team"])
        for pid, rec in by_team.get(api_team, []):
            s = name_score(el, rec["name"])
            if FPL_POS.get(el["element_type"]) == rec["position"]:
                s += 0.02
            if s >= 0.8:
                pairs.append((s, el["id"], pid))
    pairs.sort(reverse=True)
    used_el, used_pid, matched = set(), set(), {}
    for s, eid, pid in pairs:
        if eid in used_el or pid in used_pid:
            continue
        used_el.add(eid)
        used_pid.add(pid)
        matched[pid] = eid
    return matched, team_map


# ------------------------------------------------------------ squad check ---
def squad_check(rows):
    pool = [r for r in rows if r["ppg_blend"] is not None and r["price_source"] == "model"]
    squad = []
    for pos, q in SQUAD_QUOTA.items():
        squad += sorted([r for r in pool if r["position"] == pos], key=lambda r: -r["ppg_blend"])[:q]
    allstar_cost = sum(r["price"] for r in squad)

    def swaps(sq):
        """Same-position replacements that keep every club within the limit."""
        clubs, ids = Counter(r["team"] for r in sq), {id(r) for r in sq}
        for i, cur in enumerate(sq):
            for cand in pool:
                if id(cand) in ids or cand["position"] != cur["position"]:
                    continue
                if cand["team"] != cur["team"] and clubs[cand["team"]] >= MAX_PER_CLUB:
                    continue
                yield i, cur, cand

    # 1. club limit: swap out the over-limit club's player whose best legal replacement loses least PPG
    for _ in range(50):
        clubs = Counter(r["team"] for r in squad)
        over = {t for t, n in clubs.items() if n > MAX_PER_CLUB}
        if not over:
            break
        best = min(((cur["ppg_blend"] - cand["ppg_blend"], i, cand) for i, cur, cand in swaps(squad)
                    if cur["team"] in over and cand["team"] not in over),
                   key=lambda t: t[0], default=None)
        if not best:
            break
        squad[best[1]] = best[2]

    # 2. budget: downgrade with the smallest PPG loss per million saved until the squad fits
    for _ in range(200):
        if sum(r["price"] for r in squad) <= BUDGET:
            break
        best = min((((cur["ppg_blend"] - cand["ppg_blend"]) / (cur["price"] - cand["price"]), i, cand)
                    for i, cur, cand in swaps(squad) if cand["price"] < cur["price"]),
                   key=lambda t: t[0], default=None)
        if not best:
            break
        squad[best[1]] = best[2]

    # 3. spend what is left: take the biggest PPG gain that still fits the budget
    for _ in range(200):
        left = BUDGET - sum(r["price"] for r in squad)
        best = max(((cand["ppg_blend"] - cur["ppg_blend"], i, cand) for i, cur, cand in swaps(squad)
                    if cand["ppg_blend"] > cur["ppg_blend"] and cand["price"] - cur["price"] <= left + 1e-9),
                   key=lambda t: t[0], default=None)
        if not best:
            break
        squad[best[1]] = best[2]
    return allstar_cost, squad


# ------------------------------------------------------------------- main ---
def main():
    ap = argparse.ArgumentParser(description="$ELEVN player pricing v0.1")
    ap.add_argument("--key", default=os.environ.get("APIFOOTBALL_KEY"))
    ap.add_argument("--cache", default=str(ROOT / "cache"))
    ap.add_argument("--out", default=str(ROOT / "out"))
    ap.add_argument("--offline", action="store_true", help="use cached data only")
    args = ap.parse_args()
    if not args.key and not args.offline:
        sys.exit("Set APIFOOTBALL_KEY (export APIFOOTBALL_KEY=...) or pass --key")

    client = Client(args.key, args.cache, offline=args.offline)
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    players = defaultdict(new_player)

    parsed = []
    for slug, lid in LEAGUES.items():
        for season in (LAST_SEASON, CUR_SEASON):
            ids = fixture_ids(client, lid, season)
            print(f"{slug} {season}/{str(season + 1)[2:]}: {len(ids)} finished matches")
            details = fixture_details(client, [i for i, _ in ids])
            for fid, _ in sorted(ids, key=lambda t: t[1]):
                if fid in details:
                    parsed.append((details[fid], count_positions(details[fid], players), season, slug))
    # Fixed game position (builder section) = the club's official squad position from
    # API-Football; only players missing from every squad list fall back to their most frequent
    # match position. Positions are fixed first, so every match is scored at them.
    clubs = {fx["teams"][side]["id"] for fx, _, season, _ in parsed if season == CUR_SEASON
             for side in ("home", "away")}
    official = client.squad_positions(clubs, CUR_SEASON)
    from_squads = 0
    for pid, rec in players.items():
        if pid in official:
            rec["position"], from_squads = official[pid], from_squads + 1
        else:
            rec["position"] = rec["positions"].most_common(1)[0][0] if rec["positions"] else "MID"
    print(f"positions: {from_squads} from official squad lists ({len(clubs)} clubs), "
          f"{len(players) - from_squads} from most frequent match position")
    for fx, pms, season, slug in parsed:
        process_fixture(fx, pms, season, slug, players)

    # final position, blended PPG
    for pid, rec in players.items():
        rec["ppg_last"], rec["ppg_cur"], rec["ppg_raw"], rec["minutes_total"] = blended_ppg(rec)

    # shrink toward the minutes-weighted position average so a hot 600-minute start
    # does not price like a full season of the same output
    pos_sum, pos_min = Counter(), Counter()
    for rec in players.values():
        if rec["ppg_raw"] is not None and rec["minutes_total"] >= MIN_MINUTES:
            pos_sum[rec["position"]] += rec["ppg_raw"] * rec["minutes_total"]
            pos_min[rec["position"]] += rec["minutes_total"]
    pos_avg = {pos: pos_sum[pos] / pos_min[pos] for pos in pos_min}
    for rec in players.values():
        if rec["ppg_raw"] is None or rec["position"] not in pos_avg:
            rec["ppg_blend"] = rec["ppg_raw"]
            continue
        m = rec["minutes_total"]
        rec["ppg_blend"] = (m * rec["ppg_raw"] + SHRINK_MINUTES * pos_avg[rec["position"]]) / (m + SHRINK_MINUTES)

    current = [(pid, r) for pid, r in players.items() if r.get("league")]
    pl_now = [(pid, r) for pid, r in current if r["league"] == "premier-league"]

    # FPL calibration
    fpl = client.fpl()
    fpl_by_id = {e["id"]: e for e in fpl["elements"]}
    matched, team_map = match_fpl(fpl, pl_now)
    lines, report = {}, []
    pooled_x, pooled_y = [], []
    by_pos = defaultdict(lambda: ([], []))
    for pid, eid in matched.items():
        rec, el = players[pid], fpl_by_id[eid]
        if rec["ppg_blend"] is None or rec["minutes_total"] < MIN_MINUTES:
            continue
        price = el["now_cost"] / 10
        by_pos[rec["position"]][0].append(rec["ppg_blend"])
        by_pos[rec["position"]][1].append(price)
        pooled_x.append(rec["ppg_blend"])
        pooled_y.append(price)
    pa, pb, pr2 = fit_line(pooled_x, pooled_y) if pooled_x else (5.0, 0.5, 0.0)
    pooled_curve = fit_curve(pooled_x, pooled_y) if pooled_x else None
    curves = {}
    for pos in ("GK", "DEF", "MID", "FWD"):
        xs, ys = by_pos[pos]
        source = "position fit"
        a, b, r2 = fit_line(xs, ys) if len(xs) >= 2 else (pa, pb, pr2)
        if len(xs) < MIN_FIT_PLAYERS:
            a, b, r2, source = pa, pb, pr2, "pooled fallback (too few players)"
            curves[pos] = pooled_curve
        elif PRICE_METHOD == "percentile":
            # a weak correlation only blurs the ranking; prices still follow FPL's spread for the position
            curves[pos] = fit_curve(xs, ys)
        elif b < WEAK_SLOPE or r2 < WEAK_R2:   # flat or noisy fit squashes prices together
            a, b, r2, source = pa, pb, pr2, "pooled fallback (weak position fit)"
        rho = curves[pos]["rho"] if curves.get(pos) else spearman(xs, ys) if len(xs) >= 2 else 0.0
        lines[pos] = {"method": PRICE_METHOD, "a": round(a, 3), "b": round(b, 3), "r2": round(r2, 3),
                      "rho": round(rho, 3), "n": len(xs), "source": source}
        if curves.get(pos):
            k = curves[pos]["knots"]
            lines[pos]["ppg_range"] = [round(k[0][0], 2), round(k[-1][0], 2)]
            lines[pos]["price_range"] = [round(k[0][1], 1), round(k[-1][1], 1)]

    def price_of(rec):
        if rec["ppg_blend"] is None or rec["minutes_total"] < MIN_MINUTES:
            return DEFAULT_PRICE[rec["position"]], "default"
        if PRICE_METHOD == "percentile":
            raw = curve_value(curves[rec["position"]], rec["ppg_blend"])
        else:
            l = lines[rec["position"]]
            raw = l["a"] + l["b"] * rec["ppg_blend"]
        return round(min(PRICE_MAX, max(PRICE_MIN, raw)), 1), "model"

    summary = {"api_calls_this_run": None, "calibration": lines,
               "position_avg_ppg": {p: round(v, 2) for p, v in pos_avg.items()},
               "shrink_minutes": SHRINK_MINUTES,
               "pooled": {"a": round(pa, 3), "b": round(pb, 3), "r2": round(pr2, 3), "n": len(pooled_x)},
               "fpl_matched": len(matched), "fpl_players": len(fpl["elements"]),
               "fpl_team_map": {next(t["name"] for t in fpl["teams"] if t["id"] == k): v for k, v in team_map.items()},
               "leagues": {}}

    fields = ["player_id", "name", "team_id", "team", "position", "price", "price_source", "ppg_blend", "ppg_raw", "ppg_last", "matches_last",
              "ppg_this", "matches_this", "minutes_total", "fpl_price", "price_diff"]
    for slug in LEAGUES:
        rows = []
        for pid, rec in current:
            if rec["league"] != slug:
                continue
            price, src = price_of(rec)
            last, cur = rec["seasons"].get(LAST_SEASON), rec["seasons"].get(CUR_SEASON)
            fpl_price = fpl_by_id[matched[pid]]["now_cost"] / 10 if pid in matched else None
            rows.append({
                "player_id": pid, "name": rec["name"], "team_id": rec["team_id"], "team": rec["team"],
                "position": rec["position"],
                "price": price, "price_source": src,
                "ppg_blend": round(rec["ppg_blend"], 2) if rec["ppg_blend"] is not None else None,
                "ppg_raw": round(rec["ppg_raw"], 2) if rec["ppg_raw"] is not None else None,
                "ppg_last": round(rec["ppg_last"], 2) if rec["ppg_last"] is not None else None,
                "matches_last": last["matches"] if last else 0,
                "ppg_this": round(rec["ppg_cur"], 2) if rec["ppg_cur"] is not None else None,
                "matches_this": cur["matches"] if cur else 0,
                "minutes_total": int(rec["minutes_total"]),
                "fpl_price": fpl_price,
                "price_diff": round(price - fpl_price, 1) if fpl_price is not None else None,
            })
        rows.sort(key=lambda r: (-r["price"], -(r["ppg_blend"] or 0)))
        with open(out / f"prices_{slug}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

        allstar, squad = squad_check(rows)
        model_rows = [r for r in rows if r["price_source"] == "model"]
        brackets = Counter()
        for r in rows:
            b = "13-15" if r["price"] >= 13 else "10-12.9" if r["price"] >= 10 else "7-9.9" if r["price"] >= 7 else "5-6.9" if r["price"] >= 5 else "4-4.9"
            brackets[b] += 1
        summary["leagues"][slug] = {
            "players_priced": len(rows), "model_priced": len(model_rows),
            "default_priced": len(rows) - len(model_rows),
            "price_brackets": dict(brackets),
            "top10": [(r["name"], r["team"], r["position"], r["price"], r["ppg_blend"]) for r in rows[:10]],
            "allstar_squad_cost": round(allstar, 1),
            "squad_under_100M": {"cost": round(sum(r["price"] for r in squad), 1),
                                 "ppg_total": round(sum(r["ppg_blend"] for r in squad), 1),
                                 "players": [(r["name"], r["position"], r["price"]) for r in squad]},
        }

    # top-50 FPL comparison + unmatched list for manual review
    comp = []
    for pid, eid in matched.items():
        rec, el = players[pid], fpl_by_id[eid]
        price, src = price_of(rec)
        comp.append((el["now_cost"] / 10, f"{el['web_name']} ({rec['name']})", rec["team"], rec["position"],
                     price, src, rec["ppg_blend"]))
    comp.sort(reverse=True)
    matched_eids = set(matched.values())
    unmatched = sorted([e for e in fpl["elements"] if e["id"] not in matched_eids and e.get("minutes", 1) > 0],
                       key=lambda e: -e["now_cost"])

    summary["api_calls_this_run"] = client.calls
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    method_txt = ("Percentile curve: k-th lowest PPG gets the k-th lowest FPL price" if PRICE_METHOD == "percentile"
                  else "Price = a + b x PPG")
    lines_txt = ["$ELEVN pricing v0.1 - calibration report", "=" * 44, "",
                 f"{method_txt} (per position, fitted on matched Premier League players, 450+ min)",
                 "rho = rank correlation of PPG and FPL price; a, b, R2 = least-squares line for reference", ""]
    for pos, l in lines.items():
        rng = (f"  PPG {l['ppg_range'][0]}-{l['ppg_range'][1]} -> {l['price_range'][0]}-{l['price_range'][1]}M"
               if "ppg_range" in l else "")
        lines_txt.append(f"  {pos:4} rho={l['rho']:.2f}  a={l['a']:6.2f}  b={l['b']:5.3f}  R2={l['r2']:.2f}"
                         f"  n={l['n']}{rng}  [{l['source']}]")
    lines_txt += ["", f"FPL players matched: {len(matched)} of {len(fpl['elements'])}", "",
                  "Top 50 by FPL price (check these by hand)",
                  f"{'FPL':>5} {'ours':>5}  {'pos':4} {'PPG':>6}  player / team"]
    for fp, nm, team, pos, ours, src, ppg in comp[:50]:
        flag = " *default*" if src == "default" else ""
        lines_txt.append(f"{fp:5.1f} {ours:5.1f}  {pos:4} {ppg if ppg is not None else 0:6.2f}  {nm} / {team}{flag}")
    lines_txt += ["", "Unmatched FPL players, highest price first (first 40)"]
    for e in unmatched[:40]:
        team_name = next((t["name"] for t in fpl["teams"] if t["id"] == e["team"]), "?")
        lines_txt.append(f"  {e['now_cost'] / 10:4.1f}  {e['web_name']} ({e['first_name']} {e['second_name']}) - {team_name}")
    (out / "calibration_report.txt").write_text("\n".join(lines_txt), encoding="utf-8")

    print(f"\nCalibration ({PRICE_METHOD})")
    for pos, l in lines.items():
        print(f"  {pos:4} rho={l['rho']:.2f} a={l['a']:.2f} b={l['b']:.3f} R2={l['r2']:.2f} n={l['n']}  [{l['source']}]")
    print(f"FPL matched: {len(matched)}")
    for slug, s in summary["leagues"].items():
        print(f"\n{slug}: {s['players_priced']} players ({s['default_priced']} default-priced)")
        cost = s["squad_under_100M"]["cost"]
        verdict = "OK" if cost <= BUDGET else "WARNING: no 15-man squad fits in 100M - prices too high/compressed"
        print(f"  all-star 15 costs {s['allstar_squad_cost']}M; cheapest-loss squad: {cost}M  -> {verdict}")
        for n, t, p, pr, ppg in s["top10"][:5]:
            print(f"  {pr:5.1f}M  {p:4} {n} ({t})  PPG {ppg}")
    print(f"\nAPI calls this run: {client.calls}. Outputs in ./{out}/")


if __name__ == "__main__":
    main()
