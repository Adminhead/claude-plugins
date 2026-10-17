# Batch core-a report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `coding` | skill | Makes the smallest complete, maintainable code change for a bounded feature, fix, integration, or behavior-preserving refactor. Use when implementing or modifying code whose approach is already clear ("add X to Y", "fix this function", "refactor this without changing behavior", "simplest solution", "this is over-engineered"). | archive coding-core/coding (+ references/design-seams.md, evals/coding-feature); ponytail SKILL.md (MIT, DietrichGebert); archive review/anti-slop "remove first"; ECC search-first, error-handling, inherit-legacy-style (MIT, Affaan Mustafa) | none |
| `planning` | skill | Writes, reviews, or revises implementation plans whose scope, verification, and reruns are proportionate to risk. Use for "plan this", "review this plan", "cheapest way to verify", work spanning several slices or risky boundaries, acceptance criteria for an ambiguous change, multi-agent or multi-session plans, and "grill me" stress-tests. | archive coding-core/planning (5 references); mattpocock grilling (MIT); agent-skills interview-me (MIT, Addy Osmani); claude-skills feature-forge ears-syntax.md (MIT); ECC blueprint (MIT) | none |
| `implement-plan` | skill | Executes an approved multi-slice implementation plan file end to end, running independent slices in parallel worktrees and checking, reviewing, committing, and updating a Status block after each slice without asking. Use when the user says "implement this plan", "continue implementing", or points at a plan file to carry out. | archive coding-core/implement-plan (+ evals/implement-plan-routing) | none |

## What was merged where

- `coding/SKILL.md` (59 lines): ponytail's option order became step 2 "Take the first option that fully works" (need to exist? -> codebase -> stdlib/platform -> installed dep/MCP/skill -> maintained package -> minimum code), plus "lazy about the solution, never about the change", a "Never cut" section, bug-fix "find every caller, fix root cause once", `shortcut: <limit>, <when to upgrade>` comments, test-or-self-check for non-trivial logic, closing "what I skipped / risk" lines. Anti-slop "remove first" is in step 5. ECC: search-first (MCP/skill channel, unavailable-channel honesty, adopt/extend/compose/build, already partly in archive), error-handling (fail loudly, no swallowed catch, async errors surface, user vs operator messages, retry only retriable non-4xx), inherit-legacy-style (name the exemplar, weak-minority noise rule, small-module "3 vs 2" exception, don't copy bugs). Long "Not for" list moved into the body. codebase-memory `search_graph`/`search_code` added as a search option.
- `planning`: `references/stress-test.md` now has the grilling frontier rounds ("yes" accepts the recommendation, facts are yours/decisions are theirs) plus interview-me's hypothesis+confidence number, "should want" probe, three-question confidence stop, restate with mandatory out-of-scope line, explicit-yes gate, and the non-interactive guard. `references/acceptance-criteria.md` gained an EARS section (5 upstream patterns + standard "If ... then" unwanted-behavior pattern, which I added from general EARS knowledge). `references/multi-agent-plans.md`: claude-mem line replaced with an `implement-plan` pointer; blueprint's cold-start brief fields, per-step rollback, invariants, model-tier and plan-mutation record added. Discovery step mentions codebase-memory `get_architecture`/`search_graph`/`trace_path`. `closing-review.md`: `review:second-opinion` -> `second-opinion`.
- `implement-plan`: claude-mem lines dropped; cross-refs renamed; one sentence allows a Workflow script to fan out parallel slices only when the user opted into a Workflow (Agent worktrees stay the default).
- LICENSE files: `plugins/coding/LICENSE` and `plugins/planning/LICENSE` list the MIT sources with their copyright lines plus the MIT text. Attribution lines at the foot of `coding/SKILL.md`, `stress-test.md`, `acceptance-criteria.md`, `multi-agent-plans.md`. `implement-plan` has no third-party content, so no LICENSE.

## Validation and tests

- `claude plugin validate --strict plugins/coding|planning|implement-plan`: all passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<p>/skills/<p>`: all valid.
- grep for `codegraph|claude-mem|coding-core|github:|Efficient |review:|testing:|research:|api:|authoring:|modernize:|experiment-loop:|dynamic-workflows`: no matches.
- Descriptions: 327 / 340 / 326 chars.
- Evals moved: `plugins/coding/evals/coding-feature`, `plugins/implement-plan/evals/implement-plan-routing`; grader regexes rewritten to `coding:coding`, `problem-solving:problem-solving`, `implement-plan:implement-plan`, `planning:planning`. Not run (`claude plugin eval` costs model calls and the plugins aren't registered yet).

## Deviations

- Plan says ECC search-first only; the brief also named error-handling and inherit-legacy-style, so I took ~12 lines from those too (no hooks, no `.ai-style-rules.md` workflow).
- interview-me asks one question at a time; grilling asks the whole frontier. Kept frontier rounds as default and use a single question only when the user doesn't yet know what they want.
- The archived problem-solving evals (`problem-solving-flaky`, `trigger-problem-solving-*`) belong to the `problem-solving` plugin (not in this batch) and were left in the archive.
- claude-skills' upstream LICENSE has "Copyright (c) 2025" with no holder; kept as-is, not invented.

## Unverified / TODO

- No version-sensitive facts kept, so nothing needed Context7.
- Evals not executed; the `implement-plan-routing` case pins `model: claude-sonnet-5-5` from the archive. Check that it is still current.
- The cross-plugin "not-*" graders only mean something when the sibling plugins are installed in the eval run.

## Suggested follow-ups

- Coordinator: register the three in the marketplace and add `coding`, `planning` to `programming-core`; `implement-plan` is a direct install.
- Run `claude plugin eval plugins/coding` and `plugins/implement-plan` after registration; consider a `planning` routing eval ("grill me on this plan").
