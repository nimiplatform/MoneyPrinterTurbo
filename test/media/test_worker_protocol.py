import json
import os
import subprocess
from pathlib import Path


def test_unknown_operation_returns_utf8_failure_and_nonzero_exit(tmp_path):
    env = {**os.environ, "MPT_SCRATCH_ROOT": str(tmp_path), "IMAGEIO_FFMPEG_EXE": "not-needed", "MPT_FFPROBE": "not-needed"}
    request = json.dumps({"operation": "unsupported", "input": {"text": "中文"}}, ensure_ascii=False).encode("utf-8")
    result = subprocess.run([os.sys.executable, "-X", "utf8", "-m", "app.media_worker"], input=request, capture_output=True, env=env)
    assert result.returncode == 1
    assert json.loads(result.stdout.decode("utf-8")) == {"ok": False, "error": "Unknown media operation"}
