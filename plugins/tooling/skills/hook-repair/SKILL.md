---
name: hook-repair
description: Repair a failing pre-commit or prek hook by rerunning the exact hook, fixing only what it reports, and rerunning it to confirm. Handles formatter hooks that rewrite files and linter or type-check hooks that report findings. Use when a commit, `prek run`, or `pre-commit run` fails on a hook and the user wants it fixed, or when a task says "resolve the hook failure". Leaves the fix uncommitted. Not for setting up or updating hooks (`tooling:pre-commit`).
---

# Repairing a failing hook

A hook failure is a finding in the code, so the repair is a code change. Weakening the check would hide the finding and pass it on to CI and the next author, so every step below fixes the code and leaves the check as it is.

## Capture the starting state

1. Note the failing hook's exact id from the output (the name before the dots, or `id:` in `.pre-commit-config.yaml`), and which files it ran on: staged files for a commit, or `--all-files`.
2. Record what is staged and what is dirty (`git status --porcelain`). The repair ends with the same staged set.
3. Find the tool: `prek` if installed, else `pre-commit`. Both read the same config.

## Reproduce

Rerun only that hook, on the same file selection:

```
prek run <hook-id> --show-diff-on-failure            # staged files, as in a commit
prek run <hook-id> --all-files --show-diff-on-failure
prek run <hook-id> --files path/a path/b             # a narrower, known set
```

Use `pre-commit run` with the same arguments when prek is absent. Read the output before editing. If the hook passes on rerun, the earlier failure was a formatter's first pass or a stale run, so confirm and stop.

## Classify and fix

| Hook output | Meaning | Action |
| --- | --- | --- |
| "files were modified by this hook" (formatter, fixer, end-of-file, trailing whitespace) | The hook already rewrote the files. The failure only says the commit saw different bytes. | Read the diff to confirm it is the formatting you expect. Re-stage the files that were staged before (`git add <those paths>`), then rerun the hook. |
| File and line findings (linter, type checker, secret scan, test) | The code violates a rule. | Change the code so the rule holds. Touch only the reported files and lines. |
| Hook can't run (missing tool, bad `rev`, network, `language: system` binary absent) | An environment problem, not a code finding. | Report the cause. Fixing the toolchain is `tooling:pre-commit` work. |

Fix at the cause. A type error means fixing the types, and a failing test means fixing the code under test. For an auto-fixable linter (`ruff --fix`, `eslint --fix`), run it only on the reported files, then read the diff it made.

## Do not

- Suppress a rule: no `# noqa`, `# type: ignore`, `eslint-disable`, `#[allow]`, `nolint`, or entries in `ignore`, `exclude`, or `per-file-ignores`. Add one only when the user asks, or when the finding is a false positive you can explain, and then state it in the report.
- Weaken a test (loosened assertion, skip, deleted case) to turn a hook green.
- Bulk-reformat. Run formatters on the reported files, not the repo, because unrelated churn buries the real change and breaks blame.
- Skip the hook: no `--no-verify`, `SKIP=<id>`, or edits to the hook config to disable or loosen it.
- Edit `.pre-commit-config.yaml` to make a failure go away. Config changes belong to `tooling:pre-commit`.

## Confirm

1. Rerun the exact hook from the Reproduce step and expect a pass.
2. Rerun the full set once (`prek run` on the same selection) when more than one hook was failing, because one fix can trip another hook.
3. Stop after three rounds that don't converge, and report what each round changed and what still fails.

## Leave the tree as found

Don't commit. Check `git status --porcelain` against the starting record: the staged set should match what it was, plus nothing new staged beyond files a formatter rewrote. Report the hook id, the findings, the files changed, and the rerun result. A hook that passes after an unstaged rewrite still needs the user's commit to carry the rewritten bytes.
