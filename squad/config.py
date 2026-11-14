"""Loads config.toml (every game number) and .env (secrets) once for the whole backend."""

import os
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path=ROOT / ".env"):
    """Set KEY=value lines from .env without overriding the real environment."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def load_config(path=ROOT / "config.toml"):
    return tomllib.loads(Path(path).read_text(encoding="utf-8"))


CFG = load_config()
load_dotenv()


def launch_leagues(cfg=CFG):
    """{slug: api_football_id} for the leagues live at launch."""
    return {slug: lg["id"] for slug, lg in cfg["leagues"].items() if lg["phase"] == "launch"}
