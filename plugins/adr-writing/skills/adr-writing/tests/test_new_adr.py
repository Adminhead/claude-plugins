"""End-to-end tests for scripts/new_adr.py, run against throwaway Git repositories."""

from __future__ import annotations

import datetime as dt
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "new_adr.py"
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        env=GIT_ENV,
    ).stdout


def run(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        env=GIT_ENV,
        check=False,
    )


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "commit", "-q", "--allow-empty", "-m", "root")
    return tmp_path


# --- creation, numbering, and templates ---


def test_creates_sequential_nygard_records_with_todays_date(repo: Path) -> None:
    first = run(repo, "--title", "Use Postgres")
    second = run(repo, "--title", "Adopt Go")

    assert first.returncode == 0, first.stderr
    assert Path(first.stdout.strip()) == repo / "docs/adr/0001-use-postgres.md"
    assert Path(second.stdout.strip()).name == "0002-adopt-go.md"
    text = (repo / "docs/adr/0001-use-postgres.md").read_text()
    assert text.startswith(
        f"# Use Postgres\n\nDate: {dt.datetime.now().astimezone().date().isoformat()}\n\n## Status\n\nProposed\n"
    )
    assert (
        text.index("## Context")
        < text.index("## Decision")
        < text.index("## Consequences")
    )


def test_explicit_date_and_status(repo: Path) -> None:
    result = run(repo, "--title", "X", "--date", "2025-01-31", "--status", "Accepted")

    text = Path(result.stdout.strip()).read_text()
    assert "Date: 2025-01-31" in text
    assert "## Status\n\nAccepted\n" in text


@pytest.mark.parametrize("date", ["2025-02-30", "31-01-2025", "2025-1-5"])
def test_rejects_invalid_dates(repo: Path, date: str) -> None:
    result = run(repo, "--title", "X", "--date", date)

    assert result.returncode == 1
    assert "--date" in result.stderr


def test_madr_format_uses_frontmatter(repo: Path) -> None:
    result = run(
        repo, "--title", "Pick a queue", "--format", "madr", "--date", "2025-03-01"
    )

    text = Path(result.stdout.strip()).read_text()
    assert text.startswith(
        '---\nstatus: "proposed"\ndate: 2025-03-01\n---\n\n# Pick a queue\n'
    )
    assert "## Considered Options" in text


@pytest.mark.parametrize("title", ["", "   ", "!!!", "a\nb", "x" * 161])
def test_rejects_bad_titles(repo: Path, title: str) -> None:
    assert run(repo, "--title", title).returncode == 1


def test_never_overwrites_and_keeps_gaps(repo: Path) -> None:
    write(repo / "docs/adr/0007-old.md", "# Old\n")

    result = run(repo, "--title", "Next")

    assert Path(result.stdout.strip()).name == "0008-next.md"


def test_explicit_number(repo: Path) -> None:
    write(repo / "docs/adr/0001-a.md", "# A\n")

    taken = run(repo, "--title", "B", "--number", "1")
    free = run(repo, "--title", "B", "--number", "42")

    assert taken.returncode == 1
    assert "already exists" in taken.stderr
    assert Path(free.stdout.strip()).name == "0042-b.md"


# --- directory selection ---


def test_uses_the_single_existing_adr_directory(repo: Path) -> None:
    write(repo / "docs/adrs/0001-a.md", "# A\n")

    result = run(repo, "--title", "B")

    assert Path(result.stdout.strip()) == repo / "docs/adrs/0002-b.md"
    assert not (repo / "docs/adr").exists()


def test_stops_when_several_directories_hold_adrs(repo: Path) -> None:
    write(repo / "docs/adrs/0001-a.md", "# A\n")
    write(repo / "docs/decisions/0001-b.md", "# B\n")

    result = run(repo, "--title", "C")

    assert result.returncode == 1
    assert "docs/adrs" in result.stderr and "docs/decisions" in result.stderr


def test_honors_adr_dir_file_and_dir_flag_overrides_it(repo: Path) -> None:
    write(repo / ".adr-dir", "architecture/records\n")

    from_marker = run(repo, "--title", "A")
    from_flag = run(repo, "--title", "B", "--dir", "elsewhere")

    assert Path(from_marker.stdout.strip()) == repo / "architecture/records/0001-a.md"
    assert Path(from_flag.stdout.strip()) == repo / "elsewhere/0001-b.md"


@pytest.mark.parametrize("target", ["../escape", "/etc"])
def test_refuses_directories_outside_the_repo(repo: Path, target: str) -> None:
    result = run(repo, "--title", "X", "--dir", target)

    assert result.returncode == 1
    assert "outside the repository" in result.stderr


def test_discovers_root_from_a_subdirectory(repo: Path) -> None:
    nested = repo / "src/deep"
    nested.mkdir(parents=True)

    result = run(nested, "--title", "X")

    assert Path(result.stdout.strip()) == repo / "docs/adr/0001-x.md"


def test_requires_repo_root_outside_git(tmp_path: Path) -> None:
    outside = tmp_path / "plain"
    outside.mkdir()
    probe = subprocess.run(
        ["git", "-C", str(outside), "rev-parse"], capture_output=True, check=False
    )
    if probe.returncode == 0:
        pytest.skip("temp directory sits inside a Git repository")

    missing = run(outside, "--title", "X")
    explicit = run(outside, "--title", "X", "--repo-root", str(outside))

    assert missing.returncode == 1
    assert "--repo-root" in missing.stderr
    assert explicit.returncode == 0
    assert "skipped the cross-branch number check" in explicit.stderr


# --- supersession ---


