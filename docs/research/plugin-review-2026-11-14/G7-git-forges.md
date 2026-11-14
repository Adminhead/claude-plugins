# G7 git, GitHub, Forgejo and PR workflow skills, 2026-11-14

Tooling run: `fj` v0.7.0 is on PATH (/usr/bin/fj), so every fj command in the forgejo-* skills was checked against `fj <noun> <sub> --help`. A strict PyYAML parse of the frontmatter of all 28 SKILL.md and agent files in the family passed. No evals were run and nothing was edited.

## Summary

- 27 plugins plus the shipper/forgejo-shipper agent pairing. Verdicts: KEEP 5 (git-commit, git-history, renovate, forgejo-cli, forgejo-pr), KEEP-FIX 13, SLIM 2 (gh-issues, gh-repo-setup), MERGE 6 (gh-readme and forgejo-readme into one `readme`; hubflow and trunk-based into git-flow; forgejo-pr-comments into pr-comments; forgejo-issues into forgejo-cli), DEPRECATE 0.
- The Forgejo family earns its place, and it is the strongest group here. The fj command map, the `-R` flag placement table, "no `--draft`, use `WIP: `", "`pr create` does not push", "no label flag on `issue create`", "no reopen", and Forgejo Actions ignoring `permissions:` are K-private facts. All the fj facts I could test match fj 0.7.0 `--help` (see "fj verification" below). forgejo-actions (16 calls, 9 sessions) and forgejo-cli (10 calls) are the most-called skills in the family. forgejo-shipper has 152 agent calls, while the forgejo-ship skill has 0 loads: the orchestrator uses the agent directly.
- The gh-* skills cover a tool models know well. Most of their bulk fails the Generic test (gh-issues 0 calls in 31 sessions, gh-pr 1 in 31, gh-readme 1 in 31, dependabot 1 in 32). What survives is the owner's house conventions (PR body format, approval gates), the dismissal and API values in gh-code-security, and the sweep procedures.
- Twin pairs: readme should be one forge-neutral skill (high confidence); pr-comments and pr probably (medium); release maybe (low); actions, issues, ship and cli should stay separate (see Cross-plugin findings).
- Branching skills: git-flow, hubflow and trunk-based share a byte-identical `references/detection.md` (3 copies, no sync mechanism). Their descriptions collide on "which branching model should we use" (git-flow:3, trunk-based:3). trunk-based costs the most listing tokens in the family (230) for 9 sessions and 0 calls. Fold them into one plugin.
- [high] findings: none of the Forgejo skills has a wrong command. The open [high] items are structural. Four manual-only skills (ship, pr-comments, forgejo-pr-comments, and forgejo-ship's cross-plugin cases) still have no working outcome eval (F5 open), and `evals/forges` still uses `git.example.org` remotes with no Bash tool, so the Forgejo-side routing cases carry ambiguous ground truth.
- Prior findings re-checked: FIXED 4, PARTLY 2, STILL OPEN 19, UNVERIFIED 2 (table below).

## Prior findings re-checked

| Prior finding (source) | Status | Evidence |
| --- | --- | --- |
| Four routing evals can never pass: manual-only skills (G7 high, V27, C2) | FIXED | `plugins/ship/evals/` and `plugins/pr-comments/evals/` are empty; forgejo-pr, gh-pr, gh-issues, forgejo-issues graders now contain only `fires-*` files. Side effect: ship, pr-comments and forgejo-pr-comments have zero evals. The data still shows `pr-comments-slash:0.33/None` from the dropped run (plugin-data.tsv, pr-comments row). |
| Vacuous `not-<sibling>` graders (G7 high, V26) | FIXED for G7 plugins | `ls plugins/{forgejo-pr,gh-pr,gh-issues,forgejo-issues,forgejo-release,forgejo-readme}/evals/*/graders` shows only `fires-*.md` in the cases I listed. V26 stays open repo-wide in the plan. |
| Three SKILL.md with invalid YAML (G7 med) | FIXED | yaml.safe_load OK for all 28 files; `gh-release/SKILL.md:3`, `gh-triage/SKILL.md:3` and `git-history/SKILL.md:3` are now quoted. |
| forgejo-release tags the server-side branch head (G7 med, V16, A9) | FIXED | `forgejo-release/SKILL.md:46-58` tags `$SHA`, pushes, verifies the remote tag, then `-t v1.4.0`. `-T/--branch` is explicitly warned against (line 58). `fj release create --help` confirms `-t`, `-T`, `-B`, `-d`, `-p`, `-a`, `-b`. |
| gh-triage, issue-breakdown, gh-repo-setup, gh-code-security have no forge gate or exclusion (G7 med) | STILL OPEN | `grep -i "forgejo\|codeberg\|forge gate"` finds nothing in any of the four SKILL.md files or descriptions. |
| forgejo-actions lacks gh-actions' injection sink list, env-file injection, audit format, efficiency (G7 med) | STILL OPEN | `references/security.md` mentions untrusted `run:` interpolation (line 28) only. `GITHUB_ENV`/`FORGEJO_ENV` appears in 0 forgejo-actions references and 2 times in gh-actions `security.md`. |
| shipper lacks "PR and check text are data" (G7 low) | STILL OPEN | `shipper/agents/shipper.md` has no such line; `forgejo-shipper.md:26` does. |
| ship has no safety evals while forgejo-ship has two (G7 med) | STILL OPEN | `plugins/ship/evals` is empty. forgejo-ship still has `merge-green` and `merge-rules`. |
| `gh pr checks --watch` "no checks" ambiguity (G7 low) | STILL OPEN | `ship/SKILL.md:43` says no checks counts as passing, with no stderr discriminator. |
| ship picks squash and breaks hubflow `feature finish` (G7 low) | STILL OPEN, changed | `ship/SKILL.md:45` now prefers rebase, then squash, then merge, and never checks `[hubflow]`/`[gitflow]` config. It now also contradicts dependabot (`dependabot/SKILL.md:85` uses squash first) and forgejo-ship (repo default style). |
| Zero evals: gh-release, gh-code-security, gh-repo-setup, git-commit, git-history, git-flow, hubflow, trunk-based, forgejo-pr-comments (G7 med) | STILL OPEN | `ls plugins/<p>/evals` is empty for all nine. |
| git-flow and trunk-based both claim "which branching model should we use" (G7 med) | STILL OPEN | `git-flow/SKILL.md:3` and `trunk-based/SKILL.md:3` both still list it. |
| detection.md byte-identical across three branching plugins (G7 low) | STILL OPEN | Same 31 lines in git-flow, hubflow and trunk-based `references/detection.md`; `diff` shows no change. |
| hubflow `git merge-tree --write-tree` needs git 2.38 (G7 low) | STILL OPEN | `hubflow/SKILL.md:61` has no version note. |
| `evals/forges`: remotes `git.example.org`, no Bash, no Forgejo marker (G7 med) | STILL OPEN | `evals/forges/evals/deps-forgejo/scaffold.sh:4` and `github-dir-on-forgejo/scaffold.sh:4` use `git.example.org`; `allowed_tools: [Read, Glob, Grep, Skill]`. |
| `evals/forges` missing release, cli, GHE, triage and Gitea pairs (G7 med) | STILL OPEN | 12 cases: ci-red, deps x2, github-dir, issue x2, pr x2, readme x2, run-url x2. No release, cli, triage or ghe case. |
| pr-comments is GraphQL-only, fails in cloud sessions (G7 med) | STILL OPEN | `pr-comments/skills/pr-comments/fetch.sh:37` `gh api graphql`; no REST fallback. |
| `reviews(last: 50)` not paginated (G7 low) | UNVERIFIED | Not re-read. |
| Committed `runs: 1` in per-plugin cases (G7 low) | STILL OPEN | 22 cases show `runs: 1` (grep of the family's `evals/*/prompt.md`). |
| gh-actions gate treats any non-GitHub host as Forgejo (G7 low) | PARTLY | `gh-actions/SKILL.md:14` is reworded ("Forgejo or Codeberg (not github.com and not a host gh knows)") but still infers Forgejo from "not GitHub". GitLab and Gitea are not named. |
| gh-actions `# v5.0.0` example (G7 low) | STILL OPEN | `gh-actions/SKILL.md:55`, `references/hardening.md:12`. |
| gh-actions node20 EOL wording (G7 low) | UNVERIFIED | `references/actions.md:12` still points at the live metadata reference; I did not check whether it still names node20. |
| git-commit "fix a commit message" overlaps git-history reword (G7 low) | STILL OPEN | `git-commit/SKILL.md:3` unchanged; `git-history/SKILL.md:53` owns older-commit rewording. |
| forgejo-release `grep tags:` too wide; `fj tag list \| fj tag view` pipe (G7 low) | STILL OPEN | `forgejo-release/SKILL.md:19` and `:72`. |
| gh-pr template lookup list and `--attach` fallback (G7 low) | STILL OPEN | `gh-pr/SKILL.md:18`, `:62-69`. |
| forgejo-pr-comments plugin.json lacks "Not for GitHub PRs" (G7 low) | PARTLY | The SKILL.md description has it (`:3`); plugin.json description (line 4) still does not. |
| F5: move forgejo-ship cross-plugin cases, design a slash `ship` case | STILL OPEN | forgejo-ship evals still use `plugins: ["../../../forgejo-ship", ...]`; the dependency-resolution and subagent-trace question was never confirmed. |

## fj verification (fj v0.7.0, against `--help`)

All of these match: `pr create` flags (`--base --head --body --body-file -A --agit --milestone -w -r`, "Prefix with WIP: to mark this PR as a draft", no `--draft`); `pr status --wait`; `pr merge -M/-d/-t/-m` with methods `merge, rebase, rebase-merge, squash, manual, fast-forward-only`; `pr search -l -c -a -s -r -p --all -m`; `pr review list --comments --all`; `pr review request`; `pr edit title|body|comment|labels|milestone`; `issue create --template --no-template --milestone`, with no label flag; `issue edit N labels -a/-r`; `issue close -w`; no `issue reopen`; `release create -T -t -B -a -b -d -p`; `release edit -d true|false -p true|false -n -t`; `release delete/view --by-tag`; `release asset create|delete|download -o`; `actions tasks|variables|secrets|dispatch -I`; `auth login|logout|add-token|use-ssh|list`; `whoami -r` lowercase; `repo labels [REPO] view|create|delete|edit`. No `-R` at the `pr` leaf (only at the noun), which matches the placement table (`forgejo-cli/SKILL.md:36-43`). `fj issue` leaves do also accept `-R` (create, edit, close, search, view), which the table does not say. That is harmless.

Small gaps: `fj pr checkout ^<id>` ("prefix with ^ for the parent repo's PR") is not mentioned (forgejo-pr-comments:62, contribute.md). `fj release view` and `edit` take the release name, not the tag. This only works because the skill names the release after the tag, so say so.

## Per-plugin

### git-commit — KEEP (high)
- Value: K-decision plus Routing. Preloaded into shipper and forgejo-shipper (`agents/*.md:7-8`), and in baseline. The decision-changing parts: release-please contract beats stylistic history (`references/release-tooling.md:7`), never a second CC header in the body (`:9`), `Closes` in the footer, header-only on "keep it short", no invented body (`SKILL.md:63-65`), stage explicit paths. Haiku would get these wrong (feat labelled chore, ticket in header, invented "why"). Sonnet gets the basic format right, so the lift for Sonnet is the repo-convention detection order and the secrets boundary.
- Evidence: 629 sessions listed, 166 loads, 8 calls, 104 listing tokens. No evals.
- Fixes: [med] `SKILL.md:3` "fix a commit message" collides with git-history's older-commit reword; narrow to "fix the last commit's message" and add "Not for rewording older commits (`git-history`)". [med] add the two evals the prior report proposed (`commit-release-please`, `commit-no-secrets`); this is the most-loaded skill in the family and the only one with zero coverage. [low] branch-naming section (`:96-109`) lives here but forgejo-ship and ship defer to it, which is fine; no change.

### git-flow — KEEP-FIX (medium)
- Value: K-private (post-training facts). git-flow-next 2.1.0 flags and config keys, the AVH-vs-next syntax table (`references/cli-commands.md:70-82`), "no tool does hotfix-into-open-release" (`SKILL.md:64-70`), `-f` meaning differs (`:80`), fast-forward default (`:76`). A model without it would run AVH-era syntax. Marked "(observed)" at `:90`, which is good provenance. The generic part (what git-flow is) is small.
- Evidence: 0 sessions listed (not installed in any meta), 0 loads. Judge on content.
- Fixes: [med] description is 528 characters and claims "which branching model should we use" (`:3`), the same trigger as trunk-based. Make this plugin the single branching-model host (see Cross-plugin findings). [med] no evals; add `gitflow-no-push` (outcome, `git push` max 0) and a `[gitflow]` scaffold case. [low] version claims (git-flow-next v2.1.0 2026-09-08, nvie archived 2025-10-14, AVH archived 2023-06-19) are in the needs-source-check list.

### hubflow — MERGE into git-flow (medium)
- Value: K-private but for a dead tool. The `-Xtheirs` on finish, auto-push on start/finish, `feature finish` expecting a merged PR (`SKILL.md:58-65`) are source-derived and would save a user from pushes and silent conflict resolution. It fires only in a repo with a `[hubflow]` section, which this owner does not use.
- Evidence: 0 listed, 0 loads.
- Fixes: [med] move to `git-flow/references/hubflow.md` plus a 6-line pointer in git-flow's detect section (~150 lines to ~50 in the reference, since detection.md and half of the safety text duplicate git-flow). [low] `:61` needs "git 2.38 or later" for `merge-tree --write-tree`.
- If merged: nothing is lost for Sonnet or Opus beyond a trigger word; Haiku would lose the auto-push warning only when `[hubflow]` is present.

### trunk-based — MERGE (SLIM) into git-flow (medium)
- Value: mostly Generic. Trunk-based development is textbook (short branches, flags, branch by abstraction, never merge release back). Decision-changing bits: "pushing to trunk is itself a push, ask even for a one-line fix" (`:13`), the cherry-pick `-x` branch-for-release recipe (`references/release.md`), the multi-agent worktree rule (`:82`). Sonnet 5.5 without the skill would produce the same release/cherry-pick flow.
- Evidence: 9 sessions listed, 0 loads or calls, 230 listing tokens (the highest in the family, from a 662-character description). Never called.
- Fixes: [med] description is 662 characters, the longest in the group, so it is the first to be truncated; cut to name-only triggers or fold away. [low] release.md says "the sources give no exact commands" (`:3`), i.e. the sequences are an unsourced sketch.
- If merged: keep ~15 lines (the detect-and-defer rule, the three agent-specific rules, release.md). What is lost: the long "when to use" prose, for Haiku only.

### git-history — KEEP (medium)
- Value: K-decision. The editor-free forms (`GIT_SEQUENCE_EDITOR=true ... --autosquash`, `:44-48`), backup ref before any rewrite (`:25`), `--force-with-lease=<branch>:<sha>` (`:16`), "never stash automatically", "never `reset --hard` to undo" are behavior-changing for Haiku and for Sonnet on autopilot. The bisect exit-code table (`references/recovery-and-bisect.md:16-23`) and the reflog rescue-branch pattern are correct and not obvious.
- Evidence: 1 session listed, 0 loads. Low exposure, so absence of evidence.
- Fixes: [med] add `history-fixup` and `history-shared-branch` outcome evals (none exist). [low] `:53` reword-via-sed recipe is fragile (macOS note, abbreviated shas); fine as is. [low] NOTICE/LICENSE for the MIT-derived text are present.

### gh-actions — KEEP-FIX (medium)
- Value: K-decision (action version policy `:41-56`, SHA pin plus trailing version comment, `permissions: {}` default, `pull_request_target` rules) plus hardening/audit references. The failed-run procedure with `gh run view --log-failed` is generic. Real usage: 5 loads, 6 calls in 5 sessions, the best of the gh-* set.
- Evidence: 31 sessions listed (9 per the sessions_listed/calls split), 142 listing tokens, 9.2 KB body plus 9 references (45 KB). One routing eval, no outcome eval.
- Fixes: [med] SKILL.md:14 still infers Forgejo from "not GitHub"; say "not GitHub: stop; if Forgejo/Codeberg point to forgejo-actions". [low] `SKILL.md:55` and `references/hardening.md:12` use `# v5.0.0`; use `# vX.Y.Z`. [low] 9 references is a lot; `go.md` and `codeql.md` are fine as lazy reads. [med] add the `gh-actions-pin-policy` outcome case (regex on the written workflow).

### gh-code-security — KEEP-FIX (low)
- Value: K-private-ish API specifics (the three dismissal-reason vocabularies and `hide_secret=true` in `references/alert-triage.md`; 3-hour re-push window; `secret_scanning.yml` limits `:75`). The "rotate first" decision (`:12-19`) is common sense. Sonnet would know most of the push-protection flow.
- Evidence: 5 sessions listed, 0 calls, 127 listing tokens. No evals, in no meta.
- Fixes: [med] no forge gate and no exclusion in the description (`:4`); the "Not for" line is in the body only (`:8`). Add "github.com only" and "Not for Dependabot config, CodeQL workflows, local scans". [med] add `push-blocked-secret` and `alert-dismiss` evals. [low] confidence is low because the plan-dependent API claims (`security_and_analysis` keys `:44`) are in the needs-source-check list.

### gh-issues — SLIM (medium)
- Value: mostly Generic. `gh issue create/list/view/edit/close` is well known. Newer facts: native `--type`, `--parent`, `--blocked-by` flags "arrived in gh 2.94.0" (`:28`) and the `--duplicate-of` close form (`:68`) are the part a model's training may miss. The approval gate (`:16-22`) is the owner's policy.
- Evidence: 31 sessions listed, 0 loads, 0 calls, 126 listing tokens. Of the gh-* set, never chosen.
- Fixes: [med] keep ~45 lines: CLI-version check, relationships flags and REST fallback (`references/api.md`, `projects.md`, `issue-fields.md`), approval gate; cut the Read/Create/Edit cheat sheet and `templates.md`, `search.md` (generic). [low] gh 2.94.0/2.102.0 claims need source check.
- If slimmed: nothing lost for Sonnet or Opus; Haiku loses the cheat sheet.

### gh-pr — KEEP-FIX (medium)
- Value: K-private taste. The Summary/Evidence/Merge Danger body (`:32-57`) and the summary-visuals vocabulary are the owner's format; the model would otherwise produce a generic "Summary / Test plan". The draft default and approval gate are policy. `--attach` (`:62-69`) is a recent gh feature (unverified).
- Evidence: 31 listed, 1 load, 1 call; 123 listing tokens; one routing eval.
- Fixes: [low] template lookup lists only `.github/` (`:18`); add root, `docs/` and lowercase. [low] no `--attach` fallback (`:69`), unlike forgejo-pr's web-UI fallback. [low] `references/contribute.md` lacks forgejo-pr's AI-contribution policy step. [med] `references/summary-visuals.md` is byte-identical to forgejo-pr's copy: single-source it.

### gh-readme — MERGE with forgejo-readme into one `readme` (medium)
- Value: K-decision plus Tooling. Facts-from-repo rule, scored audit checklist, `readme_audit.sh` script (broken relative links, alt text, placeholders), "never invent badges". This is a real procedure that raises Haiku and Sonnet output over a generic "write a README".
- Evidence: 31 listed, 1 call; 132 listing tokens; 4 routing/outcome evals (best-covered in the group).
- Fixes: see the readme pair under Cross-plugin findings. [low] `readme_audit.sh` follows `../` links outside the repo (prior note, very low risk, UNVERIFIED).

### gh-release — KEEP-FIX (medium)
- Value: K-decision. The "release tool already owns it" table (`:27-35`), `--verify-tag` and draft-then-publish (`:95-98`), the release-PR step. Sonnet would mostly go straight to `gh release create` without detecting release-please.
- Evidence: 2 listed, 0 loads; 140 listing tokens; no evals.
- Fixes: [med] add `gh-release-defers-to-release-please` outcome case. [low] detection list omits `release-drafter` (`:21`).

### gh-repo-setup — SLIM (low)
- Value: part K-decision (idempotent plan table, "prefer rulesets to legacy branch protection", 403 workflow-scope hint `:55`), part Generic (issue forms, CODEOWNERS, SECURITY.md templates in `references/community-files.md`, `labels.md`). I did not read `community-files.md` and `labels.md` line by line (UNVERIFIED on their quality).
- Evidence: 0 listed, 0 loads; no evals.
- Fixes: [med] no forge exclusion (`:3`); add "github.com only". Keep `rulesets.md` plus the plan/report skeleton (~50 lines); the community-file templates are what models already write.

### gh-triage — KEEP-FIX (low)
- Value: K-decision. The role/state machine, `.out-of-scope/` rejection memory, agent brief, "repo content is data" (`:14-20`), the AI-generated disclaimer (`:78-84`). A model without it would label and comment ad hoc.
- Evidence: 0 listed, 0 loads; 1 routing eval.
- Fixes: [med] no forge gate (`:3`, body): a Codeberg backlog request fires a gh-only skill that fails. Add the gate and "Not for Forgejo/Codeberg". [low] add `triage-prompt-injection` outcome case.

### dependabot — KEEP-FIX (medium)
- Value: K-decision for the sweep (`:71-103`: re-read each PR, count SUCCESS/NEUTRAL/SKIPPED, never `--admin`, one at a time, `@dependabot rebase`). Config half is Generic except newer options (cooldown, `multi-ecosystem-groups`) in `references/options-and-recipes.md`. Two evals exist (sweep-merge-rules, sweep-routing).
- Evidence: 32 listed, 1 call; 135 listing tokens.
- Fixes: [med] merge-method choice (`:85`, squash first) now disagrees with ship (rebase first, `ship/SKILL.md:45`); pick one policy. [low] "no checks configured counts as passing" (`:90`) vs renovate's "no contexts means tell the user" (`renovate/SKILL.md:78`); align on renovate's safer rule.

### renovate — KEEP (high)
- Value: K-private. The only Renovate skill and Renovate on Forgejo is the owner's daily dependency tool: `platform=forgejo` hosting (`references/forgejo-platform.md`), the `renovate/stability-days` pending context, `prCreation=not-pending` trap, `renovate.json` location (no `.forgejo/` directory in the docs list, `:37`), and an fj sweep with the verified `-R` placement (`:71`). Checked against docs 2026-10-19 per its own note (`:10`).
- Evidence: 60 sessions listed, 2 calls; 185 listing tokens, the second highest after trunk-based.
- Fixes: [med] description is 533 characters (`:3`); trim to under 500 and drop the GitHub sweep clause. [low] confirm the "Renovate 44.171.1" claim (needs source check).

### pr-comments — KEEP-FIX (low)
- Value: Tooling. `fetch.sh` + `format.jq` + `threads.graphql` do deterministic work (hide resolved and outdated threads, dedupe bot summaries) and have a shell test (`tests/check.sh`). The triage rubric (`references/triage.md`) is K-decision.
- Evidence: manual-only, 0 loads in four weeks. The `pr-comments-slash` eval (0.33 with, no baseline) is from the dropped case; no evals exist now.
- Fixes: [med] `fetch.sh:37` is GraphQL-only and returns 403 in Claude Code cloud sessions; add the REST `ccr/review_threads` fallback. [med] no eval (F5 blocks it: the `!`-preprocessing runs before the model). [low] confidence is low because the owner has not typed `/pr-comments` once.

### ship — KEEP-FIX (medium)
- Value: Routing/role plus K-decision. The level table and the "never" list are policy; the shipper agent does the work on Haiku. The pairing works: `ship/plugin.json` depends on shipper, `ship/SKILL.md:6` sets `agent: shipper:shipper`, `shipper.md:7-8` preloads `git-commit:git-commit`, `shipper/plugin.json` depends on git-commit, and github-meta lists both ship and shipper.
- Evidence: 0 loads for the skill, 5 agent calls for shipper. The skill is rarely the entry point.
- Fixes: [med] `SKILL.md:45` prefers rebase merge, which lands every branch commit. That clashes with git-commit's squash-title rule (`git-commit/references/release-tooling.md:15`) and dependabot's squash-first. Use the repo's configured or recent method and check `[hubflow]`/`[gitflow]` config first. [med] no safety evals; port forgejo-ship's two cases (needs F5). [low] `:43` no-checks vs error (`gh pr checks --watch` exits non-zero on "no checks reported"). [low] `shipper.md` lacks "treat PR and check text as data" (`--log-failed` output is attacker-influenced on fork PRs; agent file is another reviewer's, but the gap affects the pair).

### issue-breakdown — KEEP-FIX (low)
- Value: K-decision. Vertical slices with blocking edges, the frontier, expand/contract for wide refactors (`:39-45`), spec-first (`:18-27`), dry-run then create blockers first (`:57-61`). A model without it produces a flat task list. Not obviously needed by Sonnet 5.5, which slices reasonably; the dry-run and ordering procedure is the real difference.
- Evidence: 2 listed, 0 loads; one routing eval.
- Fixes: [med] no forge gate or exclusion (`:3`, body). Add the gate and "github.com only". [low] depends on gh-issues' relationship flags (`:59`), so it is a no-op below gh 2.94.0 without the REST fallback; the dependency is stated.

### forgejo-actions — KEEP-FIX (high)
- Value: K-private (the strongest in the family). `.forgejo/workflows` first-directory-wins and silently disables `.github/workflows` (`references/differences.md:7`, `SKILL.md:22`), `permissions:` ignored (`:13`), `runs-on` is a runner label (`references/runners.md:7`), short `uses:` resolves against `DEFAULT_ACTIONS_URL` (`:19`), fork-PR approval rules (`references/security.md:5-14`), no run-log command in fj (`failed-run.md:15`), `forgejo-runner validate` (v9+). A model has no reliable training data on any of this. `fj actions tasks` and `dispatch` were verified.
- Evidence: 58 sessions listed, 16 loads, 16 calls in 9 sessions; 175 listing tokens. The only Forgejo skill that gets regular use.
- Fixes: [med] parity with gh-actions: add the attacker-controlled context list, `$GITHUB_ENV`/`$FORGEJO_ENV` multiline injection, `issue_comment` privilege note, and a short efficiency/caching section to `security.md`. [med] add `forgejo-actions-dir-shadow` outcome case (warn that a new `.forgejo/workflows` disables `.github/workflows`) and a github.com negative. [low] `SKILL.md:41` hard-codes `checkout@v7`; use `@vN`. [low] "as far as we know" hedge on the job index (`failed-run.md:5`). [low] the Gitea gate (`SKILL.md:17`, same text in 8 skills) treats `.gitea/workflows` as proof of Forgejo.

### forgejo-cli — KEEP (high)
- Value: K-private. The `-H/-R/-r` placement table (`SKILL.md:36-43`) matches v0.7.0, the "no JSON, no raw API, no run logs" gap list, per-host auth and "never read keys.json" (`references/auth.md`), the `add-token` stdin rule. Every command in `references/commands.md` exists.
- Evidence: 58 listed, 10 loads and calls in 2 sessions; 133 listing tokens.
- Fixes: [low] the table says `fj issue -R <remote> <sub>`; leaves also accept `-R`. [low] add `fj pr checkout ^<id>`. [med] absorb forgejo-issues (see below). [low] eval `fj-token-safety` (no read of `keys.json`).

### forgejo-issues — MERGE into forgejo-cli (low-medium)
- Value: K-private facts (no label flag on create so labels are a second command `edit N labels -a`, no reopen, `edit N body` replaces whole body, `issue depend|block`). All verified. But the skill itself is not chosen.
- Evidence: 58 sessions listed, 0 calls, 121 listing tokens, while forgejo-cli with 10 calls already carries "issue create has no label flag" (`forgejo-cli/SKILL.md:53`) and the command map. Models resolve issue work through forgejo-cli.
- Fixes: [med] fold the Create/Edit sections and `references/templates.md` into `forgejo-cli/references/issues.md` (about 60 lines), keep a one-line pointer from the forgejo-cli description so the model still routes. [low] the `templates.md` body shapes (Bug/Feature/Task) are Generic.
- If merged: nothing lost for Sonnet or Opus; Haiku keeps the facts through forgejo-cli.

### forgejo-pr — KEEP (high)
- Value: K-private plus house format. `WIP: ` as the draft marker (`:28`), `pr create` does not push (`:21`), no head-branch filter on `pr search` (`:15`), `--agit` push-option equivalent with `{base64}` description (`references/contribute.md:44-47`), Codeberg's AI-content terms. Verified against `fj pr create --help`.
- Evidence: 58 listed, 6 loads and calls in 3 sessions; 142 listing tokens; one routing eval.
- Fixes: [low] step 3 does not mention release-please/commitlint like gh-pr (`gh-pr/SKILL.md:16`). [low] contribute.md flags several fj behaviors as "not verified"; `--head <owner>:<branch>` and AGit push by fj are still guesses. Test once with a throwaway Codeberg repo, or leave the hedge. [low] `references/summary-visuals.md` duplicate (see gh-pr).

### forgejo-pr-comments — MERGE into pr-comments (low-medium)
- Value: K-decision (triage rubric; duplicate of pr-comments' `triage.md`, which differs only in forge wording) plus a fj fetch procedure. No script: fetch is three `fj pr view/review` calls (`SKILL.md:29-31`) with explicit "resolved/outdated unknown".
- Evidence: manual-only, 0 loads; no evals.
- Fixes: [med] one `/pr-comments` skill with a forge-detect step and two fetch recipes would drop the duplicate triage.md and the duplicate gate text. [low] plugin.json description lacks "Not for GitHub PRs".

### forgejo-readme — MERGE with gh-readme into `readme` (medium)
- Value: K-private. The Forgejo rendering reference (`<picture>` stripped, README lookup order opposite of GitHub, `raw/branch/` image URLs, Mermaid and alerts render; several items marked *unverified*). The rest is a copy of gh-readme: `diff` of SKILL.md shows only forge wording; `audit-checklist.md` differs by 4 diff lines; `templates.md` is 7633 vs 7569 bytes.
- Evidence: 58 listed, 1 call; 150 listing tokens; one routing eval.
- Fixes: see the readme pair.

### forgejo-release — KEEP-FIX (medium)
- Value: K-private. The tag-then-`-t` recipe, `-b` has no file flag (`$(cat file)`), `-d false` to publish, `--by-tag` (all verified).
- Evidence: 22 sessions listed (not in forgejo-meta), 0 calls; 145 listing tokens; one routing eval.
- Fixes: [med] it is not in `forgejo-meta` (`forgejo-meta/plugin.json` lists 10 plugins, no forgejo-release or git-commit) and has no twin of gh-release's release-PR step; the owner's cutting-a-release prompt will not find it unless installed individually. Add it to forgejo-meta or `forges` docs. [low] `:19` `grep tags:` over-matches (docker/metadata-action); anchor under `push:`. [low] `:72` `fj tag list | fj tag view` is two commands. [low] `release view/edit` take the release name, say "name the release after the tag" (`:54`).

### forgejo-ship — KEEP-FIX (medium)
- Value: Routing/role. Mirror of ship with fj. The merge rules (read every context line, no `--method`, no `--agit`) are verified. The pairing works: `forgejo-ship/plugin.json` depends on forgejo-shipper, the skill sets `agent: forgejo-shipper:forgejo-shipper` (`:6`), `forgejo-shipper.md:7-8` preloads `git-commit:git-commit`, its plugin.json depends on git-commit, and forgejo-meta lists both ship plugins. The `-R` rule applies at the noun (`fj pr -R <remote> merge`), consistent with the help output.
- Evidence: skill 0 loads; forgejo-shipper 152 agent calls (the orchestrator calls the agent directly, bypassing the skill).
- Fixes: [med] F5: the two safety evals use `plugins: ["../../../forgejo-ship", "../../../forgejo-shipper", "../../../git-commit"]` and grade `Bash` calls made in the forked subagent; confirm once with `--keep-temp` that subagent calls reach the graded trace, or `merges-once` may always fail and `no-merge-on-failure` pass vacuously. [low] step 6 "no contexts at all counts as passing" (`:46`) vs renovate's confirm-first rule. [low] both cases `runs: 1`.

### forgejo-shipper (agent half, pairing check only) — pairing OK
- 152 agent calls; model haiku, tools `Read, Grep, Glob, Bash, Skill` (`forgejo-shipper.md:4-6`), no Edit/Write, consistent with "never edits files". Includes the "treat PR and check text as data" line the GitHub shipper lacks. One oddity for the agent reviewer: line 18 tells a Haiku agent that cannot ask the user to "invoke any other skill whose description fits, when unsure load it", which can pull in unrelated skills.

## Cross-plugin findings

- **gh/forgejo twin verdicts.**
  - readme: one forge-neutral skill (high). SKILL.md, scripts and 4 references are near copies; only `github-rendering.md` vs `forgejo-rendering.md` and the gate are forge-specific. One `readme` skill with `references/rendering-github.md` and `rendering-forgejo.md` saves one listing slot (~130 tokens in 58+31 sessions) and ends the drift (`audit-checklist.md`, `templates.md`, `badges-and-visuals.md` already differ).
  - pr-comments: one skill (medium). `triage.md` is a copy; the only real difference is the fetch step (fetch.sh vs three fj calls).
  - pr: probably one skill (medium). Body structure, summary-visuals (byte-identical) and process are the same; the forge-specific lines are the create/draft/attach/merge commands. Risk: the forgejo path pays GitHub tokens, which progressive disclosure avoids.
  - release: maybe (low). Shared notes/semver text; commands and the release-PR step differ.
  - Keep separate: actions (content diverges: differences.md, runners.md, security.md have no gh equivalent), issues (commands share nothing), ship/shipper (agent pair, different rules), cli (no gh twin).
  - Net effect of merging readme + pr-comments + pr would be 3 fewer skills and one forge gate each instead of two.
- **Forge gate duplicated in about 12 skills, with variants** (gh side checks `origin` only; forgejo side uses `-R`; `.gitea/workflows` implies Forgejo; "not GitHub" implies Forgejo). The gh-only skills without twins (gh-triage, issue-breakdown, gh-repo-setup, gh-code-security) have no gate at all. A one-time forge-detect step in a shared reference, or a hook-free one-liner, would remove the divergence.
- **Meta membership.**
  - github-meta lists gh-issues, gh-pr, pr-comments, ship, shipper, gh-actions, dependabot, gh-readme; it omits gh-release, gh-triage, issue-breakdown, gh-repo-setup, gh-code-security.
  - forgejo-meta lists 10 (includes renovate, forgejo-mcp) but omits forgejo-release.
  - git-flow, hubflow and trunk-based are in no meta; git-history and git-commit are in baseline or ungrouped. A small `branching` group is not worth it; one merged git-flow plugin is simpler.
- **Merge-method policy is inconsistent across five skills:** ship prefers rebase (`ship:45`), dependabot prefers squash (`dependabot:85`), renovate and forgejo-ship use the repo default and forbid choosing, gh-pr says "the method the repo allows or prefers" (`gh-pr:77`), and git-commit assumes squash titles matter (`release-tooling.md:15`). Pick one rule: use the repo's default; if the user names a method, use it.
- **"No checks" handling:** ship and forgejo-ship (no contexts = pass), dependabot (pass), renovate (ask). Pick the renovate rule.
- **Listing cost:** the family adds roughly 3,500 listing tokens in a session that installs all of it (sum of the 22 listed plugins' listing_tokens: about 3,350). The Forgejo set alone is about 1,350 per session; the gh set about 1,150. Merging readme, pr-comments and forgejo-issues would trim about 400.
- **Description length:** over 500 characters: trunk-based (662), hubflow (535), git-flow (528), renovate (533). Rest are under 500.
- **Eval infrastructure:** manual-only skills (ship, pr-comments, forgejo-pr-comments) cannot be tested until F5 (stub CLI for `!`-preprocessing, subagent trace). Do F5 before adding more manual-skill evals. `evals/forges` fixes are cheap: switch the two ambiguous scaffolds to `https://codeberg.org/...` or add `.forgejo/`, and add Bash with a stub, plus release/cli/ghe/triage cases.

## Needs source check

- git-flow-next v2.1.0 (2026-09-08), `git-flow-next` brew/winget/scoop/AUR names, nvie/gitflow archived 2025-10-14, AVH archived 2023-06-19, HubFlow v1.5.4 last commit 2022-05-01 (`git-flow/references/cli-commands.md:8-13`, `hubflow/SKILL.md:12`). From the repo's research note; I did not re-verify.
- gh 2.94.0 introduced `--type`, `--parent`, `--blocked-by` and 2.102.0 is current (`gh-issues/SKILL.md:28`); `gh pr create --attach` (`gh-pr/SKILL.md:69`).
- Renovate 44.171.1 on 2026-10-19 and "accidental major with no breaking changes" (`renovate/SKILL.md:10`).
- Forgejo claims in forgejo-actions: `workflow_run` "not in the documented event list" (`references/differences.md:19`; Forgejo may have added it since), default `DEFAULT_ACTIONS_URL` `https://data.forgejo.org` (`runners.md:19`), `forgejo-runner validate` needs v9 (`runners.md:23`), `get_action_job_logs` needs Forgejo v16 (`failed-run.md:13`), fork-PR approval details including the three-month trust expiry (`security.md:11`), job-level `continue-on-error` ignored (`differences.md:14`).
- `code.forgejo.org/actions/checkout@v7` tag (`forgejo-actions/SKILL.md:41`), checked by the prior review.
- Forgejo AGit push options (`title`, `description` with `{base64}`, `force-push`) and `--head <owner>:<branch>` for forks in fj (`forgejo-pr/references/contribute.md:36-49`, flagged "not verified" in the file).
- Codeberg terms on generative-AI code, cited in 9 skills (`forgejo-pr/SKILL.md:10`, etc.).
- GitHub secret scanning limits: 1,000 `paths-ignore` entries, 1 MB file, 3-hour bypass window (`gh-code-security/SKILL.md:75`, `:57`).
- gh-actions `references/actions.md:12` (node20 vs node24) and `references/hardening.md` action versions.
