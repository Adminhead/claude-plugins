# Preload natural experiment: do preloaded skills help the orchestration subagents?

Data window: 2026-10-17 to 2026-11-14. Sources: usage log (`~/.local/state/claude-usage`) and subagent transcripts (`~/.claude/projects/*/<session>/subagents/agent-*.jsonl` plus `.meta.json`). Aggregates only; no prompt, code or file content was copied.

## Summary

- Conclusion: the data cannot answer the question. Neither "helps" nor "hurts" can be supported. A naive comparison shows the preload arm using more turns, tokens and time, but that gap comes from different tasks and projects, not from the preload.
- The arms are not comparable. Arm membership is set by which project or session had the skill plugin installed. Only 3 of 105 coder sessions contain both arms, and where a project has both, the arms are separated in time (the plugin was installed partway through).
- Cost side is solid: the preload injects a median of about 10,000 characters (coding), 7,000 (planning) or 9,000 (problem-solving) into each spawn's context.
- Benefit side is unmeasured. No outcome signal that does not need content judgment separates the arms credibly. The signals that exist are either boilerplate-saturated (keyword "fail" is in 55% to 67% of coder hand-backs, and in 93% of reviewer reports) or workflow-structure counts that depend on task shape.
- Confidence: high that the data cannot settle it; low confidence in any direction from the raw numbers.
- Cheapest controlled test: see the end.

## Correction to the prior counts

The earlier figures (coder 891 spawns vs 678 `coding` loads, and so on) mix two things that do not line up:

- `agent-call` includes calls that never started a subagent. All 95 coder, 25 debugger and 2 architect calls with `isError: true` have no transcript. Every call that matched a transcript had `isError: false`. So `isError` records launch failure, not task quality, and is not an outcome signal.
- `skill` records for `coding:coding` (678) also include loads by other agents or typed commands, so they overstate coder preloads.
- Ground truth from transcripts: 796 coder, 136 architect and 23 debugger subagent transcripts exist. Preloaded: coder 503 (63%), architect 64 (47%), debugger 13 (57%). The debugger has only 23 transcripts against 47 logged calls, because 25 of those calls errored at launch and 1 transcript is missing.

## Join method and reliability

Preload status, per spawn (reliable, used for all results): each subagent transcript starts with `isMeta` user entries, one per preloaded skill, each carrying `<command-name>skill</command-name>`. A spawn is "with preload" if its own transcript holds `coding:coding`, `planning:planning` or `problem-solving:problem-solving` for the matching agent type. `meta.json` gives agent type, requested model and effort, description. This is a direct observation, not an inference.

Usage-log `skill` records cannot be attributed reliably. They carry session and prompt number but no `agentId`, and `agent-call` has no `agentId` either. I tried matching a `skill` record to a `model-step` with an `agentId` in the same session, same prompt and within 2 seconds. Of 756 target-skill records: 336 matched exactly one agent (44%), 245 matched none, 175 matched two to five agents (parallel spawns share the same second). Checked against transcripts, where the log method gives a single answer it agreed with the transcript 336 times, and it missed 174 true preloads. Use the transcript, not the log, for the arm.

Usage-log `agent-call` to transcript (for model and prompt number): matched on session, agent type, description and a start time within -5 to +60 seconds. Matched 783 of 897 coder calls, 132 of 136 architect and 21 of 47 debugger. Unmatched are launch errors or transcripts that no longer exist. One coder call had two candidates. High reliability for the matched set; this join was only used to establish the `isError` meaning, the main results use transcript fields alone.

Sequence signals (reviewer after coder, and so on) use the start and end times of all subagent transcripts in the same session. This is a time-adjacency heuristic (within 30 minutes after the spawn ended), not a causal link.

## Arm sizes and confounds

| Agent | With preload (n spawns / projects / sessions) | Without (n / projects / sessions) | Projects with both arms | Spawns in those projects |
| --- | --- | --- | --- | --- |
| coder | 503 / 15 / 32 | 293 / 21 / 76 | 7 | 361 |
| architect | 64 / 14 / 27 | 72 / 12 / 39 | 5 | 54 |
| debugger | 13 / 9 / 12 | 10 / 4 / 8 | 0 | 0 |