def test_proposed_superseder_links_old_but_leaves_its_status(repo: Path) -> None:
    old = write(
        repo / "docs/adr/0001-old.md",
        "# Old\n\n## Status\n\nAccepted\n\n## Context\n\nc\n",
    )

    result = run(repo, "--title", "New", "--supersedes", "1")

    new_text = Path(result.stdout.strip()).read_text()
    assert "Proposed; supersedes [0001](0001-old.md)" in new_text
    assert "## Status\n\nAccepted\n" in old.read_text()
    assert "keeps its status" in result.stderr


def test_accepted_superseder_marks_old_superseded(repo: Path) -> None:
    old = write(
        repo / "docs/adr/0001-old.md",
        "# Old\n\nDate: 2020-01-01\n\n## Status\n\nAccepted\n\n## Context\n\nc\n",
    )

    run(repo, "--title", "New", "--supersedes", "1", "--status", "Accepted")

    old_text = old.read_text()
    assert (
        "## Status\n\nSuperseded by [0002](0002-new.md)\n\n## Context\n\nc\n"
        in old_text
    )
    assert "Date: 2020-01-01" in old_text


def test_supersedes_madr_record(repo: Path) -> None:
    old = write(
        repo / "docs/adr/0001-old.md",
        '---\nstatus: "accepted"\ndate: 2020-01-01\n---\n\n# Old\n',
    )

    result = run(
        repo,
        "--title",
        "New",
        "--format",
        "madr",
        "--supersedes",
        "1",
        "--status",
        "Accepted",
    )

    assert 'status: "superseded by ADR-0002"' in old.read_text()
    assert (
        "Supersedes [ADR-0001](0001-old.md)." in Path(result.stdout.strip()).read_text()
    )


def test_supersedes_requires_an_existing_record(repo: Path) -> None:
    result = run(repo, "--title", "New", "--supersedes", "9")

    assert result.returncode == 1
    assert not (repo / "docs/adr").exists()


def test_refuses_to_supersede_a_record_without_a_status(repo: Path) -> None:
    write(repo / "docs/adr/0001-old.md", "# Old\n\nNo status here.\n")

    result = run(repo, "--title", "New", "--supersedes", "1", "--status", "Accepted")

    assert result.returncode == 1
    assert not (repo / "docs/adr/0002-new.md").exists()


# --- dry run ---


def test_dry_run_writes_nothing(repo: Path) -> None:
    old = write(repo / "docs/adr/0001-old.md", "# Old\n\n## Status\n\nAccepted\n")
    before = old.read_text()

    result = run(
        repo, "--title", "New", "--supersedes", "1", "--status", "Accepted", "--dry-run"
    )

    assert result.returncode == 0
    assert "would create" in result.stdout and "0002-new.md" in result.stdout
    assert "would set 0001-old.md status" in result.stdout
    assert not (repo / "docs/adr/0002-new.md").exists()
    assert old.read_text() == before


# --- cross-branch collisions ---


def test_warns_when_number_is_used_on_another_branch(repo: Path) -> None:
    git(repo, "switch", "-q", "-c", "feature")
    write(repo / "docs/adr/0001-feature-choice.md", "# Feature\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "adr")
    git(repo, "switch", "-q", "main")

    result = run(repo, "--title", "Main choice")

    assert result.returncode == 0
    assert "0001 is already used on another branch" in result.stderr
    assert "feature:docs/adr/0001-feature-choice.md" in result.stderr


def test_no_warning_for_numbers_on_the_current_branch(repo: Path) -> None:
    write(repo / "docs/adr/0001-a.md", "# A\n")
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "adr")

    result = run(repo, "--title", "B")

    assert "warning" not in result.stderr


# --- listing and index ---


def test_lists_numbers_statuses_and_titles(repo: Path) -> None:
    write(repo / "docs/adr/0001-a.md", "# Alpha\n\n## Status\n\nAccepted\n")
    write(repo / "docs/adr/0002-b.md", '---\nstatus: "proposed"\n---\n\n# Beta\n')

    result = run(repo, "--list")

    lines = result.stdout.splitlines()
    assert lines[0].startswith("0001  Accepted") and "Alpha" in lines[0]
    assert lines[1].startswith("0002  proposed") and "Beta" in lines[1]


def test_write_index_creates_then_updates_between_markers(repo: Path) -> None:
    write(repo / "docs/adr/0001-a.md", "# Alpha | pipes\n\n## Status\n\nAccepted\n")
    readme = repo / "docs/adr/README.md"

    run(repo, "--list", "--write-index")
    readme.write_text(readme.read_text() + "\nHand-written notes.\n")
    write(repo / "docs/adr/0002-b.md", "# Beta\n\n## Status\n\nProposed\n")
    run(repo, "--list", "--write-index")

    text = readme.read_text()
    assert text.startswith("# Architecture Decision Records\n")
    assert "| [0001](0001-a.md) | Alpha \\| pipes | Accepted |" in text
    assert "| [0002](0002-b.md) | Beta | Proposed |" in text
    assert text.count("<!-- adr-index:start -->") == 1
    assert "Hand-written notes." in text


def test_write_index_appends_to_readme_without_markers(repo: Path) -> None:
    write(repo / "docs/adr/0001-a.md", "# Alpha\n\n## Status\n\nAccepted\n")
    readme = write(repo / "docs/adr/README.md", "# Decisions\n\nIntro.\n")

    run(repo, "--list", "--write-index")

    assert readme.read_text().startswith(
        "# Decisions\n\nIntro.\n\n## Index\n\n<!-- adr-index:start -->"
    )


def test_rejects_mixed_modes(repo: Path) -> None:
    assert run(repo, "--list", "--status", "Accepted").returncode == 2
    assert run(repo, "--title", "X", "--write-index").returncode == 2
    assert run(repo).returncode == 2
