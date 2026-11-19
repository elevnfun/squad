#!/bin/sh
# Throwaway Postgres 16 on localhost:5433 for tests in this container (trust auth, role root).
PG=/usr/lib/postgresql/16/bin; DATA=/var/tmp/pgdata-squad
if [ ! -d "$DATA" ]; then mkdir -p "$DATA"; chown postgres "$DATA"; su postgres -c "$PG/initdb -D $DATA --auth=trust -E UTF8 --locale=C >/dev/null"; fi
su postgres -c "$PG/pg_ctl -D $DATA -o '-p 5433 -k /tmp -c listen_addresses=localhost' -l $DATA/server.log -w start" >/dev/null 2>&1 || true
su postgres -c "$PG/psql -h localhost -p 5433 -d postgres -tAc \"SELECT 1 FROM pg_roles WHERE rolname='root'\"" | grep -q 1 || su postgres -c "$PG/createuser -h localhost -p 5433 -s root"
psql -h localhost -p 5433 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='squad'" | grep -q 1 || createdb -h localhost -p 5433 squad
psql -h localhost -p 5433 -d postgres -tAc "select 'postgres ok on 5433'"
