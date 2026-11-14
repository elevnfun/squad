"""Postgres connection and schema setup. DATABASE_URL comes from .env (see .env.example)."""

import os

import psycopg

from .config import CFG, ROOT

DEFAULT_URL = "postgresql://localhost:5433/squad"


def connect(url=None):
    return psycopg.connect(url or os.environ.get("DATABASE_URL", DEFAULT_URL), autocommit=False)


def init_schema(conn):
    conn.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
    for slug, lg in CFG["leagues"].items():
        conn.execute("""INSERT INTO leagues (id, slug, phase) VALUES (%s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, phase = EXCLUDED.phase""",
                     (lg["id"], slug, lg["phase"]))
    conn.commit()
