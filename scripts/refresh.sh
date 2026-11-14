#!/usr/bin/env bash
# Keep the fixture list (kickoff changes, postponements) and team news current: every 6 hours,
# 6 API calls a run. Live scores and the gameweek clock run separately (squad.ingest live, squad.game run).
set -u
cd "$(dirname "$0")/.."
while true; do
  echo "$(date '+%F %T') refreshing fixtures and team news"
  uv run python -m squad.ingest fixtures || echo "fixtures refresh failed"
  uv run python -m squad.ingest injuries || echo "injuries refresh failed"
  sleep 21600
done
