"""The API lock (API_GATE_SECRET in .env) stays off under test, so a machine with the real key still
passes. config.py never overrides a variable that is already set, and this runs before it is imported."""
import os

os.environ["API_GATE_SECRET"] = ""

import psycopg
import pytest

from squad.db import init_schema

URL = "postgresql://localhost:5433/{}"


@pytest.fixture
def conn():
    """A fresh throwaway database (squad_test) with the schema loaded; the test skips if Postgres is not running
    (scripts/db-container.sh)."""
    try:
        admin = psycopg.connect(URL.format("postgres"), autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local Postgres not running (scripts/db-container.sh)")
    admin.execute("DROP DATABASE IF EXISTS squad_test")
    admin.execute("CREATE DATABASE squad_test")
    c = psycopg.connect(URL.format("squad_test"))
    init_schema(c)
    yield c
    c.close()
    admin.execute("DROP DATABASE squad_test")
    admin.close()
