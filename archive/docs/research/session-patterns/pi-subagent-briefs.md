# Orchestration templates in pi subagent briefs

2,067 pi subagent sessions, 151 parent sessions, 2026-08-24 to 2026-09-30.

## Method

- Parsed `chunks/briefs.md` into one record per session. Joined each record to its raw `~/.pi/agent/sessions/<proj>/<file>.jsonl` to get the agent role (`session_info` name, lowercased so `Fixer`/`fixer` merge) and `parentSession`. All 2,067 joined.
- **The digest cuts briefs off at about 1,500 chars.** The p90 brief is really 3,453 chars and the longest is 52,823, so I recounted every family from the raw first user message (`ana/sessions_full.json`). All counts below come from full briefs.
- Counted a session once per family when its first brief matches the family regex. The regexes are in `ana/fam.py`, `ana/fam_full.py` and the inline counters noted per finding. Read about 110 briefs in excerpts of 430 to 650 chars, stratified by family, plus 39 verbatim matches for the examples.
- Projects are dominated by `rovitracker-platform` (1,272 sessions, 62%), then `voidrot-oxide` (190) and `voidrot-agents` (182).

## Root cause behind most of the repetition

`~/.pi/agent/AGENTS.md:107` says every pi subagent runs `prompt_mode: replace` and that the parent must forward the applicable AGENTS.md, CLAUDE.md, Core Rules and overrides by hand. The orchestrator obeys, so most briefs carry the same preamble and guardrails. Claude Code does not have this problem, because its subagents load CLAUDE.md themselves. Rovitracker also moved its instructions out of `AGENT-OVERRIDES.md` into CLAUDE.md in commit `32436ac9`. Findings tagged `agent-def:pi/*` target the pi setup. The others carry over to `~/.claude`.

## Findings

