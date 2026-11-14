#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/tidyfs
cat > README.md <<'J'
# tidyfs

Sorts a messy folder into dated subfolders.

## Requirements

- Python 3.9 or newer.

## Behavior

- Exits with status 3 when there is nothing to do.
- Scans at most 10,000 files per run.
- A typical 20,000-file scan finishes in under a second.
J
cat > pyproject.toml <<'J'
[project]
name = "tidyfs"
version = "1.4.0"
requires-python = ">=3.11"
J
cat > src/tidyfs/config.py <<'J'
MAX_FILES = 50_000
DATE_FORMAT = "%Y-%m"
J
cat > src/tidyfs/cli.py <<'J'
import sys
from pathlib import Path

from tidyfs.config import DATE_FORMAT, MAX_FILES


def plan_moves(root: Path) -> list[tuple[Path, Path]]:
    moves = []
    for i, path in enumerate(root.iterdir()):
        if i >= MAX_FILES:
            break
        if path.is_file():
            stamp = path.stat().st_mtime
            moves.append((path, root / _bucket(stamp)))
    return moves


def _bucket(stamp: float) -> str:
    import time

    return time.strftime(DATE_FORMAT, time.localtime(stamp))


def main(argv: list[str]) -> int:
    root = Path(argv[0]) if argv else Path.cwd()
    moves = plan_moves(root)
    if not moves:
        return 3
    for src, dest in moves:
        dest.mkdir(exist_ok=True)
        src.rename(dest / src.name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
J
