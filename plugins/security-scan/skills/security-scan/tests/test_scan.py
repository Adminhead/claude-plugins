"""Tests for the audit scan scripts, using recorded scanner output and throwaway repos."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(SCRIPTS))

import normalize as nz
import scan
import scanners

FAKE_KEY = "AKIAZZZZTESTFAKE1234"
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}
Handler = Callable[[list[str]], subprocess.CompletedProcess[str]]


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        env=GIT_ENV,
    ).stdout


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def done(
    stdout: str = "", code: int = 0, stderr: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], code, stdout, stderr)


def option(cmd: list[str], flag: str) -> Path:
    return Path(cmd[cmd.index(flag) + 1])


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A repo whose feature branch adds a secret, a shell call, and an old dependency."""
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "commit.gpgsign", "false")
    write(root / "requirements.txt", "requests==2.31.0\n")
    write(root / "gosvc" / "go.mod", "module example.com/gosvc\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "base")
    git(root, "checkout", "-q", "-b", "feature")
    write(root / "config.py", f'AWS_ACCESS_KEY_ID = "{FAKE_KEY}"\n')
    handler = "import subprocess\n\n\ndef handle(user_input):\n    x = 1\n"
    write(
        root / "handler.py",
        handler + "    return subprocess.call(user_input, shell=True)\n",
    )
    write(root / "requirements.txt", "requests==2.19.0\n")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "feature")
    write(root / "settings_local.py", 'TOKEN = "redacted-by-gitleaks"\n')
    write(root / "crate" / "Cargo.toml", "[package]\n")
    return root


