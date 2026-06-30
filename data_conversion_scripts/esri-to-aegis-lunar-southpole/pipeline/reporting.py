"""Output capture + subprocess running + the conversion report.

All console output (this process's ``print``/``tee`` AND the in-process Box step's prints)
is captured by redirecting ``sys.stdout``/``sys.stderr`` through a tee, so the
``Data/conversion_report.md`` written at the end is a complete record of the run. Subprocess
output is streamed line-by-line through the same tee by :func:`run`.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import config

# Captured console log for the conversion report (filled via the tee'd streams).
RUN_LOG: list[str] = []


class _Tee:
    """File-like wrapper: write through to a real stream AND capture completed lines.

    Carriage-return progress (tqdm) is collapsed to the final state of each line so the
    captured report isn't flooded with intermediate progress frames.
    """

    def __init__(self, real):
        self._real = real
        self._buf = ""

    def write(self, s: str) -> int:
        self._real.write(s)
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if "\r" in line:  # collapse tqdm-style overwrites to the last frame
                line = line.rsplit("\r", 1)[-1]
            RUN_LOG.append(line)
        return len(s)

    def flush(self) -> None:
        self._real.flush()

    def isatty(self) -> bool:
        return getattr(self._real, "isatty", lambda: False)()


def install_capture() -> None:
    """Redirect stdout/stderr through a tee so the whole run is captured for the report."""
    sys.stdout = _Tee(sys.stdout)
    sys.stderr = _Tee(sys.stderr)


def tee(*args: object, **kwargs: object) -> None:
    """print(), but flushed. stdout/stderr are already tee'd into the run log."""
    kwargs.setdefault("flush", True)
    print(*args, **kwargs)  # type: ignore[arg-type]


def run(cmd: list[str | Path], *, check: bool = True) -> int:
    """Run a command, streaming its output live to the console AND the run log."""
    printable = " ".join(str(a) for a in cmd)
    tee(f"\n$ {printable}")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.Popen(
        [str(a) for a in cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        tee(line.rstrip("\n"))
    proc.wait()
    if check and proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)
    return proc.returncode


def banner(title: str) -> None:
    width = 70
    tee("\n" + "=" * width)
    tee(f"  {title}")
    tee("=" * width)


def write_conversion_report(
    out_dir: Path, args: argparse.Namespace, steps_timing: list[tuple[str, float, str]]
) -> Path | None:
    """Write the captured run log + a step-timing summary to Data/conversion_report.md."""
    data_dir = out_dir / config.OUT_DATA_DIRNAME
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None
    report = data_dir / "conversion_report.md"
    when = datetime.now(tz=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    lines = [
        f"# AEGIS conversion report — mission {args.mission_id}",
        "",
        f"- **Mission name:** {args.mission_name or '(unset)'}",
        f"- **AEGIS URL:** {args.aegis_url}",
        f"- **Generated:** {when}",
        f"- **Output root:** `{out_dir}`",
        "",
        "## Steps",
        "",
        "| # | step | status | duration |",
        "| - | ---- | ------ | -------- |",
    ]
    for i, (name, secs, status) in enumerate(steps_timing):
        lines.append(f"| {i + 1} | {name} | {status} | {secs:.1f}s |")
    lines += ["", "## Full log", "", "```", *RUN_LOG, "```", ""]
    report.write_text("\n".join(lines), encoding="utf-8")
    return report