Model (requested on the call; "unset" means the caller passed none):

| Agent | With: sonnet / opus / haiku / unset | Without: sonnet / opus / haiku / unset |
| --- | --- | --- |
| coder | 371 / 52 / 35 / 45 | 188 / 44 / 22 / 39 |
| architect | 29 / 2 / 0 / 33 | 18 / 3 / 0 / 51 |
| debugger | 3 / 3 / 0 / 7 | 3 / 1 / 0 / 6 |

Confounds, all observed:

- Project mix differs. The largest with-arm project (capsight) has 154 coder spawns against 13 without. Without-arm spawns are spread over more projects and more, shorter sessions (76 sessions for 293 spawns, against 32 sessions for 503).
- Within a project the arms are separated in time. Examples: eve-online backend without 11-03 to 11-05, with 11-06 to 11-09; frontend without 11-03 to 11-07, with 11-07 to 11-08. So the within-project comparison is a before/after across task phases, not a controlled split. Only 3 of 105 coder sessions and 4 of 62 architect sessions have both arms.
- Task shape differs: the median number of edit or write calls is 3 (with, sonnet, n=371) against 0 (without, sonnet, n=188), so the without arm holds many more spawns that do not edit files. The with arm uses the higher share of sonnet.
- The preload arm also differs in other installed skills and plugins (for example `codebase-memory` and `plan-ledger` preloads vary), because arm tracks install state of the whole environment.
- Model effort: "unset" model is 31% of architect with, 71% without. The architect and debugger have no effort set on nearly every call.

## Signals available

| Signal | Coder spawns with data | Architect | Debugger | Usable? |
| --- | --- | --- | --- | --- |
| Hand-back delivered / transcript finished | 796 | 136 | 23 | Yes, but saturated (98% to 99% in both arms) |
| Assistant turns, tool calls, duration, output and input tokens | 796 | 136 | 23 | Yes, but they measure task size as much as agent quality |
| Edit or write calls | 796 | 136 | 23 | Task-shape proxy |
| Keyword "fail" in hand-back | 796 | 136 | 23 | Not usable (55% to 67% of hand-backs, mostly describing tests that failed before the fix) |
| Keyword "blocker / cannot / unable" | 796 | 136 | 23 | Weak |
| Keyword "unverified / not run" | 796 | 136 | 23 | Weak |
| Any tool-result error in the transcript | 796 | 136 | 23 | Not usable (includes permission denials and routine failing commands) |
| Reviewer ran within 30 min after | 796 | 136 | 23 | Structure, confounded by workflow |
| Reviewer then another coder or debugger spawn | 487 reviewed | 70 | 11 | Structure, best proxy for rework, still confounded |
| Another coder or debugger within 30 min | 796 | 136 | 23 | Cannot separate rework from the next planned slice |
| Reviewer report keyword "fail" | 487 | 70 | 11 | Not usable (93% in both arms) |
| `isError` on the agent call | 897 calls | 136 | 47 | No: means launch failure |

Unavailable: any outcome grade (accepted by the user, tests green at the end, diff kept), and any task difficulty measure beyond brief length.

## Signal comparisons, coder (with n=503, without n=293)

| Signal | With | Without |
| --- | --- | --- |
| Hand-back delivered | 495/503 (98%) | 288/293 (98%) |
| Keyword blocker | 123/503 (24%) | 72/293 (25%) |
| Keyword unverified or not run | 240/503 (48%) | 158/293 (54%) |
| Reviewer followed within 30 min | 320/503 (64%) | 167/293 (57%) |
| Reviewer then another coder or debugger | 204/320 (64%) | 83/167 (50%) |
| Another coder or debugger within 30 min | 347/503 (69%) | 145/293 (49%) |
| Median assistant turns | 70 | 40 |
| Median tool calls | 47 | 28 |
| Median duration (s) | 493 | 164 |
| Median output tokens | 61,329 | 32,696 |
| Median brief length (chars) | 2,514 | 2,724 |

