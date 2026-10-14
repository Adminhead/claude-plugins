---
name: review-loop
description: Run a review, fix, re-review loop on a diff until a reviewer approves, with findings kept in one file so each round checks only what was flagged. Use when a finished change needs review plus fixes ("review and fix until clean", "loop review on this branch"), or when a reviewer's findings must be fixed and re-verified without reviewing everything again. Unlike review:second-opinion, which is read-only and never fixes, this loop dispatches a fixer between rounds. Not for writing plans (coding-core:planning), a single read-only review (review:second-opinion), or executing a multi-slice plan (coding-core:implement-plan).
---

# Review Loop

Review a change, fix exactly what the reviewer flagged, and re-review only that, for at most three rounds. A findings file carries state between rounds, so no one re-reads the whole diff or re-argues settled points.

Reviewer and fixer are subagents. Use a reviewer subagent such as `review` or `quick-review` if available, otherwise a general-purpose subagent. Keep the fixer a separate subagent (or yourself) so the reviewer never edits.

## Findings file

Pick a slug for the change and write findings to `<scratchpad>/review-<slug>.md`, using the session scratchpad directory. The reviewer creates it in round 1. Format:

```
# Review <slug>
## Round 1 (HEAD <sha>)
- F1 | high | src/auth.py:42 | Token compared with ==, not constant-time.
- F2 | low | src/auth.py:90 | Unused import.
VERDICT: CHANGES REQUIRED
```

- One line per finding: ID, severity (`high`, `medium`, `low`), `path:line`, and a claim a fixer can act on without asking.
- IDs are stable. Later rounds append a `## Round N` section and reuse the original IDs, adding new ones for regressions.
- The last line of each round is `VERDICT: APPROVED` or `VERDICT: CHANGES REQUIRED`.

## Procedure

1. **Brief the reviewer.** Give it the diff (or the base and head refs), the acceptance criteria, and the findings file path. Do not give it the implementer's reasoning, because that anchors it on the author's assumptions. Tell it to read, change nothing, and write findings in the format above.
2. **Read the verdict.** On `APPROVED`, stop and report. Otherwise triage: drop findings you can disprove from the code, noting why in the file, and keep the rest.
3. **Brief the fixer.** Name the findings file and the IDs to fix: "fix exactly these IDs, preserve unrelated edits". Tell it not to refactor, rename, or touch other findings' lines, and to run the cheapest check that covers each fix. Commit only if the user has asked for commits.
4. **Re-review.** Give a fresh reviewer the same findings file and the new HEAD. It checks only the listed IDs and any regressions the fixes caused, appends `## Round N`, and ends with a verdict. A fresh reviewer avoids anchoring on its earlier verdict.
5. **Cap at three rounds.** If round 3 still reads `CHANGES REQUIRED`, stop and report the open IDs, what each round changed, and your read on why they persist. Repeated failure usually means a subjective finding or an unclear spec, which is the user's call.

## Report

State the final verdict, rounds used, IDs fixed, IDs still open, and the checks the fixer ran. Findings you disproved go in as "dismissed" with the reason.
