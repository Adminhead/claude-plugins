---
name: test
description: Run the project's tests, show only compact failures, and fix them in a bounded loop. Manual command (/quality:test).
disable-model-invocation: true
argument-hint: "[path|pattern] [--all] [--cmd \"…\"]"
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py *)
---

# Test

`run_tests.py` detects the runner, picks the tests, runs them, and prints only the failures. Work from its output. Open the raw log only when a failure block isn't enough to diagnose.

## 1. Run

From the project root, run this with a Bash timeout of 600000 ms:

```sh
python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py $ARGUMENTS
```

- With no arguments it runs the tests affected by changes against the default branch, or the full suite when nothing maps. The `scope:` line says which.
- Pass `--cmd` only with a command the user gave. The script is pre-approved, so `--cmd` would otherwise run an unreviewed command.
- Run `--help` for the other flags.

Output starts with `runner:` (the exact command) and `scope:`, then a summary line and one `### n. <id>` block per failure with its location, message, and user-code trace. The last line is `log: <path>` to the full raw output.

| Exit | Meaning | Next step |
| --- | --- | --- |
| 0 | All selected tests passed | Report the result and its scope. Stop. |
| 1 | Test failures | Go to step 2. |
| 2 | Usage, detection, or runner error (collection or compile error, no tests ran) | Read the `error:` block. Fix a code error like a failure. For detection problems, rerun with a target path or ask the user for `--cmd`. Treat a missing tool or dependency as environmental. |

## 2. Fix loop

For each failure:

1. Diagnose the root cause before editing. Read the failing line and the code under test. Treat production code as the suspect first.
2. Make the smallest fix. Never weaken assertions, broaden matchers, delete tests, or add skips.
3. Rerun only the failing tests. Each `### n.` id is a valid target:

   ```sh
   python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py "<id>" ["<id>" ...]
   ```

   Keep passing the original `--cmd`, if any.
4. Allow at most 3 materially distinct attempts per failure. After the third, stop working on it and record it as remaining.

Stop and ask the user with AskUserQuestion, explaining each option, when:

- the fix would change intended behavior;
- the test itself looks wrong (say what it asserts and why that seems incorrect);
- the failure is environmental or flaky (missing service, credentials, network, timing, or a failure that changes between identical runs).

For deeper method, use `efficient:problem-solving` for hard diagnoses and `efficient:testing` for test-quality questions.

## 3. Confirm

Once every targeted failure passes, run the full suite once with `--all`. Treat new failures from it with the same loop, within the same attempt budget.

## 4. Report

- Each failure: id, root cause, fix (file), result.
- Remaining failures and why they remain.
- Checks not run, such as the full suite when the loop stopped early, or tests skipped by scope.
