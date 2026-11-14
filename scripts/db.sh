#!/bin/sh
# Local Postgres for development, kept inside the project (.pgdata, git-ignored), port 5433.
# Nothing is registered to start at login.  Usage: scripts/db.sh start | stop | status | psql
set -e
cd "$(dirname "$0")/.."
# Postgres on macOS refuses to start without a valid locale ("postmaster became multithreaded")
export LC_ALL=C LANG=C
PG=/opt/homebrew/opt/postgresql@17/bin
DATA=.pgdata
PORT=5433

case "$1" in
  start)
    if [ ! -d "$DATA" ]; then
      "$PG/initdb" -D "$DATA" -U "$(whoami)" --auth=trust -E UTF8 --locale=C >/dev/null
      echo "created $DATA"
    fi
    "$PG/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start >/dev/null
    "$PG/psql" -h localhost -p $PORT -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='squad'" | grep -q 1 \
      || "$PG/createdb" -h localhost -p $PORT squad
    echo "postgres running on localhost:$PORT (database: squad)"
    ;;
  stop)   "$PG/pg_ctl" -D "$DATA" -w stop ;;
  status) "$PG/pg_ctl" -D "$DATA" status ;;
  psql)   shift; exec "$PG/psql" -h localhost -p $PORT squad "$@" ;;
  *)      echo "usage: scripts/db.sh start | stop | status | psql"; exit 1 ;;
esac
