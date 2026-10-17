---
name: harness
description: Generate unit and integration tests for functions added or changed on the current branch (or a given path or symbol), run them with the /testing:run runner, and return a compact report. Manual command (/testing:harness).
disable-model-invocation: true
argument-hint: "[path|symbol]"
context: fork
model: sonnet
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scope.sh), Bash(${CLAUDE_SKILL_DIR}/scope.sh *), Bash(python3 ${CLAUDE_PLUGIN_ROOT}/skills/run/scripts/run_tests.py *)
---

# Test Harness

Write tests for new or changed functions, run them, and report. You have no conversation history, and your final message is the report the user sees, so keep it compact.

## Scope

!`${CLAUDE_SKILL_DIR}/scope.sh $ARGUMENTS`

Each changed file lists its hunks as new-file line ranges. The name after `in` is git's nearest function above the hunk, so for an added function it names the neighbor. Lines starting with `+` are definitions the change added. Work only inside this scope. If it shows no git repository or no changed source files, say so in one line and stop.

## 1. Read cheaply

- If `.codegraph/` exists at the repo root, call `codegraph_explore` with the changed symbol names. One call returns their source, callers, and existing tests.
- Otherwise, read only the functions around the listed line ranges, then find the nearest existing test for each module (same directory, or the mirrored path under the test root).
- Load `testing:unit` and follow it for choosing cases and writing discriminating tests.
- Learn the conventions from the nearest test file: framework, fixtures, factories, naming, and placement.

## 2. Plan cases

For each changed function, list the behaviors to cover:

- the happy path;
- boundaries and error paths the code itself handles, such as explicit checks, raises, and branches;
- edge cases the code implies, not speculative inputs.

Skip trivial code (getters, pure pass-through, plain delegation) and note it for the report.

## 3. Write tests

- Add to the nearest existing test file for that module. Otherwise create one named and placed like its siblings.
- Match the repo's style. Don't add comments that narrate how the test came about.
- Add integration tests only where the repo already has an integration harness. Never scaffold a framework or add dependencies; report the gap instead.
- Never edit product code.

## 4. Run

From the repo root, with a Bash timeout of 600000 ms, target only the test files or ids you touched:

```sh
python3 ${CLAUDE_PLUGIN_ROOT}/skills/run/scripts/run_tests.py <test files or ids>
```

Exit 0 means pass, 1 means test failures, and 2 means a collection, compile, or runner error. Work from its compact failure blocks; open the logged raw output only when a block isn't enough.

For each failing new test, decide whether the test or the product is wrong. Judge by the contract in names, docstrings, types, and callers, never by what the code happens to return.

- **Wrong test:** fix it and rerun that id. Allow at most 3 attempts per test, then drop it and list it under gaps.
- **Product bug:** keep the failing test as written. Don't skip it, mark it expected-fail, or weaken it, and don't touch product code. The user decides whether to fix the code or drop the test.
- **Exit 2:** fix the error if it's in a file you wrote. Otherwise report the environment problem and stop.

## 5. Report

Return only this, with empty sections omitted:

```text
Scope: <scope line>
Tests added:
- <symbol> → <test file>: <case>, <case>, …
Skipped: <symbol> — <reason>
Runner: <runner line> → <n> passed, <m> failed
Suspected product bugs:
- <symbol>: <input> → expected <x> per <contract source>, got <y> (<test id>, left failing)
Gaps: <no integration harness | untestable without refactor | dropped after 3 attempts>, one line each
```