Raw differences exist (rework 64% vs 50%, turns 70 vs 40), and a permutation test on the medians gives p below 0.001 for turns and duration. That test treats spawns as independent and ignores the clustering by project and session, so it overstates certainty, and the differences are explained by the confounds above. Treat them as descriptive only.

By model, coder, same signals:

| Model | n with / without | Median turns with / without | Reviewer then rework with / without | Follow-up spawn within 30 min with / without |
| --- | --- | --- | --- | --- |
| sonnet | 371 / 188 | 64 / 36 | 158/247 (64%) / 51/105 (49%) | 267/371 (72%) / 94/188 (50%) |
| opus | 52 / 44 | 149 / 116 (p about 0.14) | 13/24 (54%) / 6/18 (33%) | 32/52 (62%) / 12/44 (27%) |
| haiku | 35 / 22 | 33 / 29 (within noise) | 5/15 (33%) / 7/14 (50%) | 18/35 (51%) / 15/22 (68%) |
| unset | 45 / 39 | see raw output | not tabulated | not tabulated |

Direction is mixed: haiku goes the other way on rework. The haiku and opus cells are small (15 to 52 spawns), so those differences are within noise.

Within the 7 projects that have both arms (361 coder spawns), the with arm shows more edit calls in all 3 projects that have at least 3 spawns per arm, and higher turns, duration and output tokens in 2 of 3. The numbers behind that: capsight (154 with, 13 without; median turns 53 vs 41), eve-online backend (75 / 12; 60 vs 71), eve-online frontend (31 / 37; 85 vs 41). Three projects is too few to read, and the arms were separated in time.

## Architect (with n=64, without n=72) and debugger (with n=13, without n=10)

| Signal | Architect with | Architect without | Debugger with | Debugger without |
| --- | --- | --- | --- | --- |
| Keyword blocker | 26/64 (41%) | 28/72 (39%) | 7/13 (54%) | 7/10 (70%) |
| Keyword unverified or not run | 27/64 (42%) | 21/72 (29%) | 4/13 (31%) | 4/10 (40%) |
| Reviewer followed within 30 min | 40/64 (62%) | 30/72 (42%) | 8/13 (62%) | 3/10 (30%) |
| Median turns | 101 | 118 | 65 | 34 |
| Median duration (s) | 1,256 | 1,576 | 304 | 151 |
| Median output tokens | 165,484 | 140,442 | 24,124 | 11,382 |

Architect differences are within noise (turn and duration permutation p about 0.2 to 0.4). The debugger sample is 23 spawns, no project has both arms, and the arms cover 9 versus 4 projects, so nothing can be inferred.

## Limits

- Observational only; arm is assigned by install state, correlated with project, time and task type.
- No outcome grade. Every available signal is either structural or keyword-level.
- Spawns are clustered by session and project; counts treat them as independent.
- Time-adjacency heuristics for review and rework can mislabel parallel work.
- Transcripts for about 100 older launches are missing, so some calls cannot be matched.
- Only `coder:coder`, `architect:architect` and `debugger:debugger` were studied. The older `coder-high`, `coder-critical` and `crew:*` agents were used only to detect follow-up spawns.
- "Without preload" here still means the agent kept its own system prompt and the other skills; only the named domain skill was missing. The agent body may already carry the same guidance, which would be a reason for no difference even with perfect data.

## Cheapest controlled test

Take 15 to 20 bounded coder tasks (mix of read-only and editing, with a runnable acceptance check such as a test command) from one repository. Run each twice with the same model and effort, once with the skill plugin enabled and once disabled, in separate git worktrees, with order randomized. Score with the objective check (tests pass, diff applies) plus turns, tokens and a blind reviewer-agent pass or fail. The skill-evals workflow (`claude plugin eval` outcome evals) is the natural harness. Repeat for architect (plan scored against a fixed rubric) with 10 prompts. Debugger needs seeded bugs with a known root cause, 10 cases, scored on whether the root cause is correct. Cost is roughly 40 to 60 subagent runs.