def default_handlers() -> dict[tuple[str, str], Handler]:
    def gitleaks_git(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        option(cmd, "--report-path").write_text(fixture("gitleaks_git.json"))
        return done()

    def gitleaks_dir(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        report = fixture("gitleaks_dir.json").replace("__TREE__", cmd[2])
        option(cmd, "--report-path").write_text(report)
        return done()

    def trivy_fs(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        option(cmd, "--output").write_text(fixture("trivy.json"))
        return done()

    return {
        ("gitleaks", "version"): lambda _: done("8.30.1\n"),
        ("gitleaks", "git"): gitleaks_git,
        ("gitleaks", "dir"): gitleaks_dir,
        ("semgrep", "--version"): lambda _: done("1.177.0\n"),
        ("semgrep", "scan"): lambda _: done(fixture("semgrep.json")),
        ("trivy", "--version"): lambda _: done("Version: 0.74.0\n"),
        ("trivy", "fs"): trivy_fs,
        ("go", "run"): lambda _: done(fixture("govulncheck.json")),
        ("uvx", "--version"): lambda _: done("pip-audit 2.10.1\n"),
        ("uvx", "pip-audit"): lambda _: done(fixture("pip_audit.json"), code=1),
    }


@pytest.fixture
def handlers(monkeypatch: pytest.MonkeyPatch) -> dict[tuple[str, str], Handler]:
    """Replace scanner subprocesses with fixture replies; git stays real."""
    table = default_handlers()

    def fake_run(
        cmd: list[str], cwd: Path, timeout: float, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str]:
        del cwd, timeout, env
        key = (cmd[0], cmd[1].split("@")[0])
        if key == ("uvx", "pip-audit") and "--version" in cmd:
            key = ("uvx", "--version")
        if key not in table:
            raise AssertionError(f"unexpected command {cmd}")
        return table[key](cmd)

    monkeypatch.setattr(scanners, "run", fake_run)
    monkeypatch.setattr(scanners.shutil, "which", lambda tool: f"/usr/bin/{tool}")
    return table


def run_main(
    repo: Path, capsys: pytest.CaptureFixture[str], *args: str
) -> tuple[str, dict]:
    assert scan.main(["--repo-root", str(repo), *args]) == 0
    stdout = capsys.readouterr().out
    json_path = Path(stdout.strip().splitlines()[-1].split(": ", 1)[1])
    data = json.loads(json_path.read_text())
    json_path.unlink()
    return stdout, data


# --- normalization ---


def test_trivy_findings_are_normalized_with_covered_targets() -> None:
    findings, covered = nz.parse_trivy(
        json.loads(fixture("trivy.json")), {"requirements.txt"}
    )
    requests = next(f for f in findings if f.package == "requests")
    assert requests.to_json() == {
        "tool": "trivy",
        "category": "dependency",
        "severity": "high",
        "location": "requests@2.19.0 (requirements.txt)",
        "title": "CVE-2018-18074: python-requests: Redirect from HTTPS to HTTP does not "
        "remove Authorization header",
        "changed_on_branch": True,
        "fixed_version": "2.20.0",
        "ecosystem": "pypi",
        "package": "requests",
        "version": "2.19.0",
        "vuln_ids": ["CVE-2018-18074", "GHSA-x84v-xcm2-53pg"],
    }
    assert ("pypi", "tools/requirements.txt") in covered
    assert next(f for f in findings if f.package == "lodash").changed_on_branch is False


def test_govulncheck_keeps_deepest_reachability_per_advisory() -> None:
    findings, version = nz.parse_govulncheck(
        fixture("govulncheck.json"), "gosvc", set()
    )
    by_id = {f.vuln_ids[-1]: f for f in findings}
    assert version == "v1.8.0"
    assert by_id["GO-2022-1059"].reachability == "called at gosvc/main.go:10"
    assert by_id["GO-2021-0113"].reachability == "required"
    assert by_id["GO-2022-1059"].location == "golang.org/x/text@v0.3.5 (gosvc/go.mod)"
    assert {f.severity for f in findings} == {"unrated"}


def test_govulncheck_marks_findings_changed_when_go_sum_changed() -> None:
    findings, _ = nz.parse_govulncheck(fixture("govulncheck.json"), ".", {"go.sum"})
    assert all(f.changed_on_branch for f in findings)


def test_semgrep_separates_secret_rules_and_reports_errors() -> None:
    findings, errors = nz.parse_semgrep(
        json.loads(fixture("semgrep.json")),
        lambda path, start, end: f"{path}:{start}-{end}",
    )
    secret, code = findings
    assert (secret.category, secret.snippet, secret.severity) == ("secret", "", "high")
    assert (code.category, code.title, code.snippet) == (
        "code",
        "subprocess-shell-true",
        "handler.py:6-6",
    )
    assert errors == ["Error while matching: semgrep-core exit code: 2"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("CRITICAL", "critical"),
        ("ERROR", "high"),
        ("high", "high"),
        ("WARNING", "medium"),
        ("INFO", "low"),
        ("INVENTORY", "info"),
        ("UNKNOWN", "unrated"),
        ("", "unrated"),
    ],
)
def test_severity_mapping(raw: str, expected: str) -> None:
    assert nz.tool_severity(raw) == expected


# --- dedupe and ranking ---


def test_dedupe_merges_aliases_across_tools_and_keeps_best_fields() -> None:
    trivy, _ = nz.parse_trivy(json.loads(fixture("trivy.json")), set())
    go, _ = nz.parse_govulncheck(fixture("govulncheck.json"), "gosvc", set())
    pip = nz.parse_pip_audit(
        json.loads(fixture("pip_audit.json")), "requirements.txt", set()
    )
    merged = nz.dedupe(trivy + go + pip)

    text = next(f for f in merged if "GO-2022-1059" in f.vuln_ids)
    assert (text.tool, text.severity, text.reachability) == (
        "govulncheck+trivy",
        "high",
        "called at gosvc/main.go:10",
    )
    requests = [f for f in merged if f.ecosystem == "pypi"]
    assert sorted(f.tool for f in requests) == ["pip-audit", "pip-audit+trivy"]
    assert len(merged) == len(trivy) + len(go) + len(pip) - 1 - 2


def test_dedupe_merges_one_secret_seen_by_two_tools() -> None:
    leaks = nz.parse_gitleaks(json.loads(fixture("gitleaks_git.json")))
    semgrep, _ = nz.parse_semgrep(json.loads(fixture("semgrep.json")), lambda *_: "")
    merged = nz.dedupe(leaks + semgrep)
    assert [f.tool for f in merged] == ["gitleaks+semgrep", "semgrep"]


def test_rank_orders_by_severity_then_branch_changes() -> None:
    def finding(severity: str, changed: bool, location: str) -> nz.Finding:
        return nz.Finding("t", "code", severity, location, "x", changed)

    ranked = nz.rank(
        [
            finding("low", True, "a"),
            finding("high", False, "b"),
            finding("high", True, "c"),
        ]
    )
    assert [(f.id, f.location) for f in ranked] == [
        ("F1", "c"),
        ("F2", "b"),
        ("F3", "a"),
    ]


# --- redaction ---


@pytest.mark.parametrize(
    "secret",
    [
        FAKE_KEY,
        "ghp_" + "a1B2" * 9,
        "xoxb-1234567890-abcdefghij",
        'password = "hunter2hunter2"',
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake\n-----END RSA PRIVATE KEY-----",
    ],
)
def test_redact_masks_common_secret_shapes(secret: str) -> None:
    masked = nz.redact(f"x = {secret} # note")
    assert nz.REDACTED in masked
    assert "hunter2" not in masked
    assert "MIIEfake" not in masked
    assert FAKE_KEY not in masked


def test_gitleaks_snippet_is_redacted_even_when_gitleaks_did_not() -> None:
    (leak,) = nz.parse_gitleaks(json.loads(fixture("gitleaks_git.json")))
    assert FAKE_KEY not in json.dumps(leak.to_json())
    assert leak.title == "aws-access-token in commit 4f94e689"


def test_secret_never_reaches_stdout_or_json(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    del handlers
    stdout, data = run_main(repo, capsys)
    assert FAKE_KEY not in stdout
    assert FAKE_KEY not in json.dumps(data)
    locations = {f["location"] for f in data["findings"] if f["category"] == "secret"}
    assert locations == {"config.py:1", "settings_local.py:1"}


# --- end to end with mocked scanners ---


def test_full_run_reports_tools_findings_and_gaps(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    del handlers
    stdout, data = run_main(repo, capsys)
    assert "- Base: main" in stdout
    assert "gitleaks 8.30.1" in stdout
    assert "semgrep 1.177.0" in stdout
    assert "trivy 0.74.0" in stdout
    assert "govulncheck v1.8.0" in stdout
    assert "rust dependencies in crate: no lockfile trivy analyzed" in stdout
    assert "semgrep: 1 scan errors" in stdout
    assert data["findings"][0]["severity"] == "critical"
    code = next(f for f in data["findings"] if f["category"] == "code")
    assert code["snippet"] == "    return subprocess.call(user_input, shell=True)"
    assert set(data["changed_files"]) >= {
        "config.py",
        "handler.py",
        "settings_local.py",
    }


def test_semgrep_failure_is_a_gap_not_a_crash(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    handlers["semgrep", "scan"] = lambda _: done(
        code=2, stderr="error\nFailed to download config from https://semgrep.dev\n"
    )
    stdout, data = run_main(repo, capsys)
    assert (
        "semgrep: exit 2: Failed to download config from https://semgrep.dev" in stdout
    )
    assert not any(f["tool"] == "semgrep" for f in data["findings"])
    assert any(f["tool"] == "trivy" for f in data["findings"])


def test_timeout_and_internal_errors_become_gaps(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    def timeout(_: list[str]) -> subprocess.CompletedProcess[str]:
        raise scanners.ToolFailure("timed out after 300s")

    handlers["trivy", "fs"] = timeout
    handlers["go", "run"] = lambda _: done("{not json")
    stdout, _ = run_main(repo, capsys)
    assert "trivy: timed out after 300s" in stdout
    assert "rust dependencies in crate: trivy did not run" in stdout
    assert "govulncheck in gosvc:" in stdout


def test_uncovered_python_falls_back_to_pip_audit(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    def trivy_without_python(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        option(cmd, "--output").write_text('{"Results": []}')
        return done()

    handlers["trivy", "fs"] = trivy_without_python
    stdout, data = run_main(repo, capsys)
    assert "pip-audit 2.10.1" in stdout
    pip = [f for f in data["findings"] if f["tool"] == "pip-audit"]
    assert {f["location"] for f in pip} == {"Requests@2.19.0 (requirements.txt)"}
    assert all(f["changed_on_branch"] for f in pip)


def project(tmp_path: Path, **files: str) -> tuple[scanners.Context, Path]:
    root = tmp_path / "proj"
    for name, text in files.items():
        write(root / name.replace("__", "."), text)
    ctx = scanners.Context(root, "main", "abc", frozenset(), (), ())
    return ctx, tmp_path


def jobs_for(tmp_path: Path, **files: str):
    ctx, _ = project(tmp_path, **files)
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    return scanners.pip_audit_jobs(ctx, ".", scratch)


def test_pip_audit_jobs_always_carry_no_deps_and_disable_pip(tmp_path: Path) -> None:
    jobs, gaps = jobs_for(
        tmp_path,
        requirements__txt="requests==2.19.0\n",
        requirements_dev__txt="# autogenerated by pip-compile\nflask==3.0.0\n",
    )
    assert gaps == [] and len(jobs) == 2
    for job in jobs:
        assert "--no-deps" in job.args and "--disable-pip" in job.args


def test_pip_audit_jobs_flag_complete_inventory_only_for_locked_files(
    tmp_path: Path,
) -> None:
    jobs, _ = jobs_for(
        tmp_path,
        requirements__txt="requests==2.19.0\n",
        requirements_lock__txt="# This file was autogenerated by uv\nflask==3.0.0\n",
        requirements_hash__txt="a==1 \\\n    --hash=sha256:ab\n",
        requirements_loose__txt="a>=1\n",
    )
    complete = {Path(j.target).name: (j.pinned, j.complete) for j in jobs}
    assert complete == {
        "requirements.txt": (True, False),
        "requirements_hash.txt": (True, True),
        "requirements_lock.txt": (True, True),
        "requirements_loose.txt": (False, False),
    }


@pytest.mark.parametrize(
    "line",
    [
        "-e .",
        "--index-url https://evil.example/simple",
        "--extra-index-url https://evil.example/simple",
        "-f https://evil.example/wheels",
        "-r other.txt",
        "-c constraints.txt",
        "pkg @ https://evil.example/pkg.tar.gz",
        "git+https://github.com/x/y.git#egg=y",
        "./local/pkg",
        "../pkg",
        "pkg.whl",
    ],
)
def test_option_url_and_path_requirements_are_gaps_with_no_job(
    tmp_path: Path, line: str
) -> None:
    jobs, gaps = jobs_for(tmp_path, requirements__txt=f"requests==2.19.0\n{line}\n")
    assert jobs == []
    assert len(gaps) == 1 and "requirements.txt not audited" in gaps[0]


def test_pyproject_without_lock_is_a_gap_with_no_job(tmp_path: Path) -> None:
    jobs, gaps = jobs_for(tmp_path, pyproject__toml="[project]\nname='x'\n")
    assert jobs == []
    assert gaps == ["no lock file; pip-audit would install the project (pyproject.toml)"]


def test_uv_export_with_option_lines_is_not_audited(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def fake_run(cmd: list[str], *_: object) -> subprocess.CompletedProcess[str]:
        option(cmd, "-o").write_text("-e .\nrequests==2.31.0\n")
        return done()

    monkeypatch.setattr(scanners, "run", fake_run)
    jobs, gaps = jobs_for(tmp_path, uv__lock="", pyproject__toml="")
    assert jobs == [] and "uv export has a option line" in gaps[0]


def test_uv_export_is_audited_with_both_flags(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def fake_run(cmd: list[str], *_: object) -> subprocess.CompletedProcess[str]:
        option(cmd, "-o").write_text("requests==2.31.0 ; python_version >= '3.9'\n")
        return done()

    monkeypatch.setattr(scanners, "run", fake_run)
    jobs, gaps = jobs_for(tmp_path, uv__lock="")
    assert gaps == [] and jobs[0].complete
    assert "--no-deps" in jobs[0].args and "--disable-pip" in jobs[0].args


def test_uv_runs_ignore_project_config(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[tuple[list[str], dict | None]] = []

    def fake_run(
        cmd: list[str], cwd: Path, timeout: float, env: dict | None = None
    ) -> subprocess.CompletedProcess[str]:
        del cwd, timeout
        calls.append((cmd, env))
        if "-o" in cmd:
            option(cmd, "-o").write_text("requests==2.31.0\n")
        return done()

    monkeypatch.setattr(scanners, "run", fake_run)
    jobs_for(tmp_path, uv__lock="")
    assert "--no-config" in calls[0][0]
    assert all(env and env["UV_NO_CONFIG"] == "1" for _, env in calls)


def test_unpinned_requirements_skip_pip_audit_with_a_gap(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    def trivy_without_python(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        option(cmd, "--output").write_text('{"Results": []}')
        return done()

    def pip_audit_refuses(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        assert "--no-deps" in cmd and "--disable-pip" in cmd
        return done("", code=2, stderr="requirements not pinned")

    write(repo / "requirements.txt", "requests>=2\n")
    handlers["trivy", "fs"] = trivy_without_python
    handlers["uvx", "pip-audit"] = pip_audit_refuses
    stdout, _ = run_main(repo, capsys)
    assert "requirements are not fully pinned; pip-audit skipped" in stdout


def test_pinned_requirements_without_lock_report_transitive_gap(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    def trivy_without_python(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        option(cmd, "--output").write_text('{"Results": []}')
        return done()

    handlers["trivy", "fs"] = trivy_without_python
    stdout, _ = run_main(repo, capsys)
    assert "transitive dependencies not audited (no lock)" in stdout


def test_skip_is_reported_as_a_gap(
    repo: Path, handlers: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    del handlers
    stdout, data = run_main(repo, capsys, "--skip", "semgrep", "--skip", "gitleaks")
    assert "semgrep: skipped by --skip" in stdout
    assert "gitleaks: skipped by --skip" in stdout
    assert not any(f["category"] == "secret" for f in data["findings"])


def test_run_turns_timeouts_and_missing_binaries_into_tool_failures(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def expire(*_: object, **__: object) -> None:
        raise subprocess.TimeoutExpired("semgrep", 5)

    monkeypatch.setattr(scanners.subprocess, "run", expire)
    with pytest.raises(scanners.ToolFailure, match="timed out after 5s"):
        scanners.run(["semgrep"], tmp_path, 5)
    monkeypatch.undo()
    with pytest.raises(scanners.ToolFailure, match="is not installed"):
        scanners.run(["definitely-not-a-real-tool-xyz"], tmp_path, 5)


def test_tool_that_will_not_run_is_reported_not_worked_around(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = []

    def fake_run(cmd: list[str], *_: object) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        return done(code=1, stderr="mise ERROR No version is set for shim: gitleaks")

    monkeypatch.setattr(scanners, "run", fake_run)
    monkeypatch.setattr(scanners.shutil, "which", lambda tool: f"/usr/bin/{tool}")
    with pytest.raises(
        scanners.ToolFailure, match="installed but not usable.*No version"
    ):
        scanners.tool_version("gitleaks", ["version"], tmp_path)
    assert calls == [["gitleaks", "version"]]


def test_tool_version_reads_the_version(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(scanners, "run", lambda *_: done("v8.30.1\n"))
    monkeypatch.setattr(scanners.shutil, "which", lambda tool: f"/usr/bin/{tool}")
    assert scanners.tool_version("gitleaks", ["version"], tmp_path) == "8.30.1"


# --- base resolution and output ---


def test_base_defaults_to_merge_base_with_main(repo: Path) -> None:
    ctx = scan.build_context(repo, None)
    assert ctx.base == "main"
    assert ctx.merge_base == git(repo, "rev-parse", "main").strip()
    assert "settings_local.py" in ctx.uncommitted
    assert "config.py" not in ctx.uncommitted


def test_base_prefers_origin_head(repo: Path) -> None:
    main = git(repo, "rev-parse", "main").strip()
    git(repo, "update-ref", "refs/remotes/origin/main", main)
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")
    assert scan.resolve_base(repo, None) == ("origin/HEAD", main)


@pytest.mark.parametrize(
    ("requested", "message"),
    [("nope", "does not exist"), ("--output=x", "invalid base ref")],
)
def test_bad_base_ref_exits_2(
    repo: Path, capsys: pytest.CaptureFixture[str], requested: str, message: str
) -> None:
    assert scan.main(["--repo-root", str(repo), "--", requested]) == 2
    assert message in capsys.readouterr().err


def test_missing_default_base_exits_2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    git(tmp_path, "init", "-q", "-b", "trunk")
    git(tmp_path, "commit", "-q", "--allow-empty", "--no-gpg-sign", "-m", "root")
    assert scan.main(["--repo-root", str(tmp_path)]) == 2
    assert "no base ref found" in capsys.readouterr().err


def test_table_is_capped_with_omitted_count(tmp_path: Path) -> None:
    ctx = scanners.Context(tmp_path, "main", "a" * 40, frozenset(), (), ())
    findings = nz.rank(
        [
            nz.Finding("semgrep", "code", "low", f"f.py:{i}", "rule", True)
            for i in range(45)
        ]
    )
    text = scan.render(ctx, scanners.Outcome(findings=findings), 1.0, "/tmp/x.json")
    assert text.count("\n| F") == scan.TABLE_ROWS
    assert "5 more findings omitted" in text
    assert text.splitlines()[-1] == "Full findings JSON: /tmp/x.json"