### agents-md-preamble
- type: agent-def:pi/* (all 15 defs), plus a one-line change to `~/.pi/agent/AGENTS.md:107`
- sessions: 745 tell the subagent to read/follow/obey AGENTS.md (36% of all briefs). 497 of them also name `AGENT-OVERRIDES.md`, all in rovitracker-platform. (projects: rovitracker-platform 631, voidrot-oxide 74, home-manager 13; roles: coder-high 109, coder 106, reviewer 81, plan 77, explore 72)
- refs: `2026-09-12T08:55 2026-09-12T08-55-00-307Z_01a094d3-bfd3-7`; `2026-09-19T18:25 2026-09-19T18-25-34-528Z_01a0baea-a340-7`; `2026-09-03T00:23 2026-09-03T00-23-00-659Z_01a064a5-c533-7`
- example: "Read AGENT-OVERRIDES.md, AGENTS.md, infra/AGENTS.md; do not edit override files."
- what to build: Add a fixed body line to each pi agent def: "Before acting, read `~/.pi/agent/AGENTS.md`, then every `AGENTS.md`/`CLAUDE.md` from the repo root down to the target path, nearest wins." Alternatively, switch to an append prompt mode if pi-subagents supports one (UNCONFIRMED). Then delete the forwarding mandate at AGENTS.md:107. No Claude Code change is needed.
- effort saved: high. This is the single most repeated block. The orchestrator also drops scoped files (`infra/AGENTS.md`, `.github/AGENTS.md`) inconsistently, which a fixed rule would not.

### restated-role-defaults
- type: agent-def:pi/reviewer, pi/quick-review, pi/explore, pi/plan, pi/librarian (output section)
- sessions: 1,029 of 1,091 briefs to read-only roles say "read-only"/"do not edit". Those roles already lack edit/write tools: explore, plan, librarian, oracle, devops and dba have only `read, grep, find, ls`, and reviewer/quick-review add bash with no edit or write. Output rules are retyped the same way: word limit 564, stop rule 572, severity/prioritized 361, cite path:line 223. (all projects; roles: reviewer 289, quick-review 236, explore 192, plan 177, librarian 132)
- refs: `2026-09-02T18:51 2026-09-02T18-51-53-128Z_01a06376-9da8-7`; `2026-09-10T04:16 2026-09-10T04-16-27-452Z_01a08988-033c-7`; `2026-09-29T07:08 2026-09-29T07-08-38-141Z_01a0ebfe-797c-7`
- example: "Read-only: do not edit files, run destructive git commands, inspect secrets, or print remote URLs/credentials. Establish: (1) current Git/Home Manager settings and imports, (2) counts/locations of Git worktrees/repositories..."
- what to build: Give each read-only def a default output contract: a word cap (explore/librarian 400, reviewer 700), findings ranked by severity with path:line, and a stop rule. Then add one routing-matrix line telling the parent not to restate role defaults and to state only deviations.
- effort saved: med. Each repeat is short, but it appears in half of all briefs and blurs the instructions that are specific to the task.

### write-boundary-and-shared-checkout
- type: hook (PreToolUse on edit/write and on bash `git checkout|reset|restore|stash|clean`)
- sessions: 326 state a write boundary ("only edit X", "write set", "sole implementer", "no other files"). 206 say to preserve unrelated or uncommitted changes. 95 warn that other agents are writing concurrently. (projects: rovitracker-platform 143, voidrot-agents 41, oxide 22; roles: coder 59, coder-high 45, fixer-high 26, doc-author 25, coder-simple 22)
- refs: `2026-09-01T23:37 2026-09-01T23-37-17-685Z_01a05f55-8e75-7`; `2026-09-21T04:57 2026-09-21T04-57-58-499Z_01a0c253-f9e3-7`; `2026-09-23T16:48 2026-09-23T16-48-30-187Z` (#29 backend, coder-high)
- example: "Write boundary: only `release-please-config.json` and `.release-please-manifest.json`. Validate JSON, inspect manifest/config parity, confirm both markers are mapped, and run `git diff --check`."
- what to build: Let a brief declare a write set in one machine-readable line, e.g. `WRITE: path/glob ...`. A pi extension or Claude PreToolUse hook would then block edits outside it and block reverting or stashing commands. Today the boundary is prose the model is trusted to follow.
- effort saved: high. It turns 326 hand-typed guardrails into an enforced one and closes the risk of concurrent writers clobbering each other.

### no-credentialed-cloud-ops
- type: hook (PreToolUse bash, for subagent sessions)
- sessions: 204 forbid live AWS/DB/provider access or credentialed `plan/apply/import`. 330 forbid exposing or reading secrets/.env. (projects: rovitracker-platform 133 of the 204, oxide 14, infra-updates 6; roles: fixer-high 31, coder-high 30, coder 18, reviewer 16, plan 14)
- refs: `2026-09-05T06:51 2026-09-05T06-51-25-301Z_01a07056-16f5-7`; `2026-09-05T06:42 2026-09-05T06-42-54-076Z_01a0704e-49fc-7`; `2026-09-07T06:36 2026-09-07T06-36-32-393Z_01a07a95-2f09-7`
- example: "Do not contact AWS, import, plan, apply, initialize remote backends, or mutate state."
- what to build: A deny-by-default bash hook for subagents that blocks `aws `, `tofu|terraform|terragrunt (plan|apply|import|state|init` without `-backend=false)`, `sops -d`, and reads of `.env*`. The parent allows a case with an explicit `ALLOW: aws-readonly` brief token. Pair it with the existing global "never expose secrets" rule.
- effort saved: high. It enforces a safety rule the user cares about and removes 200+ repetitions of it.

### commit-and-push-task
- type: agent-def:pi/committer (new role), or a command wrapping existing `git:commit`
- sessions: 54 briefs whose job is to commit (and often push). 82 carry the same banned-operations list (no amend/rebase/reset/stash/force-push/bypass hooks). 36 forward the `git-commit` skill by path. (projects: rovitracker-platform 39, eveonline-tools 7, pi-ext 3; roles: coder-simple 29, general-purpose 12, quick-review 6, coder 5)
- refs: `2026-09-16T02:24 2026-09-16T02-24-26-824Z_01a0a807-9ec8-7`; `2026-09-12T15:18 2026-09-12T15-18-07-091Z_01a09632-7ff3-7`; `2026-09-09T17:40 2026-09-09T17-40-16-107Z_01a08741-906b-7`
- example: "User explicitly authorized both commit and push. Read AGENT-OVERRIDES.md, AGENTS.md, and `.github/AGENTS.md`; do not edit overrides. Do not amend/rebase/force-push or bypass hooks. Current branch `fix-new-workflows` tracks `origin/fix-new-workflows`."
- what to build: A `committer` role, cheap model with bash only, whose def bakes in the procedure. It inspects branch, status and diffs, infers the convention, stages explicit paths, rechecks the staged diff, commits letting hooks run, pushes normally only when the brief contains `PUSH: yes`, and treats a hook failure as stop-and-report. The brief shrinks to the scope paths, the subject hint and the push flag. On the Claude side, `git:commit` already holds the procedure, so only the agent wrapper and the banned-ops list are new.
- effort saved: med. The volume is moderate, but each brief is long and near-identical, and a wrong push is costly.

### review-fix-rereview-loop
- type: agent-def:pi/reviewer + pi/quick-review (verdict format), plus skill (loop procedure)
- sessions: 43 re-reviews after a fix and 45 fix-the-review-findings implementer briefs. 167 review briefs ask for a verdict, 38 of them with the exact "APPROVED / CHANGES REQUIRED" contract. 51 restate the implementer's reported checks to the reviewer. 52 parents ran 3 or more review sessions, 452 sessions in total. (projects: rovitracker-platform, voidrot-oxide; roles: reviewer, quick-review, coder-high 19, coder 7)
- refs: `2026-08-29T03:35 2026-08-29T03-35-00-922Z_01a04b95-c23a-7`; `2026-09-23T20:49 2026-09-23T20-49-33-562Z_01a0d007-e57a-7`; `2026-09-29T08:36 2026-09-29T08-36-26-831Z_01a0ec4e-de4f-7`
- example: "Read-only focused re-review feat/account-ui HEAD 7cc4e1b /home/buck/Projects/voidrot/oxide-account-ui. Prior two UI blockers: visually indistinguishable/truncated/redacted labels allowed destructive remove/context switch;..."
- what to build: Make `APPROVED | CHANGES REQUIRED` followed by blockers the default output in both review defs. Add a `review-loop` skill: the reviewer writes findings to a file, the fixer brief references that file with "fix exactly these, preserve other edits", and the re-review brief passes the same file plus the new HEAD and checks only those blockers and new regressions. Cap the loop at 3 rounds, as the global rule already does. Only 12 briefs pass prior output by `/tmp/pi-subagents-*/…output` path today; the rest re-summarize findings by hand.
- effort saved: high. It is the most common multi-session pattern, and passing findings as a file removes lossy re-summaries.

### fan-out-context-repaste
- type: skill (fan-out brief discipline), or a pi workflow
- sessions: 30 same-parent, same-minute, same-role fan-out groups covering 136 sessions. The largest are 16 `fixer` skill audits, 14 `coder` "create exactly one skill" runs, and 7 `plan`. 108 lines of 100+ chars repeat across 3 or more briefs, about 391K redundant chars in 59 sessions. The 14 coder briefs each inlined the same research digest (WCAG, Google eng practices, legacy skill notes). (projects: voidrot-agents, rovitracker; roles: fixer 16, coder 14+)
- refs: `2026-09-01T23:37 2026-09-01T23-37-17-344Z_01a05f55-8d20-7`; `2026-09-14T10:29 2026-09-14T10-29-22-722Z_01a09f76-dea1-7` (coder ×14, voidrot-agents); `2026-09-05T05:19 2026-09-05T05-19-30-203Z_01a07001-ef9b-7` (plan ×7)
- example: "Required audit for EVERY assigned skill: 1. Inspect SKILL.md and all bundled Markdown/resources. Confirm required frontmatter, allowed fields, name-directory match, scalar limits, metadata string values, UTF-8, and a nonempty instruction body."
- what to build: Have the orchestrator write shared context once to `$TMP/<run>/context.md` and give each sibling only its item list plus that path. The pi `workflows` feature, already enabled, fits this "one template × N items" shape.
- effort saved: med. Few events, but each one burns hundreds of KB of parent output tokens.

### skill-path-forwarding
- type: agent-def:pi/* (per-role `skills:` defaults)
- sessions: 119 briefs forward a skill by absolute path (`~/.agents/skills/<x>/SKILL.md`) although every pi def already has `skills: true`. The top skills are create-skill 32, efficient-planning 26, git-commit 19, terraform-skill 14 and github-actions 11. (projects: rovitracker-platform 51, voidrot-agents 17, pi-ext 11, infra-updates 10; roles: general-purpose 24, plan 20, doc-author 12, coder 11)
- refs: `2026-09-27T10:39 2026-09-27T10-39-27-681Z_01a0e272-c5c0-7`; `2026-09-03T00:23 2026-09-03T00-23-00-659Z_01a064a5-c533-7`; `2026-09-29T15:04 2026-09-29T15-04-39-888Z_01a0edb2-4ad0-7`
- example: "Read /home/buck/.agents/skills/efficient-planning/SKILL.md and /home/buck/.pi/agent/AGENTS.md; inspect repo files but not .env/secrets. No file changes, no remote access."
- what to build: Have the role bodies name the skills each role always uses (plan → efficient-planning, committer → git-commit). For terraform-skill, a project rule ("infra/** work uses terraform-skill") lets the brief stop naming it. The Claude defs already do this through `skills:` frontmatter.
- effort saved: low. The lines are short, but the change is cheap.

### hook-and-lint-repair
- type: skill
- sessions: 46 mention pre-commit/prek/hook failures, 16 of them repair tasks ("resolve required hook failure"), plus 13 lint-remediation tasks. 38 of the 46 are in rovitracker-platform. (roles: coder-simple 11, coder 6, coder-high 5, general-purpose 4)
- refs: `2026-09-14T03:53 2026-09-14T03-53-33-736Z_01a09e0c-7d28-7`; `2026-09-14T05:08 2026-09-14T05-08-46-989Z_01a09e51-5b0d-7`; `2026-09-05T21:38 2026-09-05T21-38-21-106Z_01a07382-1932-7`
- example: "Resolve required goconst hook failure in CalAmp tests (`mutated` string has 3 occurrences across id_report_test.go and parse_test.go) without altering assertions or behavior. Add an appropriate test constant in minimal scope. Run gofmt/tests/lint; do not commit."
- what to build: A `hook-repair` skill: rerun the failing hook with `--show-diff-on-failure`, fix only the reported findings, never suppress rules, weaken tests or bulk-reformat, rerun the exact hook, and do not commit. The commit path would invoke it when a hook fails. `tooling:pre-commit` covers setup, not repair.
- effort saved: med. The briefs are short, but the "do not weaken or suppress" guardrails are retyped every time.

### issue-in-linked-worktree
- type: command (`/implement-issue <n>`)
- sessions: 35 implement-a-GitHub-issue briefs, 33 in voidrot-oxide. 26 pin "ONLY in linked worktree … branch … at <sha>". 123 mention worktrees overall. (roles: coder-high 16, general-purpose 9, designer 5)
- refs: `2026-09-23T10:45 2026-09-23T10-45-30-235Z_01a0cdde-ddfb-7`; `2026-09-23T15:14 2026-09-23T15-14-46-820Z_01a0ced5-65a4-7`; `2026-09-02T04:41 2026-09-02T04-41-04-851Z_01a0606b-ae53-7` (the "CRITICAL TARGET SAFETY: cd before every repository operation" variant)
- example: "Implement issue #14 https://github.com/voidrot/oxide/issues/14 ONLY in linked worktree /home/buck/Projects/voidrot/oxide-grant-boundary branch fix/grant-boundary at main 9ab3df7. User approved security/authorization change."
- what to build: A command that creates the worktree and branch from a pinned base, launches the implementer with its cwd set to the worktree, and verifies the top-level path and HEAD before the first edit. Two briefs had to warn that the default cwd was the wrong checkout. Claude's `isolation: "worktree"` covers part of this.
- effort saved: med. It removes the setup boilerplate and the wrong-checkout risk.

## Agent role to brief count

| role | briefs | in current `~/.pi/agent/agents`? |
| --- | ---: | --- |
| reviewer | 289 | yes |
| coder-high | 243 | yes |
| coder | 238 | yes |
| quick-review | 236 | yes |
| explore | 192 | yes |
| plan | 177 | yes |
| librarian | 132 | yes |
| coder-simple | 123 | **no** |
| general-purpose | 81 | yes |
| fixer-high | 76 | **no** |
| doc-author | 67 | yes |
| fixer | 61 | **no** |
| doc-updater | 51 | yes |
| devops | 37 | yes |
| oracle | 23 | yes |
| designer | 15 | yes |
| coder-max | 15 | yes |
| fixer-max | 6 | **no** |
| dba | 5 | yes |

The fixer, fixer-high, fixer-max and coder-simple roles (266 sessions) no longer exist as defs. They were retired or renamed, yet the routing matrix still lists `coder-simple`.

## Waste signals

- **Fan-out, not re-issue.** The near-duplicate detector (same role family, under 3h apart, similarity above 0.75) found 32 pairs, and almost all were same-minute sibling fan-outs. True re-issues are about 2 escalations (fixer-high to fixer, coder-simple to coder) plus the 43 explicit re-reviews.
- **Turn-limit hits.** 12 sessions got "You have reached your turn limit": reviewer 7 of 289 (max_turns 175), doc-updater 2, quick-review 2, doc-author 1.
- **Empty sessions.** 9 sessions made no tool calls beyond `_subagent` (explore 3, librarian 2).
- **Brief size.** Total brief text is 3.85M chars. Medians run from 718 chars (quick-review) to 3,564 (doc-author). Fixer-high and doc-author have a p90 above 6,600 chars.
- **Follow-ups.** 75 sessions got follow-up user messages, mostly coder-high (31). Turn-limit nudges and extra verified facts appended to plan sessions are typical.

## Near misses (under 5, or covered elsewhere)

- **diagnose-only**: 2 briefs. The template barely exists, and `oracle` handles diagnosis.
- **target-safety cd warning**: 2 briefs. Folded into issue-in-linked-worktree.
- **implement-approved-plan phase N**: 35 briefs, but the shapes vary too much to template. `claude-mem:do` already covers plan execution on the Claude side.
- **lint-remediation on its own**: 13. Folded into hook-and-lint-repair.
- **prior-output file passed by path**: 12. This is the good pattern that review-fix-rereview-loop should make the default.
- **"medium breadth" for explore**: 5. Too rare to template, and the Claude `Explore` description already asks for it.
