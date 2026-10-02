"""Media tests use isolated scratch, just as the Host does."""
import pytest


@pytest.fixture(autouse=True)
def media_scratch(tmp_path, monkeypatch):
    monkeypatch.setenv("MPT_SCRATCH_ROOT", str(tmp_path / "scratch"))
