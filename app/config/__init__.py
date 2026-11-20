"""Deterministic worker package; diagnostics use Loguru stderr."""
from app.utils.logging_utils import force_utf8_console

force_utf8_console()
