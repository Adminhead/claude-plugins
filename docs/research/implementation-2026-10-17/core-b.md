# Batch core-b report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `problem-solving` | skill | Root-cause diagnosis for failures, flaky tests and performance regressions: a red-capable feedback loop, competing falsifiable hypotheses, one-variable probes and evidence-backed fixes. Also algorithm choice under unclear constraints. | archive coding-core/problem-solving; mattpocock diagnosing-bugs (MIT) | none |
| `unit-testing` | skill | Focused unit and regression tests for changed behavior or a confirmed bug, in any language: smallest proving test, test-first slices, seams and boundary-only mocks, plus pytest and Vitest/Jest references. No coverage quotas. | archive testing/unit; mattpocock tdd + tests.md + mocking.md (MIT); wshobson python-testing-patterns, javascript-testing-patterns (MIT) | none |
| `test-run` | skill (manual, `disable-model-invocation`) | Manual test-run command: detects the test runner, runs the tests affected by your changes, prints only compact failures, and fixes them in a bounded loop. | archive testing/run | none |
| `test-gap-audit` | skill | Read-only audit of missing, weak and stale tests for a repo, PR or feature: maps source to tests with a bundled script and ranks gaps P0-P3 by behavior and risk, never by coverage percentage. | archive testing/gap-audit (itself derived from awesome-copilot test-gap-audit, MIT) | none |

## What changed in each port

- **problem-solving**: step 2 is now mattpocock's explicit gate (one already-run command that is red-capable, deterministic, fast, agent-runnable; "no red-capable command, no hypotheses"). Added a "Redact first" section, optional GLOSSARY.md/ADR reads, codebase-memory tool hint, reproduce-then-minimize "every element load-bearing" criterion, the "no correct seam is itself a finding" rule and the pristine-diff check, and a cleanup checklist (step 9). `scripts/hitl-loop.template.sh` included (reviewed: plain bash `read`/`printf`, no network, no eval); changed its header so the user runs a copy with `! bash <copy>` because the Bash tool has no terminal for `read`, and kept the "never capture credentials" rule. Description and "Not for" moved to body. LICENSE carries Matt Pocock's MIT notice.
- **unit-testing**: dropped the "Efficient Testing" heading; description trimmed, "Not for" list in body; boundary-only mocking and tautological-test rules in the main workflow. `references/tdd.md` rewritten to merge mattpocock tdd: valid red, vertical slices vs horizontal slicing, seams (kept the archive's softer "confirm with the user when the interface is uncertain" rather than upstream's always-confirm), anti-patterns with examples (implementation-coupled, tautological, how-names), when to mock, DI and SDK-style interfaces. New `references/pytest.md` and `references/vitest.md` (Vitest-first with Jest differences), trimmed from ~2,000 upstream lines to ~95 and ~140; all coverage thresholds dropped (upstream's 80% rule removed). Upstream's plain `@pytest.fixture` async fixture (wrong in pytest-asyncio strict mode) corrected. LICENSE carries the mattpocock and wshobson MIT notices.
- **test-run**: ported as-is in substance; name, heading and cross-refs updated. Scripts reviewed (subprocess with argv lists only, no `shell=True`; `--cmd` gated in SKILL.md to user-given commands).
- **test-gap-audit**: renamed, description trimmed, "Not for" in body (dropped the `testing:harness` reference, which doesn't return; `security:audit` -> `security-scan`). awesome-copilot attribution kept in `coverage_map.py` and added to SKILL.md plus a LICENSE with GitHub's MIT notice.
- **Evals** moved into each plugin from the archive: problem-solving (3), unit-testing (5), test-gap-audit (3). Skill matchers rewritten to `"(?:[\w-]+:)?<name>"` (same form other implementers used). `testing-vs-e2e-browser` lost its `fires-e2e` grader (e2e-testing isn't installed in a unit-testing eval) and is now a pure hard negative (`not-unit`).

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all four: passed.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on each skill: valid.
- `cd plugins/test-run/skills/test-run && uvx pytest -q -p no:cacheprovider tests`: 45 passed. `uvx ruff check .`: clean.
- `cd plugins/test-gap-audit/skills/test-gap-audit && uvx pytest -q -p no:cacheprovider tests`: 9 passed.
- (System python has no pytest; `uvx pytest` used. Caches removed afterwards.)
- Grep for codegraph, claude-mem, coding-core, github:, testing:, Efficient, review:, playwright-cli:, experiment-loop:: none remain.
- SKILL.md descriptions: 350, 345, ~120, 331 characters. Bodies 53-83 lines.

## Version-sensitive facts checked (Context7)

- pytest 9: native `[tool.pytest]` table, cannot coexist with `[tool.pytest.ini_options]`; `strict = true` enables `strict_markers` (`/pytest-dev/pytest`).
- pytest-asyncio: strict mode is the default; async fixtures need `@pytest_asyncio.fixture`; plain `@pytest.fixture` on async warns and will error (readthedocs stable).
- Vitest v4: `vi.mock` hoisting and `vi.hoisted`, `vi.doMock`; `test.workspace` -> `test.projects`; `poolOptions` removed to top-level (`/vitest-dev/vitest`).
- Not checked against docs: Jest's `mock`-prefix rule for hoisted factory variables, `advanceTimersByTimeAsync` naming (both long-standing).

## Deviations

- `test-run` description says the command is `/test-run:test-run` (plugin skills are namespaced); the plan just says "manual". If Claude Code shortens same-name plugin skills to `/test-run`, update the SKILL.md description.
- `unit-testing` seam confirmation kept softer than mattpocock's mandatory "confirm seams with the user first", to match the archive's lean default.

## Unverified / TODO

- Evals not run (`claude plugin eval` costs model calls and needs registration). The problem-solving `not-coding` and unit-testing `not-e2e` graders only bite if those plugins are installed in the eval sandbox.
- hitl-loop template not exercised interactively.

## Suggested follow-ups

- Add a trigger eval for `problem-solving` vs `unit-testing` on "write a regression test for this fixed bug" (should be unit-testing).
- Coordinator: register the four plugins; `programming-core` should list `problem-solving`, `unit-testing`, `test-run`; `test-gap-audit` is a direct install per the plan's Workflow group.
