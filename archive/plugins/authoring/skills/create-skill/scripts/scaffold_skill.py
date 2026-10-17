#!/usr/bin/env python3
"""Safely scaffold a minimal Claude Code skill directory using only Python's stdlib."""

from __future__ import annotations

import argparse
import errno
import json
import re
import sys
from pathlib import Path

EXIT_UNSAFE = 3
EXIT_INVALID = 4


def valid_name(name: str) -> bool:
    """Apply the portable ASCII name check also used by validate_skill.py."""
    return bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)) and len(name) <= 64


def yaml_quote(value: str) -> str:
    """Return a JSON-style double-quoted scalar, valid in YAML frontmatter."""
    return json.dumps(value, ensure_ascii=False)


def emit(skill_dir: str, name: str, created: list[str], as_json: bool) -> None:
    payload = {"created": created, "name": name, "skill_dir": skill_dir}
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    else:
        print(f"Created skill scaffold: {skill_dir}")
        for path in created:
            print(f"  created {path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a minimal Claude Code skill (SKILL.md only) without overwriting existing files."
    )
    parser.add_argument("skill_dir", type=Path, help="New or empty target directory")
    parser.add_argument("--name", help="Skill name (defaults to the target directory name)")
    parser.add_argument("--description", required=True, help="What the skill does and when it applies")
    parser.add_argument("--json", action="store_true", help="Write a JSON success record to stdout")
    args = parser.parse_args()

    target = args.skill_dir.expanduser()
    name = args.name or target.name
    if not valid_name(name):
        print(
            "error: --name must be 1–64 ASCII lowercase letters, numbers, or hyphens "
            "with no leading, trailing, or consecutive hyphens",
            file=sys.stderr,
        )
        return EXIT_INVALID
    if target.name != name:
        print("error: target directory name must match --name", file=sys.stderr)
        return EXIT_INVALID
    if not args.description.strip() or len(args.description) > 1024:
        print("error: --description must be 1–1024 characters and not all whitespace", file=sys.stderr)
        return EXIT_INVALID
    if target.exists() and not target.is_dir():
        print(f"error: target is not a directory: {target}", file=sys.stderr)
        return EXIT_UNSAFE
    if target.exists() and any(target.iterdir()):
        print(f"error: refusing to write into non-empty directory: {target}", file=sys.stderr)
        return EXIT_UNSAFE

    skill_md = f"""---
name: {name}
description: {yaml_quote(args.description)}
---

# {name.replace('-', ' ').title()}

## Workflow

Replace this authoring note with the ordered, task-specific procedure. Include only non-obvious decisions, safe defaults, failure handling, and verification that the agent needs after activation.
"""
    missing_directories: list[Path] = []
    cursor = target
    while not cursor.exists():
        missing_directories.append(cursor)
        cursor = cursor.parent

    skill_file = target / "SKILL.md"
    skill_temporary = target / ".SKILL.md.tmp"
    generated_files = (skill_temporary, skill_file)
    try:
        target.mkdir(parents=True, exist_ok=True)
        with skill_temporary.open("x", encoding="utf-8") as output:
            output.write(skill_md)
        skill_temporary.replace(skill_file)
    except OSError as error:
        cleanup_errors: list[str] = []
        for path in generated_files:
            try:
                path.unlink(missing_ok=True)
            except OSError as cleanup_error:
                cleanup_errors.append(f"{path}: {cleanup_error}")
        for path in missing_directories:
            try:
                path.rmdir()
            except OSError as cleanup_error:
                if cleanup_error.errno != errno.ENOENT:
                    cleanup_errors.append(f"{path}: {cleanup_error}")
        print(f"error: could not create scaffold: {error}", file=sys.stderr)
        for cleanup_error in cleanup_errors:
            print(f"error: cleanup failed: {cleanup_error}", file=sys.stderr)
        return 1

    emit(str(target), name, ["SKILL.md"], args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
