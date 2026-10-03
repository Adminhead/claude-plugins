"""Tests for coverage_map.py against throwaway repositories."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "coverage_map.py"


def write(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def run(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, SCRIPT, "--repo", str(root), "--no-git-root", *args],
        capture_output=True, text=True, check=False,
    )


def mapped(root: Path) -> dict:
    result = run(root, "--format", "json")
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_matches_by_name_mirror_import_and_flags_the_rest(tmp_path: Path) -> None:
    write(tmp_path, {
        "src/pricing.ts": "export const price = 1\n",
        "src/lib/tax.ts": "export const tax = 1\n",
        "src/ledger.ts": "export const ledger = 1\n",
        "src/auth/login.ts": "export const login = 1\n" * 40,
        "src/orphan.ts": "export const orphan = 1\n",
        "tests/pricing.test.ts": "it('a', () => { expect(1).toBe(1) })\n",
        "tests/lib/tax.test.ts": "it('a', () => { expect(1).toBe(1) })\n",
        "tests/misc.test.ts": "import { ledger } from '../src/ledger'\nit('a', () => { expect(ledger).toBe(1) })\n",
    })
    data = mapped(tmp_path)
    unmatched = [u["path"] for u in data["unmatched"]]
    assert unmatched == ["src/auth/login.ts", "src/orphan.ts"]  # risk-flagged first
    assert data["unmatched"][0]["risk_keywords"] == ["auth", "login"]
    assert data["totals"]["matched"] == 3


def test_helper_under_tests_dir_does_not_cover_same_named_source(tmp_path: Path) -> None:
    write(tmp_path, {
        "src/api.ts": "export const api = 1\n",
        "e2e/lib/api.ts": "export const helper = 1\n",
        "e2e/flow.spec.ts": "it('a', () => { expect(1).toBe(1) })\n",
    })
    assert [u["path"] for u in mapped(tmp_path)["unmatched"]] == ["src/api.ts"]


def test_flags_tests_with_cases_but_no_assertions(tmp_path: Path) -> None:
    write(tmp_path, {
        "src/a.ts": "export const a = 1\n",
        "tests/a.test.ts": "it('x', () => {})\nit('y', () => {})\nit('z', () => {})\n",
    })
    weak = mapped(tmp_path)["weak_tests"]
    assert [(w["path"], w["test_cases"], w["assertions"]) for w in weak] == [("tests/a.test.ts", 3, 0)]


def test_detects_framework_and_convention(tmp_path: Path) -> None:
    write(tmp_path, {
        "package.json": '{"devDependencies": {"vitest": "1"}}',
        "src/a.ts": "export const a = 1\n",
        "src/a.test.ts": "it('x', () => { expect(1).toBe(1) })\n",
    })
    data = mapped(tmp_path)
    assert data["frameworks"] == ["vitest"]
    assert data["conventions"] == ["*.test|spec.[jt]s(x) (1)"]


def test_writes_nothing_and_rejects_bad_path(tmp_path: Path) -> None:
    write(tmp_path, {"src/a.py": "x = 1\n"})
    before = sorted(p.relative_to(tmp_path) for p in tmp_path.rglob("*"))
    assert run(tmp_path).returncode == 0
    assert sorted(p.relative_to(tmp_path) for p in tmp_path.rglob("*")) == before
    assert run(tmp_path / "missing").returncode == 2


def test_flags_weak_pytest_and_go_tests(tmp_path: Path) -> None:
    write(tmp_path, {
        "app/a.py": "x = 1\n",
        "tests/test_a.py": "def test_one():\n    pass\n\ndef test_two():\n    pass\n",
        "pkg/b.go": "package pkg\n",
        "pkg/b_test.go": "package pkg\nfunc TestOne(t *testing.T) {}\nfunc TestTwo(t *testing.T) {}\n",
    })
    weak = {w["path"]: w["test_cases"] for w in mapped(tmp_path)["weak_tests"]}
    assert weak == {"tests/test_a.py": 2, "pkg/b_test.go": 2}


def test_nested_integration_dir_is_production_code(tmp_path: Path) -> None:
    write(tmp_path, {
        "src/integration/payment.ts": "export const pay = 1\n",
        "integration/flow.ts": "export const helper = 1\n",
    })
    data = mapped(tmp_path)
    assert [u["path"] for u in data["unmatched"]] == ["src/integration/payment.ts"]
    assert data["totals"]["test_files"] == 1


def test_device_symlink_is_skipped_not_read(tmp_path: Path) -> None:
    write(tmp_path, {"src/a.ts": "export const a = 1\n"})
    os.symlink("/dev/zero", tmp_path / "src" / "zero.ts")
    result = run(tmp_path, "--format", "json")
    assert result.returncode == 0, result.stderr
    assert "src/a.ts" in [u["path"] for u in json.loads(result.stdout)["unmatched"]]


def test_top_applies_to_json_and_rejects_nonpositive(tmp_path: Path) -> None:
    write(tmp_path, {f"src/m{i}.ts": "export const a = 1\n" for i in range(4)})
    data = json.loads(run(tmp_path, "--format", "json", "--top", "2").stdout)
    assert len(data["unmatched"]) == 2
    assert data["truncated"]["unmatched"] == 4
    assert run(tmp_path, "--top", "0").returncode == 2
