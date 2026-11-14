"""The API lock (API_GATE_SECRET in .env) stays off under test, so a machine with the real key still
passes. config.py never overrides a variable that is already set, and this runs before it is imported."""
import os

os.environ["API_GATE_SECRET"] = ""
