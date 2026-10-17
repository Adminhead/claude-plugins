---
name: review-loop
description: Runs a review, fix and re-review loop on a diff until it is approved, using built-in /code-review for the first pass and a findings file so later rounds check only what was flagged. Use when a finished change needs review plus fixes ("review and fix until clean", "loop review on this branch") or flagged findings must be fixed and re-verified.
---

# Review Loop

Review a change, fix exactly what was flagged, and re-review only that, for at most three rounds. A findings file carries state between rounds, so no one re-reads the whole diff or re-argues settled points.

Not for writing plans (`planning`), a read-only review with no fixes (`/code-review` alone, or `second-opinion` for another model family), or executing a multi-slice plan (`implement-plan`), each if installed.

Three roles, kept apart so the reviewer never edits and never grades its own fixes:

- **Reviewer (round 1):** built-in `/code-review`.
- **Fixer:** a subagent (`coder` if installed, otherwise general-purpose), or yourself for a one-line fix.
- **Re-reviewer (rounds 2 and 3):** a fresh read-only subagent each round (`reviewer` if installed, otherwise general-purpose).

## Findings file

Pick a slug for the change and keep findings in `<scratchpad>/review-<slug>.md`, in the session scratchpad directory. You write round 1 from the `/code-review` output; the re-reviewers append later rounds. Format:

```
# Review <slug>
Target: main...HEAD
## Round 1 (HEAD <sha>, /code-review high)
- F1 | high | src/auth.py:42 | Token compared with ==, not constant-time.
- F2 | low | src/auth.py:90 | Unused import.
- F3 | dismissed | src/db.py:12 | Claimed missing close; the context manager closes it.
VERDICT: CHANGES REQUIRED
```

- One line per finding: ID, severity (`high`, `medium`, `low`, or `dismissed` with the reason), `path:line`, and a claim a fixer can act on without asking.
- IDs are stable. Later rounds append `## Round N`, restate each original ID as `fixed`, `open` or `dismissed`, and add new IDs only for regressions the fixes caused.
- The last line of each round is `VERDICT: APPROVED` or `VERDICT: CHANGES REQUIRED`.

## Procedure

1. **Round 1: run `/code-review`.** Invoke the `code-review` skill with an effort level and the target, for example `high` for the working tree or `high main` for a branch. Pick `medium` for a small change, `high` by default, `xhigh` for security, data or concurrency work. Do not pass `--fix`: fixes go through the fixer so each one maps to an ID.
2. **Write the findings file.** Copy each finding in as one line with an ID. If `/code-review` reports nothing, write `VERDICT: APPROVED`, stop and report.
3. **Triage.** Check each finding against the code. Mark the ones you can disprove `dismissed` with the reason, and keep the rest. If none remain, the verdict is `APPROVED`.
4. **Brief the fixer.** Name the findings file and the IDs to fix: "fix exactly these IDs, preserve unrelated edits". Tell it not to refactor, rename, or touch other findings' lines, and to run the cheapest check that covers each fix (a single test, a type check, a lint). Commit only if the user asked for commits.
5. **Re-review with a fresh subagent.** Give it the findings file path, the target, the new HEAD and the acceptance criteria, and nothing of the implementer's or fixer's reasoning. Tell it to read the code, change nothing, check only the open IDs plus regressions in the lines the fix touched (`git diff <previous sha>`), append `## Round N` and end with a verdict. Start a new subagent every round: a reused one anchors on its earlier verdict.
6. **Loop or stop.** On `APPROVED`, stop. Otherwise triage the new round (step 3) and go back to step 4.
7. **Cap at three rounds.** If round 3 still reads `CHANGES REQUIRED`, stop and report the open IDs, what each round changed, and your read on why they persist. Repeated failure usually means a subjective finding or an unclear spec, which is the user's call.

Run the re-review and the fixer as subagents so their file reads stay out of your context. If no subagents are available, do the fixes yourself and run `/code-review` again on the fix diff as the re-review, then reconcile its output with the open IDs.

## Report

State the final verdict, rounds used, IDs fixed, IDs still open, the checks the fixer ran, and the findings file path. List dismissed findings with the reason.
