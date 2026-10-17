#!/usr/bin/env python3
"""Create, list, and index Architecture Decision Records (Nygard or MADR)."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ADR_FILENAME = re.compile(r"^(\d{4})-.+\.md$")
MAX_SEQUENCE = 9999
DEFAULT_ADR_DIR = Path("docs/adr")
CANDIDATE_DIRS = (
    Path("docs/adr"),
    Path("docs/adrs"),
    Path("doc/adr"),
    Path("docs/decisions"),
    Path("docs/architecture/decisions"),
)
STATUSES = ("Proposed", "Accepted", "Rejected", "Deprecated")
FORMATS = ("nygard", "madr")
INDEX_START = "<!-- adr-index:start -->"
INDEX_END = "<!-- adr-index:end -->"

STATUS_SECTION = re.compile(
    r"^## Status[ \t]*\n(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL
)
FRONTMATTER_STATUS = re.compile(r'^status:[ \t]*"?([^"\n]*)"?[ \t]*$', re.MULTILINE)


class AdrError(Exception):
    """A user-facing failure; main() prints it and exits 1."""


@dataclass(frozen=True)
class Adr:
    number: int
    path: Path
    title: str
    status: str


# --- repository and directory discovery ---


def git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", "-C", str(repo), *args], capture_output=True, text=True, check=False
        )
    except FileNotFoundError as exc:
        raise AdrError("git is not installed; pass --repo-root") from exc


def discover_repo_root(start: Path) -> Path:
    result = git(start, "rev-parse", "--show-toplevel")
    if result.returncode != 0:
        raise AdrError("not inside a Git repository; pass --repo-root")
    return Path(result.stdout.strip()).resolve()


def contained(repo_root: Path, path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(repo_root):
        raise AdrError(
            f"ADR directory {resolved} is outside the repository {repo_root}"
        )
    return resolved


def adr_files(directory: Path) -> list[tuple[int, Path]]:
    if not directory.is_dir():
        return []
    found = []
    for entry in directory.iterdir():
        match = ADR_FILENAME.match(entry.name)
        if match and entry.is_file():
            found.append((int(match.group(1)), entry))
    return sorted(found)


def choose_directory(repo_root: Path, requested: Path | None) -> Path:
    """Resolve --dir, then .adr-dir, then the one populated candidate, then the default."""
    if requested is not None:
        return contained(repo_root, repo_root / requested.expanduser())

    marker = repo_root / ".adr-dir"
    if marker.is_file():
        configured = marker.read_text(encoding="utf-8").strip()
        if not configured:
            raise AdrError(f"{marker} is empty")
        return contained(repo_root, repo_root / configured)

    populated = [
        candidate for candidate in CANDIDATE_DIRS if adr_files(repo_root / candidate)
    ]
    if len(populated) > 1:
        listed = ", ".join(candidate.as_posix() for candidate in populated)
        raise AdrError(
            f"ADRs found in several directories ({listed}); pass --dir to pick one"
        )
    return contained(
        repo_root, repo_root / (populated[0] if populated else DEFAULT_ADR_DIR)
    )


# --- reading and editing records ---


def frontmatter(text: str) -> str | None:
    if text.startswith("---\n"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[4 : end + 1]
    return None


def read_status(text: str) -> str:
    front = frontmatter(text)
    if front is not None:
        match = FRONTMATTER_STATUS.search(front)
        if match:
            return match.group(1).strip()
    section = STATUS_SECTION.search(text)
    if section:
        lines = [line.strip() for line in section.group(1).splitlines() if line.strip()]
        if lines:
            return lines[0]
    return "unknown"


def read_adr(number: int, path: Path) -> Adr:
    text = path.read_text(encoding="utf-8")
    title = next(
        (line[2:].strip() for line in text.splitlines() if line.startswith("# ")),
        path.stem,
    )
    return Adr(number, path, title, read_status(text))


def with_status(text: str, path: Path, nygard_status: str, madr_status: str) -> str:
    """Return text with its status replaced, in whichever style the record uses."""
    front = frontmatter(text)
    if front is not None and FRONTMATTER_STATUS.search(front):
        updated = FRONTMATTER_STATUS.sub(f'status: "{madr_status}"', front, count=1)
        return "---\n" + updated + text[4 + len(front) :]
    if STATUS_SECTION.search(text):
        return STATUS_SECTION.sub(
            lambda _: f"## Status\n\n{nygard_status}\n\n", text, count=1
        )
    raise AdrError(f"cannot find a status to update in {path}")


# --- templates ---


def nygard_template(title: str, date: str, status: str) -> str:
    return f"""# {title}

Date: {date}

## Status

{status}

## Context

<!-- What forces, constraints, and alternatives make this decision necessary? -->

## Decision

<!-- What is being decided? -->

## Consequences

<!-- What becomes easier, harder, or required as a result? -->
"""


def madr_template(title: str, date: str, status: str, supersedes_line: str) -> str:
    preamble = f"{supersedes_line}\n\n" if supersedes_line else ""
    return f"""---
