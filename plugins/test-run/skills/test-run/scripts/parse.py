"""Turn raw test-runner output into a compact list of failures."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

CRASH_LINES = 40
ANSI_RE = re.compile(r"(?:\x1b|#x1B)\[[0-9;]*[A-Za-z]")


@dataclass(frozen=True)
class RunOutput:
    stdout: str
    stderr: str
    code: int
    report: str | None  # contents of the runner's structured report file, if any


@dataclass
class Failure:
    path: str | None  # project-relative file or package the test lives in
    name: str
    location: str  # "file:line" of the failing line, or ""
    message: list[str]
    trace: list[str]


@dataclass
class Report:
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    errors: int = 0
    failures: list[Failure] = field(default_factory=list)
    crash: str | None = None  # headline when the run broke before reporting tests
    crash_lines: list[str] = field(default_factory=list)
    structured: bool = True


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def relativize(text: str, root: Path) -> str:
    return text.replace("file://", "").replace(f"{root}/", "")


def crash(headline: str, text: str, start: re.Pattern[str] | None = None) -> Report:
    """A crash report holding the error excerpt, or the output tail when none is found."""
    lines = strip_ansi(text).splitlines()
    first = next(
        (i for i, line in enumerate(lines) if start and start.search(line)), None
    )
    if first is None:
        return Report(
            crash=f"{headline} (output tail)", crash_lines=lines[-CRASH_LINES:]
        )
    return Report(crash=headline, crash_lines=lines[first : first + CRASH_LINES])


# --- pytest (JUnit XML, xunit1) ---

PYTEST_EXIT = {
    2: "test collection failed or the run was interrupted",
    3: "pytest internal error",
    4: "pytest usage error",
    5: "no tests collected",
}
PYTEST_ERRORS = re.compile(r"^=+ ERRORS =+$|^ERROR: ")
PY_FRAME = re.compile(r"^(\S.*?):(\d+): in ")
PY_FRAMEWORK = ("site-packages", "/_pytest/", "/pluggy/", "<frozen", "/lib/python3")


def pytest_detail(text: str) -> tuple[str, list[str], list[str]]:
    """Split a --tb=short traceback into location, message, and user-code trace."""
    blocks: list[list[str]] = []
    message = []
    for line in strip_ansi(text).splitlines():
        if line.startswith("E "):
            message.append(re.sub(r"^E {0,3}", "", line))
        elif PY_FRAME.match(line) or not blocks:
            blocks.append([line])
        elif not re.fullmatch(r"\s*\^+\s*", line):
            blocks[-1].append(line)
    kept = [b for b in blocks if not any(m in b[0] for m in PY_FRAMEWORK)]
    frames = [m for b in kept if (m := PY_FRAME.match(b[0]))]
    location = f"{frames[-1][1]}:{frames[-1][2]}" if frames else ""
    return location, message, [line for b in kept for line in b]


def parse_pytest(run: RunOutput, root: Path) -> Report:
    output = run.stdout + run.stderr
    if run.code not in {0, 1} or run.report is None:
        headline = PYTEST_EXIT.get(
            run.code, f"pytest exited {run.code} without a report"
        )
        return crash(headline, output, PYTEST_ERRORS)
    report = Report()
    for case in ET.fromstring(run.report).iter("testcase"):
        outcome = next(
            (c for c in case if c.tag in {"failure", "error", "skipped"}), None
        )
        if outcome is None:
            report.passed += 1
            continue
        if outcome.tag == "skipped":
            report.skipped += 1
            continue
        if outcome.get("message") == "collection failure":
            return crash(PYTEST_EXIT[2], output, PYTEST_ERRORS)
        if outcome.tag == "failure":
            report.failed += 1
        else:
            report.errors += 1
        path = case.get("file")
        classname, name = case.get("classname", ""), case.get("name", "")
        module = (path or "").removesuffix(".py").replace("/", ".")
        if classname.startswith(f"{module}."):
            name = f"{classname[len(module) + 1 :]}::{name}"
        location, message, trace = pytest_detail(outcome.text or "")
        message = message or (outcome.get("message") or "").splitlines()
        report.failures.append(Failure(path, name, location, message, trace))
    return report


# --- go test -json ---

GO_NOISE = re.compile(r"^\s*(=== (RUN|PAUSE|CONT|NAME)|--- (FAIL|PASS|SKIP):)")
GO_LOC = re.compile(r"^\s+(\S+\.go):(\d+): ?(.*)$")
GO_FRAMEWORK = ("testing.", "runtime.", "panic(", "created by testing.")


def go_module(root: Path) -> str:
    go_mod = root / "go.mod"
    text = go_mod.read_text(encoding="utf-8") if go_mod.is_file() else ""
    match = re.search(r"^module\s+(\S+)", text, re.MULTILINE)
    return match[1] if match else ""


def package_dir(package: str, module: str) -> str:
    if module and (package == module or package.startswith(f"{module}/")):
        return package[len(module) + 1 :] or "."
    return package


def go_detail(
    raw: list[str], pkg_dir: str, root: Path
) -> tuple[str, list[str], list[str]]:
    lines = [
        relativize(line.rstrip("\n"), root)
        for line in raw
        if line.strip() and not GO_NOISE.match(line)
    ]
    prefix = "" if pkg_dir == "." else f"{pkg_dir}/"
    for i, line in enumerate(lines):
        if match := GO_LOC.match(line):
            rest = lines[i + 1 :]
            end = next((j for j, r in enumerate(rest) if GO_LOC.match(r)), len(rest))
            message = [match[3], *(r.strip() for r in rest[:end])]
            return f"{prefix}{match[1]}:{match[2]}", message, rest[end:]
    start = next(
        (i for i, x in enumerate(lines) if x.startswith("goroutine ")), len(lines)
    )
    trace, location = [], ""
    for func, place in zip(lines[start + 1 :: 2], lines[start + 2 :: 2], strict=False):
        if func.startswith(GO_FRAMEWORK):
            continue
        place = place.strip().split(" +0x")[0]
        location = location or place
        trace.append(f"{func}  {place}")
    return location, lines[:start], trace


def parse_go(run: RunOutput, root: Path) -> Report:
    module = go_module(root)
    events, stray = [], []
    for line in run.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            stray.append(line)
            continue
        if isinstance(event, dict):
            events.append(event)
        else:
            stray.append(line)
    build = [e.get("Output", "") for e in events if e.get("Action") == "build-output"]
    outputs: dict[tuple[str, str | None], list[str]] = defaultdict(list)
    status: dict[tuple[str, str | None], str] = {}
    build_failed = False
    for event in events:
        action, key = event.get("Action"), (event.get("Package", ""), event.get("Test"))
        if action == "output":
            outputs[key].append(event.get("Output", ""))
        elif action in {"pass", "fail", "skip"}:
            status[key] = action
        build_failed |= action == "build-fail" or bool(event.get("FailedBuild"))
    package_text = "".join(
        o for (_, test), lines in outputs.items() if test is None for o in lines
    )
    if build or build_failed or "[setup failed]" in package_text:
        text = "".join(build) + run.stderr + "\n".join(stray)
        return crash("build failed", relativize(text, root), re.compile(r"\S"))
    if run.code != 0 and not status:
        text = run.stderr + "\n".join(stray)
        return crash(f"go test exited {run.code}", text, re.compile(r"\S"))

    report = Report()
    for (_, test), action in status.items():
        if test is not None:
            report.passed += action == "pass"
            report.failed += action == "fail"
            report.skipped += action == "skip"
    failing = [key for key, action in status.items() if action == "fail" and key[1]]
    for pkg, test in failing:
        if any(p == pkg and t.startswith(f"{test}/") for p, t in failing):
            continue
        pkg_dir = package_dir(pkg, module)
        location, message, trace = go_detail(outputs[(pkg, test)], pkg_dir, root)
        report.failures.append(Failure(pkg_dir, test, location, message, trace))
    for (pkg, test), action in status.items():
        if test is None and action == "fail" and not any(p == pkg for p, _ in failing):
            pkg_dir = package_dir(pkg, module)
            location, message, trace = go_detail(outputs[(pkg, None)], pkg_dir, root)
            report.errors += 1
            report.failures.append(
                Failure(pkg_dir, "(package)", location, message, trace)
            )
    return report


# --- jest and vitest (jest-compatible JSON) ---

JS_FRAME = re.compile(r"^\s+at ")
JS_PLACE = re.compile(r"\(?([^\s()]+):(\d+):\d+\)?$")
JS_FRAMEWORK = ("node_modules", "node:internal", "(<anonymous>)")


def js_detail(
    assertion: dict, file: str, root: Path
) -> tuple[str, list[str], list[str]]:
    text = relativize(
        strip_ansi("\n".join(assertion.get("failureMessages") or [])), root
    )
    lines = text.splitlines()
    first = next(
        (i for i, line in enumerate(lines) if JS_FRAME.match(line)), len(lines)
    )
    message = [line for line in lines[:first] if line.strip()]
    trace = [
        line.strip()
        for line in lines[first:]
        if JS_FRAME.match(line) and not any(m in line for m in JS_FRAMEWORK)
    ]
    places = [m for line in trace if (m := JS_PLACE.search(line))]
    in_test = [m for m in places if m[1] == file]
    if place := (in_test or places or [None])[0]:
        return f"{place[1]}:{place[2]}", message, trace
    line = (assertion.get("location") or {}).get("line")
    return (f"{file}:{line}" if line else ""), message, trace


def parse_jest(run: RunOutput, root: Path) -> Report:
    output = run.stdout + run.stderr
    if run.report is None:
        return crash("runner wrote no JSON report", output, re.compile(r"(?i)error"))
    try:
        data = json.loads(run.report)
    except json.JSONDecodeError as exc:
        return crash(f"unreadable JSON report: {exc}", output)
    report = Report(
        passed=data.get("numPassedTests", 0),
        failed=data.get("numFailedTests", 0),
        skipped=data.get("numPendingTests", 0) + data.get("numTodoTests", 0),
    )
    load_errors: list[str] = []
    broken = 0
    for suite in data.get("testResults", []):
        file = relativize(suite.get("name", ""), root)
        results = suite.get("assertionResults", [])
        if suite.get("status") == "failed" and not results:
            message = relativize(strip_ansi(suite.get("message", "")), root)
            load_errors += [f"{file}:", *message.splitlines()]
            broken += 1
        for assertion in results:
            if assertion.get("status") != "failed":
                continue
            name = " > ".join(
                [*assertion.get("ancestorTitles", []), assertion["title"]]
            )
            location, message, trace = js_detail(assertion, file, root)
            report.failures.append(Failure(file, name, location, message, trace))
    if broken:
        return Report(
            crash=f"{broken} test file(s) failed to load",
            crash_lines=load_errors[:CRASH_LINES],
        )
    return report


# --- cargo test (libtest text) ---

CARGO_RESULT = re.compile(
    r"^test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored"
)
CARGO_STATUS = re.compile(r"^test (.+) \.\.\. FAILED$")
CARGO_SECTION = re.compile(r"^---- (.+) stdout ----$")
CARGO_PANIC = re.compile(r"panicked at (?:'(.*)', )?(\S+?:\d+):\d+:?$")
CARGO_ERROR = re.compile(
    r"^error(\[E\d+\])?: (?!test failed|doctest failed|\d+ targets? failed)"
)
RUST_FRAMEWORK = ("core::", "std::", "/rustc/", "test::", "__rust")


def cargo_detail(section: list[str]) -> tuple[str, list[str], list[str]]:
    lines = [
        line
        for line in section
        if line.strip() and not line.startswith("note: run with")
    ]
    for i, line in enumerate(lines):
        if match := CARGO_PANIC.search(line):
            rest = lines[i + 1 :]
            end = next(
                (j for j, r in enumerate(rest) if r.startswith("stack backtrace:")),
                len(rest),
            )
            message = [match[1]] if match[1] else rest[:end]
            trace = [
                r for r in rest[end + 1 :] if not any(m in r for m in RUST_FRAMEWORK)
            ]
            return match[2], message, trace
    return "", lines, []


def parse_cargo(run: RunOutput, root: Path) -> Report:
    output = strip_ansi(run.stdout + run.stderr)
    lines = output.splitlines()
    results = [m for line in lines if (m := CARGO_RESULT.match(line))]
    if "error: could not compile" in output or (run.code != 0 and not results):
        headline = (
            "compilation failed"
            if results or "error" in output
            else "cargo test failed"
        )
        return crash(headline, relativize(output, root), CARGO_ERROR)
    report = Report(
        passed=sum(int(m[1]) for m in results),
        failed=sum(int(m[2]) for m in results),
        skipped=sum(int(m[3]) for m in results),
    )
    sections: dict[str, list[str]] = {}
    current: list[str] | None = None
    for line in lines:
        if match := CARGO_SECTION.match(line):
            current = sections.setdefault(match[1], [])
        elif line == "failures:" or CARGO_RESULT.match(line):
            current = None
        elif current is not None:
            current.append(line)
    for line in lines:
        if match := CARGO_STATUS.match(line):
            location, message, trace = cargo_detail(sections.get(match[1], []))
            report.failures.append(Failure(None, match[1], location, message, trace))
    return report


# --- dotnet test (VSTest or Microsoft.Testing.Platform console output) ---

VSTEST_SUMMARY = re.compile(
    r"^(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+), Passed:\s+(\d+), Skipped:\s+(\d+)"
)
VSTEST_STATUS = re.compile(r"^  (Passed|Failed|Skipped) (.+?) \[[^\]]*\]$")
VSTEST_SECTION = re.compile(r"^  ([A-Z][\w ]+):$")
MTP_STATUS = re.compile(
    r"^(failed|passed|skipped|error|timed out|canceled) (.+) \(.*\)$"
)
MTP_COUNT = re.compile(r"^\s+(total|failed|succeeded|skipped): (\d+)$")
NET_FRAME = re.compile(r"^at (.+?)(?: in (.+?):(?:line )?(\d+))?$")
NET_FRAMEWORK = (
    "System.",
    "Microsoft.",
    "Xunit.",
    "NUnit.",
    "TUnit.",
    "MSTest.",
    "Castle.",
    "Moq.",
    "NSubstitute.",
)
MSBUILD_ERROR = re.compile(
    r": error [A-Z]+\d*:|^\s*error [A-Z]*\d*:|didn't execute properly"
)


def net_detail(
    message: list[str], frames: list[str]
) -> tuple[str, list[str], list[str]]:
    trace, location = [], ""
    for frame in frames:
        match = NET_FRAME.match(frame.strip())
        if not match or match[1].startswith(NET_FRAMEWORK):
            continue
        if match[2]:
            place = f"{match[2]}:{match[3]}"
            location = location or place
            trace.append(f"at {match[1]}  {place}")
        else:
            trace.append(f"at {match[1]}")
    return location, [m.strip() for m in message if m.strip()], trace


def vstest_failures(lines: list[str]) -> list[Failure]:
    failures, current, section = [], None, ""
    for line in lines:
        if status := VSTEST_STATUS.match(line):
            current = None
            if status[1] == "Failed":
                current = {"name": status[2], "Error Message": [], "Stack Trace": []}
                failures.append(current)
        elif VSTEST_SUMMARY.match(line) or line.startswith(
            ("Results File:", "Total tests:")
        ):
            current = None
        elif current is not None and (header := VSTEST_SECTION.match(line)):
            section = header[1]
        elif current is not None and section in current:
            current[section].append(line)
    result = []
    for f in failures:
        location, message, trace = net_detail(f["Error Message"], f["Stack Trace"])
        result.append(Failure(None, f["name"], location, message, trace))
    return result


def mtp_failures(lines: list[str]) -> list[Failure]:
    result, current = [], None
    for line in lines:
        if status := MTP_STATUS.match(line):
            current = [] if status[1] in {"failed", "error", "timed out"} else None
            if current is not None:
                result.append((status[2], current))
        elif current is not None and line.startswith(" "):
            current.append(line)
        else:
            current = None
    failures = []
    for name, body in result:
        body = [b for b in body if not b.strip().startswith("from ")]
        frames = [b for b in body if b.strip().startswith("at ")]
        message = [b for b in body if not b.strip().startswith("at ")]
        location, message, trace = net_detail(message, frames)
        failures.append(Failure(None, name, location, message, trace))
    return failures


def parse_dotnet(run: RunOutput, root: Path) -> Report:
    output = relativize(strip_ansi(run.stdout + run.stderr), root)
    lines = output.splitlines()
    vstest = [m for line in lines if (m := VSTEST_SUMMARY.match(line))]
    totals = [line for line in lines if re.match(r"^\s+total: \d+$", line)]
    if vstest:
        return Report(
            passed=sum(int(m[2]) for m in vstest),
            failed=sum(int(m[1]) for m in vstest),
            skipped=sum(int(m[3]) for m in vstest),
            failures=vstest_failures(lines),
        )
    if totals:
        start = len(lines) - lines[::-1].index(totals[-1]) - 1
        counts = {}
        for line in lines[start:]:
            if not (match := MTP_COUNT.match(line)):
                break
            counts[match[1]] = int(match[2])
        return Report(
            passed=counts.get("succeeded", 0),
            failed=counts.get("failed", 0),
            skipped=counts.get("skipped", 0),
            failures=mtp_failures(lines),
        )
    errors = [line for line in dict.fromkeys(lines) if MSBUILD_ERROR.search(line)]
    if errors:
        return Report(crash="build failed", crash_lines=errors[:CRASH_LINES])
    return crash(f"dotnet test exited {run.code} without a test summary", output)


# --- Godot: GUT (JUnit XML) and gdUnit4 (console) ---

GODOT_ERROR = re.compile(r"^(?:SCRIPT )?ERROR: (.*)$")
GODOT_FRAME = re.compile(r"^\s+\[\d+\] (\S+) \(res://(.+?):(\d+)\)$")
GODOT_PARSE_ERROR = re.compile(
    r"^SCRIPT ERROR: Parse Error|^ERROR: Failed to load script"
)
GUT_LINE = re.compile(r"^\s*at line (-?\d+)\s*$")


def godot_errors(text: str) -> list[tuple[str, list[tuple[str, str, str]]]]:
    """Each engine error headline with its GDScript backtrace frames (func, path, line)."""
    blocks: list[tuple[str, list[tuple[str, str, str]]]] = []
    for line in strip_ansi(text).splitlines():
        if match := GODOT_ERROR.match(line):
            blocks.append((match[1], []))
        elif blocks and (frame := GODOT_FRAME.match(line)):
            blocks[-1][1].append((frame[1], frame[2], frame[3]))
    return blocks


def user_frames(frames: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    return [f for f in frames if not f[1].startswith("addons/")]


def parse_gut(run: RunOutput, root: Path) -> Report:
    del root
    output = run.stdout + run.stderr
    lines = strip_ansi(output).splitlines()
    if any(GODOT_PARSE_ERROR.match(line) for line in lines):
        return crash(
            "script parse error (GUT skips scripts that fail to load)",
            output,
            GODOT_PARSE_ERROR,
        )
    if run.report is None:
        return crash(
            f"GUT exited {run.code} without a JUnit report", output, GODOT_ERROR
        )
    report = Report()
    for case in ET.fromstring(run.report).iter("testcase"):
        outcome = next(
            (c for c in case if c.tag in {"failure", "error", "skipped"}), None
        )
        if outcome is None:
            report.passed += 1
            continue
        if outcome.tag == "skipped":
            report.skipped += 1
            continue
        if outcome.tag == "failure":
            report.failed += 1
        else:
            report.errors += 1
        path, name = case.get("classname", ""), case.get("name", "")
        location, message = "", []
        for line in (outcome.text or "").splitlines():
            if match := GUT_LINE.match(line):
                location = location or (
                    f"{path}:{match[1]}" if int(match[1]) > 0 else ""
                )
            elif line.strip():
                message.append(line.strip())
        trace = []
        for headline, frames in godot_errors(run.stderr):
            if any(f[0] == name and f[1] == path for f in frames):
                kept = user_frames(frames)
                trace = [f"{f[0]}  {f[1]}:{f[2]}" for f in kept]
                message = message or [headline]
                location = location or (f"{kept[0][1]}:{kept[0][2]}" if kept else "")
                break
        report.failures.append(Failure(path or None, name, location, message, trace))
    return report


GDUNIT_EXIT = {
    103: "gdUnit4 refused headless mode (pass --ignoreHeadlessMode)",
    104: "this gdUnit4 version does not support the Godot version",
    105: "script errors detected during test discovery",
}
GDUNIT_STATUS = re.compile(
    r"^\s*res://(\S+) > (\S+) (STARTED|PASSED|FAILED|ERROR\w*)\b"
)
GDUNIT_SUMMARY = re.compile(
    r"Overall Summary: (\d+) test cases \| (\d+) errors \| (\d+) failures"
    r".*?\| (\d+) skipped"
)
GDUNIT_AT = re.compile(r"\bat '([^']+)' in res://(\S+?):(\d+)")


def parse_gdunit4(run: RunOutput, root: Path) -> Report:
    del root
    output = strip_ansi(run.stdout + run.stderr)
    lines = output.splitlines()
    summary = next((m for line in lines if (m := GDUNIT_SUMMARY.search(line))), None)
    if run.code in GDUNIT_EXIT or summary is None:
        headline = GDUNIT_EXIT.get(
            run.code, f"gdUnit4 exited {run.code} without a summary"
        )
        return crash(headline, output, re.compile(r"Script errors|Abnormal exit|ERROR"))
    cases, errors, failures, skipped = (int(g) for g in summary.groups())
    report = Report(
        passed=max(cases - errors - failures - skipped, 0),
        failed=failures,
        skipped=skipped,
        errors=errors,
    )
    current: list[str] | None = None
    blocks: list[tuple[str, str, list[str]]] = []
    for line in lines:
        if status := GDUNIT_STATUS.match(line):
            current = None
            if status[3] not in {"STARTED", "PASSED"}:
                current = []
                blocks.append((status[1], status[2], current))
        elif line.startswith(("Statistics:", "Overall Summary:", "Run Test Suite:")):
            current = None
        elif current is not None and line.strip() and line.strip() != "Report:":
            current.append(line)
    for path, name, body in blocks:
        message, trace = [], []
        for line in body:
            head = line.split("\tat ", 1)[0].strip()
            if head and not GDUNIT_AT.match(head):
                message.append(head)
            trace += [f"{m[1]}  {m[2]}:{m[3]}" for m in GDUNIT_AT.finditer(line)]
        location = trace[0].split("  ", 1)[1] if trace else ""
        report.failures.append(Failure(path, name, location, message, trace))
    return report


def parse_generic(run: RunOutput, root: Path) -> Report:
    del run, root
    return Report(structured=False)


PARSERS = {
    "pytest": parse_pytest,
    "go": parse_go,
    "jest": parse_jest,
    "vitest": parse_jest,
    "cargo": parse_cargo,
    "dotnet": parse_dotnet,
    "gut": parse_gut,
    "gdunit4": parse_gdunit4,
}


def parse(kind: str, run: RunOutput, root: Path) -> Report:
    return PARSERS.get(kind, parse_generic)(run, root)
