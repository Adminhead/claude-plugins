"""Tests for the /test runner script: parsers, detection, selection, output, CLI."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import detect
import pytest
import run_tests
from detect import DetectError, Project, parse_target, select_project
from parse import Failure, Report, RunOutput, parse
from plan import build_plan, changed_files

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_tests.py"
FIXTURES = Path(__file__).parent / "fixtures"
WORK = Path("/work")
GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def write(path: Path, text: str = "") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, env=GIT_ENV
    )


def ids(report: Report) -> list[str]:
    return [f"{f.path}::{f.name}" if f.path else f.name for f in report.failures]


def cli(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


# --- parsers ---


def test_pytest_parser_reports_failures_errors_and_user_frames() -> None:
    run = RunOutput("", "", 1, fixture("pytest_failures.xml"))
    report = parse("pytest", run, WORK)
    assert (report.passed, report.failed, report.skipped, report.errors) == (2, 3, 1, 1)
    assert ids(report) == [
        "tests/test_calc.py::test_add",
        "tests/test_calc.py::TestDiv::test_zero",
        "tests/test_calc.py::TestDiv::test_param[2]",
        "tests/test_calc.py::test_setup_error",
    ]
    add, zero = report.failures[:2]
    assert add.location == "tests/test_calc.py:7"
    assert add.message == ["assert -1 == 3", " +  where -1 = add(1, 2)"]
    assert not any(line.startswith("E ") for line in add.trace)
    assert zero.location == "calc.py:6"
    assert zero.trace[-1].strip() == "return a / b"


def test_pytest_collection_error_is_a_crash_with_the_errors_section() -> None:
    run = RunOutput(fixture("pytest_collect.out"), "", 2, fixture("pytest_collect.xml"))
    report = parse("pytest", run, WORK)
    assert report.crash == "test collection failed or the run was interrupted"
    assert report.crash_lines[0].startswith("=====")
    assert "E   ModuleNotFoundError: No module named 'nope'" in report.crash_lines
    assert not any("\x1b" in line for line in report.crash_lines)


def test_go_parser_keeps_leaf_failures_and_user_panic_frames(tmp_path: Path) -> None:
    write(tmp_path / "go.mod", "module example.com/demo\n")
    events = fixture("go_failures.json").replace("/work", str(tmp_path))
    report = parse("go", RunOutput(events, "", 1, None), tmp_path)
    assert ids(report) == ["sub::TestAdd", "sub::TestTable/bad", "sub::TestPanic"]
    add, table, panic = report.failures
    assert add.location == "sub/calc_test.go:7"
    assert add.message == ["Add(1, 2) = -1, want 3"]
    assert table.message == ["got 0", "want 2"]
    assert panic.location == "sub/calc.go:5"
    assert panic.message[0].startswith("panic: runtime error: index out of range")
    assert panic.trace == [
        "example.com/demo/sub.Get(...)  sub/calc.go:5",
        "example.com/demo/sub.TestPanic(0xa39a62e6b48?)  sub/calc_test.go:21",
    ]


def test_go_build_failure_is_a_crash() -> None:
    run = RunOutput(fixture("go_build.json"), "", 1, None)
    report = parse("go", run, WORK)
    assert report.crash == "build failed"
    assert any("cannot use" in line for line in report.crash_lines)


def test_jest_parser_prefers_the_failing_line_over_the_test_declaration() -> None:
    run = RunOutput("", "", 1, fixture("jest_failures.json"))
    report = parse("jest", run, WORK)
    assert (report.passed, report.failed, report.skipped) == (1, 1, 1)
    [failure] = report.failures
    assert f"{failure.path}::{failure.name}" == "calc.test.js::add > sums"
    assert failure.location == "calc.test.js:4"
    assert (
        failure.message[0]
        == "Error: expect(received).toBe(expected) // Object.is equality"
    )
    assert failure.trace == ["at Object.toBe (calc.test.js:4:23)"]


@pytest.mark.parametrize(
    ("kind", "name"),
    [("jest", "jest_load_error.json"), ("vitest", "vitest_load_error.json")],
)
def test_js_suite_that_fails_to_load_is_a_crash(kind: str, name: str) -> None:
    report = parse(kind, RunOutput("", "", 1, fixture(name)), WORK)
    assert report.crash == "1 test file(s) failed to load"
    assert report.crash_lines[0].endswith(".test.js:") or report.crash_lines[
        0
    ].endswith(".test.mjs:")


def test_vitest_parser_reads_location_from_the_stack() -> None:
    report = parse(
        "vitest", RunOutput("", "", 1, fixture("vitest_failures.json")), WORK
    )
    assert (report.passed, report.failed, report.skipped) == (1, 1, 1)
    [failure] = report.failures
    assert failure.location == "vcalc.test.mjs:5"
    assert failure.message == [
        "AssertionError: expected -1 to be 3 // Object.is equality"
    ]
    assert all("node_modules" not in line for line in failure.trace)


def test_missing_js_report_is_a_crash() -> None:
    report = parse("jest", RunOutput("", "Error: bad config", 1, None), WORK)
    assert report.crash == "runner wrote no JSON report"
    assert report.crash_lines == ["Error: bad config"]


def test_cargo_parser_reads_unit_integration_and_doc_failures() -> None:
    report = parse(
        "cargo", RunOutput(fixture("cargo_failures.out"), "", 101, None), WORK
    )
    assert (report.passed, report.failed, report.skipped) == (2, 3, 1)
    assert ids(report) == ["tests::adds", "integ_panics", "src/lib.rs - add (line 3)"]
    adds, integ, doc = report.failures
    assert adds.location == "src/lib.rs:16"
    assert adds.message == [
        "assertion `left == right` failed",
        "  left: -1",
        " right: 3",
    ]
    assert integ.message == ["index out of bounds: the len is 0 but the index is 2"]
    assert doc.location == "src/lib.rs:5"


def test_cargo_compile_error_is_a_crash_starting_at_the_error() -> None:
    report = parse(
        "cargo", RunOutput(fixture("cargo_compile.out"), "", 101, None), WORK
    )
    assert report.crash == "compilation failed"
    assert report.crash_lines[0] == "error[E0277]: cannot subtract `&str` from `i32`"
    assert len(report.crash_lines) <= 40


def test_dotnet_vstest_parser_reads_failures_and_user_frames() -> None:
    run = RunOutput(fixture("dotnet_vstest_failures.out"), "", 1, None)
    report = parse("dotnet", run, WORK)
    assert (report.passed, report.failed, report.skipped) == (1, 2, 1)
    assert ids(report) == [
        "Calc.Tests.CalcTests.Add_Sums",
        "Calc.Tests.CalcTests.Throws",
    ]
    add, throws = report.failures
    assert add.location == "Calc.Tests/CalcTests.cs:9"
    assert add.message == [
        "Assert.Equal() Failure: Values differ",
        "Expected: 3",
        "Actual:   -1",
    ]
    assert throws.location == "Calc.Tests/CalcTests.cs:4"
    assert throws.trace == [
        "at Calc.Tests.Calc.Get(Int32[] xs, Int32 i)  Calc.Tests/CalcTests.cs:4",
        "at Calc.Tests.CalcTests.Throws()  Calc.Tests/CalcTests.cs:15",
    ]


def test_dotnet_mtp_parser_reads_the_summary_block_and_failures() -> None:
    run = RunOutput(fixture("dotnet_mtp_failures.out"), "", 2, None)
    report = parse("dotnet", run, WORK)
    assert (report.passed, report.failed, report.skipped) == (1, 2, 1)
    assert ids(report) == [
        "Calc.Tests.CalcTests.Throws",
        "Calc.Tests.CalcTests.Add_Sums",
    ]
    throws, add = report.failures
    assert add.location == "Calc.Tests/CalcTests.cs:9"
    assert add.message[1:] == ["Expected: 3", "Actual:   -1"]
    assert not any("System.Reflection" in line for line in throws.trace)
    assert not any(line.startswith("from ") for line in throws.message)


def test_dotnet_build_failure_is_a_crash_with_deduplicated_errors() -> None:
    report = parse("dotnet", RunOutput(fixture("dotnet_build.out"), "", 1, None), WORK)
    assert report.crash == "build failed"
    assert report.crash_lines[0].startswith(
        "Calc.Tests/CalcTests.cs(7,6): error CS0246"
    )
    assert len(report.crash_lines) == len(set(report.crash_lines)) == 8


def test_gut_parser_reads_junit_and_attaches_engine_backtraces() -> None:
    run = RunOutput("", fixture("gut_failures.err"), 1, fixture("gut_failures.xml"))
    report = parse("gut", run, WORK)
    assert (report.passed, report.failed, report.skipped) == (1, 2, 1)
    assert ids(report) == [
        "test/unit/test_calc.gd::test_add",
        "test/unit/test_calc.gd::test_error",
    ]
    add, error = report.failures
    assert add.location == "test/unit/test_calc.gd:4"
    assert add.message == ["[-1] expected to equal [3]:  add sums"]
    assert error.location == "src/calc.gd:8"
    assert error.trace == [
        "get_at  src/calc.gd:8",
        "test_error  test/unit/test_calc.gd:14",
    ]


def test_gut_script_parse_error_is_a_crash() -> None:
    run = RunOutput("", fixture("gut_parse_error.err"), 1, fixture("gut_failures.xml"))
    report = parse("gut", run, WORK)
    assert report.crash is not None
    assert report.crash.startswith("script parse error")
    assert report.crash_lines[0].startswith("SCRIPT ERROR: Parse Error")
    missing = parse("gut", RunOutput("", "ERROR: boom", 1, None), WORK)
    assert missing.crash == "GUT exited 1 without a JUnit report"


def test_gdunit4_parser_reads_console_failures_and_summary() -> None:
    run = RunOutput(fixture("gdunit4_failures.out"), "", 100, None)
    report = parse("gdunit4", run, WORK)
    assert (report.passed, report.failed, report.skipped, report.errors) == (
        1,
        1,
        1,
        1,
    )
    assert ids(report) == [
        "test/calc_test.gd::test_add",
        "test/calc_test.gd::test_error",
    ]
    add, error = report.failures
    assert add.location == "test/calc_test.gd:4"
    assert add.message == ["Expecting:", "3", "but was", "-1"]
    assert error.location == "src/calc.gd:8"
    assert error.trace[-1] == "test_error  test/calc_test.gd:11"


def test_gdunit4_known_exit_codes_are_crashes() -> None:
    run = RunOutput(
        "Headless mode is not supported!\nAbnormal exit with 103", "", 103, None
    )
    report = parse("gdunit4", run, WORK)
    assert report.crash == "gdUnit4 refused headless mode (pass --ignoreHeadlessMode)"
    assert report.crash_lines == ["Abnormal exit with 103"]


def test_unknown_runner_is_unstructured() -> None:
    assert not parse("make", RunOutput("ok", "", 0, None), WORK).structured


# --- detection ---


def test_cmd_wins_and_infers_the_parser(tmp_path: Path) -> None:
    write(tmp_path / "go.mod", "module x\n")
    project = select_project(tmp_path, [], "uv run pytest -x")
    assert (project.kind, project.base) == ("pytest", ("uv", "run", "pytest", "-x"))
    assert select_project(tmp_path, [], "go test ./...").kind == "go"
    assert select_project(tmp_path, [], "cargo test").kind == "cargo"
    assert select_project(tmp_path, [], "make check").kind == "custom"


@pytest.mark.parametrize(
    ("files", "kind", "base"),
    [
        (
            {"package.json": {"test": "vitest"}, "pnpm-lock.yaml": ""},
            "vitest",
            ("pnpm", "exec", "vitest"),
        ),
        (
            {"package.json": {"test": "jest --coverage"}},
            "jest",
            ("npx", "--no", "jest"),
        ),
        (
            {"package.json": {"test": "mocha"}, "bun.lock": ""},
            "npm",
            ("bun", "run", "test"),
        ),
        ({"package.json": {"test": "mocha"}, "yarn.lock": ""}, "npm", ("yarn", "test")),
        (
            {"pyproject.toml": "[tool.pytest.ini_options]\n"},
            "pytest",
            ("python3", "-m", "pytest"),
        ),
        (
            {"pyproject.toml": "[project]\n", "uv.lock": "", "tests/test_a.py": ""},
            "pytest",
            ("uv", "run", "pytest"),
        ),
        ({"conftest.py": ""}, "pytest", ("python3", "-m", "pytest")),
        ({"go.mod": "module x\n"}, "go", ("go", "test")),
        ({"Cargo.toml": ""}, "cargo", ("cargo", "test")),
        (
            {"Makefile": "build:\n\ttrue\ntest: build\n\ttrue\n"},
            "make",
            ("make", "test"),
        ),
    ],
)
def test_detects_each_runner(
    tmp_path: Path, files: dict, kind: str, base: tuple[str, ...]
) -> None:
    for name, content in files.items():
        text = json.dumps({"scripts": content}) if name == "package.json" else content
        write(tmp_path / name, text)
    project = select_project(tmp_path, [], None)
    assert (project.kind, project.base, project.root) == (kind, base, tmp_path)


def test_detection_order_and_extension_choice_within_one_directory(
    tmp_path: Path,
) -> None:
    write(tmp_path / "package.json", json.dumps({"scripts": {"test": "jest"}}))
    write(tmp_path / "pytest.ini", "[pytest]\n")
    write(tmp_path / "Makefile", "test:\n\ttrue\n")
    assert select_project(tmp_path, [], None).kind == "jest"
    target = parse_target(str(write(tmp_path / "test_a.py")), tmp_path, tmp_path)
    assert select_project(tmp_path, [target], None).kind == "pytest"


def test_placeholder_npm_test_script_is_ignored(tmp_path: Path) -> None:
    placeholder = 'echo "Error: no test specified" && exit 1'
    write(tmp_path / "package.json", json.dumps({"scripts": {"test": placeholder}}))
    write(tmp_path / "go.mod", "module x\n")
    assert select_project(tmp_path, [], None).kind == "go"


def test_monorepo_without_targets_is_ambiguous(tmp_path: Path) -> None:
    write(tmp_path / "web/package.json", json.dumps({"scripts": {"test": "vitest"}}))
    write(tmp_path / "api/pytest.ini", "[pytest]\n")
    with pytest.raises(DetectError, match="several test projects") as caught:
        select_project(tmp_path, [], None)
    assert "api: python3 -m pytest" in str(caught.value)
    assert "web: npx --no vitest" in str(caught.value)
    write(tmp_path / "api/tests/test_a.py")
    target = parse_target("api/tests", tmp_path, tmp_path)
    assert select_project(tmp_path, [target], None).root == tmp_path / "api"


def test_targets_in_two_projects_are_rejected(tmp_path: Path) -> None:
    write(tmp_path / "a/go.mod", "module a\n")
    write(tmp_path / "b/go.mod", "module b\n")
    targets = [parse_target(p, tmp_path, tmp_path) for p in ("a", "b")]
    with pytest.raises(DetectError, match="several projects"):
        select_project(tmp_path, targets, None)


def test_no_runner_is_an_error(tmp_path: Path) -> None:
    write(tmp_path / "README.md", "hi")
    with pytest.raises(DetectError, match="no test runner found"):
        select_project(tmp_path, [], None)


def test_skips_vendored_directories(tmp_path: Path) -> None:
    write(
        tmp_path / "node_modules/x/package.json",
        json.dumps({"scripts": {"test": "jest"}}),
    )
    write(tmp_path / "go.mod", "module x\n")
    assert select_project(tmp_path, [], None).kind == "go"


# --- .NET and Godot detection ---

TEST_CSPROJ = (
    '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>'
    '<PackageReference Include="{pkg}" /></ItemGroup>{props}</Project>'
)


def dotnet_repo(
    root: Path, pkg: str = "xunit", props: str = "", global_json: str | None = None
) -> Path:
    write(
        root / "tests/App.Tests/App.Tests.csproj",
        TEST_CSPROJ.format(pkg=pkg, props=props),
    )
    write(root / "src/App/App.csproj", '<Project Sdk="Microsoft.NET.Sdk" />')
    write(
        root / "App.slnx",
        '<Solution><Project Path="src/App/App.csproj" />'
        '<Project Path="tests/App.Tests/App.Tests.csproj" /></Solution>',
    )
    if global_json is not None:
        write(root / "global.json", global_json)
    return root


def test_dotnet_solution_with_a_test_project_runs_vstest(tmp_path: Path) -> None:
    project = select_project(dotnet_repo(tmp_path), [], None)
    assert (project.kind, project.mode, project.entry) == (
        "dotnet",
        "vstest",
        "App.slnx",
    )
    plan = build_plan(project, [], None, True, Path("/r"), custom=False)
    assert plan.argv == ("dotnet", "test", "App.slnx")


def test_dotnet_ignores_solutions_and_projects_without_tests(tmp_path: Path) -> None:
    write(tmp_path / "src/App/App.csproj", '<Project Sdk="Microsoft.NET.Sdk" />')
    write(
        tmp_path / "App.sln", 'Project("{X}") = "App", "src\\App\\App.csproj", "{Y}"\n'
    )
    with pytest.raises(DetectError, match="no test runner found"):
        select_project(tmp_path, [], None)


def test_dotnet_global_json_runner_selects_native_mtp(tmp_path: Path) -> None:
    runner = '{"test": {"runner": "Microsoft.Testing.Platform"}}'
    repo = dotnet_repo(tmp_path, pkg="xunit.v3.mtp-v2", global_json=runner)
    project = select_project(repo, [], None)
    assert (project.mode, project.framework) == ("mtp", "xunit3")
    full = build_plan(project, [], None, True, Path("/r"), custom=False)
    assert full.argv == ("dotnet", "test", "--solution", "App.slnx")
    target = parse_target("App.Tests.CalcTests.Adds", repo, repo)
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv[-2:] == ("--filter-method", "*App.Tests.CalcTests.Adds*")


def test_dotnet_bridge_puts_mtp_filters_after_the_separator(tmp_path: Path) -> None:
    props = (
        "<PropertyGroup><EnableMSTestRunner>true</EnableMSTestRunner>"
        "<TestingPlatformDotnetTestSupport>true</TestingPlatformDotnetTestSupport>"
        "</PropertyGroup>"
    )
    repo = dotnet_repo(tmp_path, pkg="MSTest", props=props)
    project = select_project(repo, [], None)
    assert (project.mode, project.framework) == ("bridge", "")
    target = parse_target("Ns.Cls.Method(1, x)", repo, repo)
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv == (
        "dotnet",
        "test",
        "App.slnx",
        "--",
        "--filter",
        "FullyQualifiedName~Ns.Cls.Method",
    )


def test_dotnet_runner_property_without_bridge_stays_vstest(tmp_path: Path) -> None:
    props = "<PropertyGroup><EnableNUnitRunner>true</EnableNUnitRunner></PropertyGroup>"
    repo = dotnet_repo(tmp_path, pkg="NUnit", props=props)
    assert select_project(repo, [], None).mode == "vstest"


def test_dotnet_tunit_uses_a_tree_node_filter(tmp_path: Path) -> None:
    repo = dotnet_repo(tmp_path, pkg="TUnit")
    project = select_project(repo, [], None)
    assert (project.mode, project.framework) == ("bridge", "tunit")
    target = parse_target("Ns.CalcTests.Adds", repo, repo)
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv[-3:] == ("--", "--treenode-filter", "/*/*/CalcTests/Adds")


def test_dotnet_file_target_runs_its_test_project(tmp_path: Path) -> None:
    repo = dotnet_repo(tmp_path)
    write(repo / "tests/App.Tests/CalcTests.cs")
    target = parse_target("tests/App.Tests/CalcTests.cs", repo, repo)
    project = select_project(repo, [target], None)
    assert project.root == repo / "tests/App.Tests"
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv == ("dotnet", "test", "App.Tests.csproj")
    assert plan.display(repo) == "cd tests/App.Tests && dotnet test App.Tests.csproj"


def test_dotnet_vstest_filter_escapes_special_characters(tmp_path: Path) -> None:
    project = select_project(dotnet_repo(tmp_path), [], None)
    target = parse_target("Adds!=", tmp_path, tmp_path)
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv[-1] == "FullyQualifiedName~Adds\\!\\="


def godot_repo(root: Path, addon: str | None, imported: bool = True) -> Path:
    write(root / "project.godot", "config_version=5\n")
    write(root / "test/unit/test_a.gd", "extends GutTest\n")
    if addon:
        write(root / f"addons/{addon}/plugin.cfg")
    if imported:
        (root / ".godot").mkdir()
    return root


@pytest.fixture
def godot_bin(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("GODOT_BIN", "/opt/godot")
    return "/opt/godot"


def test_godot_gut_runs_headless_with_a_junit_report(
    tmp_path: Path, godot_bin: str
) -> None:
    repo = godot_repo(tmp_path, "gut")
    project = select_project(repo, [], None)
    assert project.kind == "gut"
    plan = build_plan(project, [], None, True, Path("/r.xml"), custom=False)
    assert plan.argv == (
        godot_bin,
        "--headless",
        "-s",
        "--path",
        ".",
        "addons/gut/gut_cmdln.gd",
        "-gexit",
        "-gjunit_xml_file=/r.xml",
        "-gdir=res://test",
        "-ginclude_subdirs",
    )
    assert plan.setup == ()
    target = parse_target("test/unit/test_a.gd::test_add", repo, repo)
    plan = build_plan(project, [target], None, False, Path("/r.xml"), custom=False)
    assert plan.argv[-2:] == (
        "-gtest=res://test/unit/test_a.gd",
        "-gunit_test_name=test_add",
    )


def test_godot_gutconfig_keeps_its_own_directories(
    tmp_path: Path, godot_bin: str
) -> None:
    repo = godot_repo(tmp_path, "gut")
    write(repo / ".gutconfig.json", "{}")
    plan = build_plan(
        select_project(repo, [], None), [], None, True, Path("/r"), custom=False
    )
    assert plan.argv[-1] == "-gjunit_xml_file=/r"


def test_godot_gdunit4_selects_suites_by_path(tmp_path: Path, godot_bin: str) -> None:
    repo = godot_repo(tmp_path, "gdUnit4")
    project = select_project(repo, [], None)
    assert project.kind == "gdunit4"
    plan = build_plan(project, [], None, True, Path("/r"), custom=False)
    assert plan.argv[0] == godot_bin
    assert "--ignoreHeadlessMode" in plan.argv
    assert plan.argv[-3:] == ("-c", "-a", "res://test")
    target = parse_target("test/unit/test_a.gd::test_x", repo, repo)
    plan = build_plan(project, [target], None, False, Path("/r"), custom=False)
    assert plan.argv[-2:] == ("-a", "res://test/unit/test_a.gd")
    with pytest.raises(DetectError, match="by suite path"):
        build_plan(
            project,
            [parse_target("test_x", repo, repo)],
            None,
            False,
            Path("/r"),
            custom=False,
        )


def test_godot_bare_runner_and_fresh_checkout_import(
    tmp_path: Path, godot_bin: str
) -> None:
    repo = godot_repo(tmp_path, None, imported=False)
    write(repo / "test/test_runner.gd", "extends SceneTree\n")
    project = select_project(repo, [], None)
    assert project.kind == "godot"
    plan = build_plan(project, [], None, True, Path("/r"), custom=False)
    assert plan.argv[-2:] == ("--script", "res://test/test_runner.gd")
    assert plan.setup == (godot_bin, "--headless", "--path", ".", "--import")
    assert plan.scope.endswith("imports the project first (no .godot/)")
    assert not parse("godot", RunOutput("", "", 1, None), repo).structured


def test_godot_binary_falls_back_to_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("GODOT_BIN", raising=False)
    monkeypatch.setattr(
        detect.shutil,
        "which",
        lambda name: "/usr/bin/x" if name == "godot-mono" else None,
    )
    assert detect.godot_binary() == "godot-mono"
    monkeypatch.setattr(detect.shutil, "which", lambda name: None)
    assert detect.godot_binary() == "godot"


def test_godot_runner_wins_over_its_csharp_solution(
    tmp_path: Path, godot_bin: str
) -> None:
    repo = godot_repo(tmp_path, "gut")
    write(repo / "Game.Tests.csproj", TEST_CSPROJ.format(pkg="gdUnit4.api", props=""))
    assert select_project(repo, [], None).kind == "gut"
    write(repo / "src/Thing.cs")
    target = parse_target("src/Thing.cs", repo, repo)
    assert select_project(repo, [target], None).kind == "dotnet"


def test_cmd_infers_dotnet_and_godot_parsers(tmp_path: Path) -> None:
    assert select_project(tmp_path, [], "dotnet test --no-build").kind == "dotnet"
    gut = "godot --headless -s --path . addons/gut/gut_cmdln.gd"
    assert select_project(tmp_path, [], gut).kind == "gut"
    assert (
        select_project(tmp_path, [], "./addons/gdUnit4/runtest.sh -a res://test").kind
        == "gdunit4"
    )


# --- selection and affected mapping ---


def plan_for(project: Project, changed: list[str], root: Path) -> tuple[list[str], str]:
    files = [write(root / name) for name in changed]
    plan = build_plan(
        project, [], (files, "changed vs main"), False, Path("/r"), custom=False
    )
    return list(plan.argv), plan.scope


def test_pytest_affected_uses_test_files_conftest_dirs_and_last_failed(
    tmp_path: Path,
) -> None:
    write(tmp_path / "tests/test_old.py")
    cache = {"tests/test_old.py::test_x": True, "tests/gone.py::test_y": True}
    write(tmp_path / ".pytest_cache/v/cache/lastfailed", json.dumps(cache))
    project = Project("pytest", tmp_path, ("pytest",))
    argv, scope = plan_for(
        project, ["src/app.py", "tests/test_new.py", "tests/unit/conftest.py"], tmp_path
    )
    assert argv[-3:] == ["tests/test_new.py", "tests/unit", "tests/test_old.py::test_x"]
    assert scope == "affected: 3 files changed vs main -> 3 selections"


def test_go_affected_uses_changed_packages(tmp_path: Path) -> None:
    project = Project("go", tmp_path, ("go", "test"))
    argv, _ = plan_for(
        project, ["a/x.go", "a/y_test.go", "main.go", "README.md"], tmp_path
    )
    assert argv == ["go", "test", "-json", "./a", "."]


def test_js_affected_uses_related_tests(tmp_path: Path) -> None:
    jest = Project("jest", tmp_path, ("npx", "--no", "jest"))
    argv, _ = plan_for(jest, ["src/a.ts", "notes.md"], tmp_path)
    assert argv[-3:] == ["--findRelatedTests", "src/a.ts", "--passWithNoTests"]
    vitest = Project("vitest", tmp_path, ("pnpm", "exec", "vitest"))
    argv, _ = plan_for(vitest, ["src/a.ts"], tmp_path)
    assert argv[:6] == ["pnpm", "exec", "vitest", "related", "src/a.ts", "--run"]


def test_unmapped_changes_fall_back_to_the_full_suite_and_say_so(
    tmp_path: Path,
) -> None:
    cargo = Project("cargo", tmp_path, ("cargo", "test"))
    argv, scope = plan_for(cargo, ["src/lib.rs"], tmp_path)
    assert argv == ["cargo", "test", "--no-fail-fast"]
    assert scope == "full suite (cargo has no affected-test mapping)"
    pytest_project = Project("pytest", tmp_path, ("pytest",))
    _, scope = plan_for(pytest_project, ["docs/x.md"], tmp_path)
    assert scope == "full suite (no changed vs main files map to tests)"


def test_failure_ids_are_valid_rerun_targets(tmp_path: Path) -> None:
    write(tmp_path / "sub/calc_test.go")
    go = Project("go", tmp_path, ("go", "test"))
    targets = [
        parse_target(t, tmp_path, tmp_path) for t in ("sub::TestTable/bad", "TestX")
    ]
    plan = build_plan(go, targets, None, False, Path("/r"), custom=False)
    assert plan.argv == ("go", "test", "-json", "-run", "^(TestTable)$|TestX", "./sub")

    write(tmp_path / "a.test.js")
    jest = Project("jest", tmp_path, ("jest",))
    target = parse_target("a.test.js::add > sums (x)", tmp_path, tmp_path)
    plan = build_plan(jest, [target], None, False, Path("/r"), custom=False)
    assert plan.argv[-3:] == ("a.test.js", "-t", r"add sums \(x\)")

    cargo = Project("cargo", tmp_path, ("cargo", "test"))
    write(tmp_path / "tests/integ.rs")
    targets = [
        parse_target(t, tmp_path, tmp_path) for t in ("tests::adds", "tests/integ.rs")
    ]
    plan = build_plan(cargo, targets, None, False, Path("/r"), custom=False)
    assert plan.argv == (
        "cargo",
        "test",
        "--no-fail-fast",
        "--test",
        "integ",
        "--",
        "tests::adds",
    )


def test_custom_command_translates_targets_only_for_position_free_runners(
    tmp_path: Path,
) -> None:
    write(tmp_path / "tests/test_a.py")
    targets = [
        parse_target(t, tmp_path, tmp_path) for t in ("tests/test_a.py::t", "slow")
    ]
    pytest_cmd = select_project(tmp_path, [], "uv run pytest")
    plan = build_plan(pytest_cmd, targets, None, False, Path("/r.xml"), custom=True)
    assert plan.argv[-4:] == ("junit_family=xunit1", "tests/test_a.py::t", "-k", "slow")
    assert plan.scope == "custom command"
    make = select_project(tmp_path, [], "make check")
    plan = build_plan(make, targets, None, False, Path("/r"), custom=True)
    assert plan.argv == ("make", "check", "tests/test_a.py::t", "slow")


def test_changed_files_diff_against_the_merge_base(tmp_path: Path) -> None:
    git(tmp_path, "init", "-q", "-b", "main")
    write(tmp_path / "kept.py")
    write(tmp_path / "gone.py")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "root")
    git(tmp_path, "switch", "-qc", "feature")
    write(tmp_path / "committed.py", "x = 1\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "feature")
    write(tmp_path / "kept.py", "changed\n")
    (tmp_path / "gone.py").unlink()
    write(tmp_path / "untracked.py")
    changes = changed_files(tmp_path)
    assert changes is not None
    files, label = changes
    assert sorted(f.name for f in files) == ["committed.py", "kept.py", "untracked.py"]
    assert label == "changed vs main"


def test_changed_files_outside_git_is_none(tmp_path: Path) -> None:
    assert changed_files(tmp_path) is None


# --- rendering and caps ---


def args(max_failures: int = 20, trace_lines: int = 15) -> object:
    return run_tests.parse_args(
        ["--max-failures", str(max_failures), "--trace-lines", str(trace_lines)]
    )


def test_render_caps_failures_messages_traces_and_line_width() -> None:
    failures = [
        Failure(
            "t.py", f"test_{n}", "t.py:1", [f"m{i}" for i in range(12)], ["x" * 300] * 9
        )
        for n in range(5)
    ]
    report = Report(failed=5, failures=failures)
    lines, code = run_tests.render(
        report, RunOutput("", "", 1, None), "pkg", 1.0, args(2, 3)
    )
    text = "\n".join(lines)
    assert code == 1
    assert lines[0] == "0 passed, 5 failed, 0 skipped, 0 errors in 1.0s"
    assert "### 1. pkg/t.py::test_0" in text
    assert "pkg/t.py:1" in text
    assert "### 3." not in text
    assert "... 3 more failures omitted (see log)" in text
    assert "(+4 message lines)" in text
    assert text.count("x" * 199 + "…") == 6


def test_render_exit_codes() -> None:
    passing = Report(passed=3)
    assert (
        run_tests.render(passing, RunOutput("", "", 0, None), "", 0.1, args())[1] == 0
    )
    crashed = Report(crash="build failed", crash_lines=["boom"])
    lines, code = run_tests.render(crashed, RunOutput("", "", 1, None), "", 0.1, args())
    assert (lines[0], code) == ("error: build failed", 2)
    silent = RunOutput("", "segfault", 139, None)
    lines, code = run_tests.render(Report(passed=1), silent, "", 0.1, args())
    assert code == 2
    assert "runner exited 139 but reported no failures" in lines[1]
    lines, code = run_tests.render(
        Report(skipped=2), RunOutput("", "", 0, None), "", 0.1, args()
    )
    assert (lines[1], code) == ("error: no tests ran for this selection", 2)
    generic = Report(structured=False)
    assert (
        run_tests.render(generic, RunOutput("", "", 3, None), "", 0.1, args())[1] == 1
    )


# --- CLI ---


def test_dry_run_prints_the_command_first(tmp_path: Path) -> None:
    write(tmp_path / "go.mod", "module x\n")
    result = cli(tmp_path, "--dry-run", "--repo-root", str(tmp_path))
    assert result.returncode == 0
    assert result.stdout.splitlines() == [
        "runner: go test -json ./...",
        "scope: full suite (no Git history to diff)",
    ]


def test_usage_and_detection_errors_exit_2(tmp_path: Path) -> None:
    assert cli(tmp_path, "--all", "x").returncode == 2
    result = cli(tmp_path, "--repo-root", str(tmp_path))
    assert result.returncode == 2
    assert "no test runner found" in result.stderr


def test_generic_runner_passes_exit_status_through(tmp_path: Path) -> None:
    passed = cli(tmp_path, "--repo-root", str(tmp_path), "--cmd", "true")
    assert passed.returncode == 0
    assert passed.stdout.splitlines()[0] == "runner: true"
    assert passed.stdout.splitlines()[-1].startswith("log: ")
    assert Path(passed.stdout.splitlines()[-1].removeprefix("log: ")).is_file()
    assert cli(tmp_path, "--repo-root", str(tmp_path), "--cmd", "false").returncode == 1


def pytest_project(root: Path) -> Path:
    """A tiny pytest project whose .venv python is the interpreter running these tests."""
    write(root / "pytest.ini", "[pytest]\npythonpath = .\n")
    write(root / "calc.py", "def add(a, b):\n    return a - b\n")
    write(
        root / "tests/test_calc.py",
        "from calc import add\n\n\n"
        "def test_add():\n    assert add(1, 2) == 3\n\n\n"
        "def test_zero():\n    assert add(0, 0) == 0\n",
    )
    python = write(
        root / ".venv/bin/python", f'#!/bin/sh\nexec {sys.executable} "$@"\n'
    )
    python.chmod(0o755)
    return root


def test_end_to_end_pytest_fail_rerun_fix(tmp_path: Path) -> None:
    root = pytest_project(tmp_path)
    first = cli(root, "--all", "--repo-root", str(root))
    assert first.returncode == 1, first.stdout + first.stderr
    lines = first.stdout.splitlines()
    assert lines[0].startswith("runner: .venv/bin/python -m pytest -q --tb=short")
    assert lines[2].startswith("1 passed, 1 failed, 0 skipped, 0 errors in ")
    assert "### 1. tests/test_calc.py::test_add" in lines
    assert "tests/test_calc.py:5" in lines

    rerun = cli(root, "tests/test_calc.py::test_add", "--repo-root", str(root))
    assert rerun.returncode == 1
    assert rerun.stdout.splitlines()[2].startswith("0 passed, 1 failed")

    write(root / "calc.py", "def add(a, b):\n    return a + b\n")
    fixed = cli(root, "tests/test_calc.py::test_add", "--repo-root", str(root))
    assert fixed.returncode == 0
    assert fixed.stdout.splitlines()[2].startswith("1 passed, 0 failed")


def test_end_to_end_pytest_collection_error_exits_2(tmp_path: Path) -> None:
    root = pytest_project(tmp_path)
    write(root / "tests/test_bad.py", "import missing_module\n")
    result = cli(root, "--all", "--repo-root", str(root))
    assert result.returncode == 2
    assert "error: test collection failed or the run was interrupted" in result.stdout
    assert "No module named 'missing_module'" in result.stdout


@pytest.mark.skipif(shutil.which("go") is None, reason="go is not installed")
def test_end_to_end_go_failure(tmp_path: Path) -> None:
    write(tmp_path / "go.mod", "module example.com/m\n\ngo 1.21\n")
    write(
        tmp_path / "calc/calc.go",
        "package calc\n\nfunc Add(a, b int) int { return a - b }\n",
    )
    write(
        tmp_path / "calc/calc_test.go",
        'package calc\n\nimport "testing"\n\n'
        "func TestAdd(t *testing.T) {\n"
        '\tif Add(1, 2) != 3 {\n\t\tt.Errorf("Add(1, 2) = %d", Add(1, 2))\n\t}\n}\n\n'
        "func TestZero(t *testing.T) {}\n",
    )
    result = cli(tmp_path, "--all", "--repo-root", str(tmp_path))
    assert result.returncode == 1, result.stdout + result.stderr
    lines = result.stdout.splitlines()
    assert lines[0] == "runner: go test -json ./..."
    assert lines[2].startswith("1 passed, 1 failed")
    assert lines[4:7] == [
        "### 1. calc::TestAdd",
        "calc/calc_test.go:7",
        "Add(1, 2) = -1",
    ]


def godot_binary_on_path() -> str | None:
    return os.environ.get("GODOT_BIN") or next(
        (b for b in ("godot", "godot4", "godot-mono") if shutil.which(b)), None
    )


@pytest.mark.skipif(godot_binary_on_path() is None, reason="Godot is not installed")
def test_end_to_end_godot_bare_runner_exit_code(tmp_path: Path) -> None:
    write(
        tmp_path / "project.godot",
        'config_version=5\n\n[application]\nconfig/name="T"\n',
    )
    write(
        tmp_path / "test/test_runner.gd",
        "extends SceneTree\n\nfunc _initialize() -> void:\n"
        '\tprint("Results: 0 passed, 1 failed")\n\tquit(1)\n',
    )
    result = cli(tmp_path, "--all", "--repo-root", str(tmp_path))
    assert result.returncode == 1, result.stdout + result.stderr
    assert "imports the project first" in result.stdout.splitlines()[1]
    assert "Results: 0 passed, 1 failed" in result.stdout