status: "{status}"
date: {date}
---

# {title}

{preamble}## Context and Problem Statement

<!-- Describe the context and problem. Make the scope of the decision explicit. -->

## Considered Options

* <!-- option 1 -->
* <!-- option 2 -->

## Decision Outcome

Chosen option: "<!-- option -->", because <!-- justification -->.

### Consequences

* Good, because <!-- positive consequence -->
* Bad, because <!-- negative consequence -->
"""


# --- cross-branch collision check ---


def numbers_on_other_refs(
    repo_root: Path, directory: Path
) -> dict[int, list[str]] | None:
    """Map ADR numbers in `directory` on other local and remote branches; None outside Git."""
    refs = git(
        repo_root, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"
    )
    if refs.returncode != 0:
        return None
    current = git(repo_root, "symbolic-ref", "-q", "HEAD").stdout.strip()
    relative = directory.relative_to(repo_root).as_posix()

    found: dict[int, list[str]] = {}
    for ref in refs.stdout.split():
        if ref == current or ref.endswith("/HEAD"):
            continue
        listing = git(repo_root, "ls-tree", "--name-only", ref, f"{relative}/")
        short = ref.removeprefix("refs/heads/").removeprefix("refs/remotes/")
        for name in listing.stdout.splitlines():
            match = ADR_FILENAME.match(Path(name).name)
            if match:
                found.setdefault(int(match.group(1)), []).append(f"{short}:{name}")
    return found


# --- commands ---


def slugify(title: str) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_title = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_title)).strip("-")


def validate_title(raw: str) -> tuple[str, str]:
    title = raw.strip()
    if not title:
        raise AdrError("--title must not be empty")
    if len(title) > 160:
        raise AdrError("--title must be 160 characters or fewer")
    if any(ord(character) < 32 or ord(character) == 127 for character in title):
        raise AdrError("--title must not contain control characters or line breaks")
    slug = slugify(title)
    if not slug:
        raise AdrError("--title must produce a non-empty ASCII kebab-case slug")
    if len(slug) > 120:
        raise AdrError("--title produces a slug longer than 120 characters")
    return title, slug


def validate_date(raw: str | None) -> str:
    if raw is None:
        return dt.datetime.now().astimezone().date().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        raise AdrError("--date must be YYYY-MM-DD")
    try:
        dt.date.fromisoformat(raw)
    except ValueError as exc:
        raise AdrError(f"--date is not a real date: {raw}") from exc
    return raw


def find_by_number(existing: list[tuple[int, Path]], number: int) -> Path:
    matches = [path for found, path in existing if found == number]
    if not matches:
        raise AdrError(
            f"no ADR {number:04d} in {existing[0][1].parent if existing else 'the ADR directory'}"
        )
    if len(matches) > 1:
        raise AdrError(
            f"several files claim ADR {number:04d}: {', '.join(path.name for path in matches)}"
        )
    return matches[0]


def create(args: argparse.Namespace, repo_root: Path, directory: Path) -> int:
    title, slug = validate_title(args.title)
    date = validate_date(args.date)
    status = args.status or "Proposed"
    existing = adr_files(directory)
    used = {number for number, _ in existing}

    if args.number is not None:
        if not 1 <= args.number <= MAX_SEQUENCE:
            raise AdrError(f"--number must be between 1 and {MAX_SEQUENCE}")
        if args.number in used:
            raise AdrError(f"ADR {args.number:04d} already exists in {directory}")
        number = args.number
    else:
        number = max(used, default=0) + 1
        if number > MAX_SEQUENCE:
            raise AdrError(f"ADR sequence is exhausted at {MAX_SEQUENCE}")

    output = directory / f"{number:04d}-{slug}.md"

    old_path: Path | None = None
    old_update: str | None = None
    supersedes_line = ""
    if args.supersedes is not None:
        old_path = find_by_number(existing, args.supersedes)
        old_label = f"{args.supersedes:04d}"
        if args.format == "madr":
            supersedes_line = f"Supersedes [ADR-{old_label}]({old_path.name})."
        else:
            status = f"{status}; supersedes [{old_label}]({old_path.name})"
        if (args.status or "Proposed") == "Accepted":
            old_update = with_status(
                old_path.read_text(encoding="utf-8"),
                old_path,
                f"Superseded by [{number:04d}]({output.name})",
                f"superseded by ADR-{number:04d}",
            )

    if args.format == "madr":
        content = madr_template(
            title, date, (args.status or "Proposed").lower(), supersedes_line
        )
    else:
        content = nygard_template(title, date, status)

    collisions = numbers_on_other_refs(repo_root, directory)
    if collisions is None:
        print(
            "note: skipped the cross-branch number check (not a Git repository)",
            file=sys.stderr,
        )
    elif number in collisions:
        print(
            f"warning: ADR {number:04d} is already used on another branch: {', '.join(collisions[number])}. "
            "Pass --number to pick a free one.",
            file=sys.stderr,
        )

    if args.dry_run:
        print(f"would create {output}\n")
        print(content, end="")
        if old_path and old_update is not None:
            print(f"\nwould set {old_path.name} status to: Superseded by {number:04d}")
        return 0

    directory.mkdir(parents=True, exist_ok=True)
    try:
        with output.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
    except FileExistsError as exc:
        raise AdrError(f"refusing to overwrite existing ADR: {output}") from exc

    if old_path and old_update is not None:
        try:
            old_path.write_text(old_update, encoding="utf-8", newline="\n")
        except OSError as exc:
            raise AdrError(
                f"created {output} but could not update {old_path}: {exc}"
            ) from exc
    elif old_path:
        print(
            f"note: {old_path.name} keeps its status until this ADR is accepted; "
            f"then set it to Superseded by [{number:04d}]({output.name})",
            file=sys.stderr,
        )

    print(output)
    return 0


def index_block(adrs: list[Adr]) -> str:
    rows = [
        f"| [{adr.number:04d}]({adr.path.name}) | {adr.title.replace('|', chr(92) + '|')} "
        f"| {adr.status.replace('|', chr(92) + '|')} |"
        for adr in adrs
    ]
    table = "\n".join(["| ADR | Title | Status |", "| --- | --- | --- |", *rows])
    return f"{INDEX_START}\n{table}\n{INDEX_END}"


def with_index(readme: str | None, block: str) -> str:
    if readme is None:
        return f"# Architecture Decision Records\n\n{block}\n"
    start, end = readme.find(INDEX_START), readme.find(INDEX_END)
    if start != -1 and end > start:
        return readme[:start] + block + readme[end + len(INDEX_END) :]
    return readme.rstrip("\n") + f"\n\n## Index\n\n{block}\n"


def list_adrs(args: argparse.Namespace, directory: Path) -> int:
    adrs = [read_adr(number, path) for number, path in adr_files(directory)]
    if not adrs:
        print(f"no ADRs in {directory}", file=sys.stderr)
    for adr in adrs:
        print(f"{adr.number:04d}  {adr.status:<12}  {adr.title}  ({adr.path.name})")

    if args.write_index:
        readme = directory / "README.md"
        current = readme.read_text(encoding="utf-8") if readme.is_file() else None
        updated = with_index(current, index_block(adrs))
        if args.dry_run:
            print(f"\nwould write {readme}\n")
            print(updated, end="")
        elif updated != current:
            directory.mkdir(parents=True, exist_ok=True)
            readme.write_text(updated, encoding="utf-8", newline="\n")
            print(f"wrote {readme}", file=sys.stderr)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create the next non-overwriting ADR, or list existing ones. The directory is --dir, "
            f"else .adr-dir, else the one existing ADR directory, else {DEFAULT_ADR_DIR}."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--title", help="create an ADR with this title; also sets the filename slug"
    )
    mode.add_argument(
        "--list",
        action="store_true",
        help="list ADRs with their number, status, and title",
    )

    parser.add_argument(
        "--repo-root",
        type=Path,
        help="repository root (default: git rev-parse --show-toplevel)",
    )
    parser.add_argument(
        "--dir", type=Path, help="ADR directory, relative to the repository root"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print what would be written without writing",
    )

    create_options = parser.add_argument_group("create options")
    create_options.add_argument(
        "--format",
        choices=FORMATS,
        default=None,
        help="record format (default: nygard)",
    )
    create_options.add_argument(
        "--status", choices=STATUSES, help="initial status (default: Proposed)"
    )
    create_options.add_argument(
        "--date", help="decision date as YYYY-MM-DD (default: today)"
    )
    create_options.add_argument(
        "--number", type=int, help="use this number instead of the next free one"
    )
    create_options.add_argument(
        "--supersedes",
        type=int,
        metavar="NNNN",
        help="link to the ADR this replaces; with --status Accepted, also mark it superseded",
    )

    list_options = parser.add_argument_group("list options")
    list_options.add_argument(
        "--write-index",
        action="store_true",
        help="write an index table to <dir>/README.md",
    )

    args = parser.parse_args()
    create_only = ("format", "status", "date", "number", "supersedes")
    if args.list and any(getattr(args, name) is not None for name in create_only):
        parser.error(
            "--format, --status, --date, --number, and --supersedes only apply with --title"
        )
    if args.title is not None and args.write_index:
        parser.error("--write-index only applies with --list")
    args.format = args.format or "nygard"
    return args


def main() -> int:
    args = parse_args()
    try:
        if args.repo_root is not None:
            repo_root = args.repo_root.expanduser().resolve()
            if not repo_root.is_dir():
                raise AdrError(f"--repo-root is not a directory: {repo_root}")
        else:
            repo_root = discover_repo_root(Path.cwd())
        directory = choose_directory(repo_root, args.dir)
        return (
            list_adrs(args, directory)
            if args.list
            else create(args, repo_root, directory)
        )
    except (AdrError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
