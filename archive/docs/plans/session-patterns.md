# Session patterns: automation candidates

Repeated patterns from Claude Code and pi sessions, ranked as candidates for skills, hooks, mods, commands, and instruction changes. Status: for review. Built 2026-10-10: K1 (`github:ship`), I1 (planning closing review), I2 (`infra:terraform` triggers and terragrunt reference), S3 (`infra:ansible`). Batch 2, same day ([plan](session-patterns-batch2.md)): H2 (`infra` cloud-ops guard), H6 (`authoring` docs-sync nudge), K3 (`github:actions` failed-run path), K4 (repo-local `ship-plugin`), K5 (`github:dependabot-prs`), S6 (`efficient-core:review-loop`), S7 (`tooling:hook-repair`), S10 and C1, C2, C5 (global CLAUDE.md), I3 (`efficient-core:implement-plan`), I4 (`authoring:agent-teams` slice landing), I5 (`sentry:sentry` project profile), M1 (`agent-status` mod). Deferred: H5, until C2 has been tried. Dropped: M2, since the mod API exposes no MCP server state.

## Method

| Item | Value |
| --- | --- |
| Date | 2026-10-10 |
| Corpus | `~/.claude/projects/*/*.jsonl` (main sessions only) and `~/.pi/agent/sessions/*/*.jsonl` |
| Human-typed sessions | ~370 (Claude ~130, pi ~240) across ~40 projects |
| pi subagent sessions | 2,067 briefs, identified by `parentSession` in the session header, analyzed separately |
| Excluded | Claude `subagents/`, `/tmp` smoke repos, claude-mem observer sessions, `tmp-pi-agent-*` |
| Extraction | Human prompts plus per-session tool and bash-head counts, condensed from 1.6 GB to 3.8 MB |
| Analysis | 4 parallel agents (homelab-mgmt, work projects, personal tooling, pi briefs), each checked against the installed inventory |
| Bar | ≥2 sessions for human patterns, ≥5 for brief templates. Counts are sessions, not mentions |

Per-chunk evidence, with session refs and verbatim examples, lives in [`docs/research/session-patterns/`](../research/session-patterns/). Section refs below point there.

## Security finding (act first)

- Agents printed decrypted sops secrets into homelab-mgmt transcripts in 4 sessions. One of them printed part of the `omni_gpg_key` private key. The user's own `! sops -d --extract` runs also landed secrets in 3 sessions. Those transcripts sit on disk in `~/.claude/projects/-home-buck-Projects-voidrot-homelab-mgmt/`. Five claude-mem observations mention `omni_gpg_key` or a PGP header (#6163, #6182, #6452, #6478, #7570). A check for long base64 runs found no key body in them, but a manual look is still worthwhile. Rotating keys is the user's call. In past sessions the user declined rotation each time it was offered.
- The fix is candidate H1 below.

## Ranking

Priority = sessions × turns saved, adjusted for risk. P1 means build next, P2 means worth building, P3 means cheap or opportunistic.

### Hooks

| ID | Pri | Candidate | Sessions | Where | What it does |
| --- | --- | --- | ---: | --- | --- |
| H1 | P1 | `secret-output-guard` | 4 human + 330 briefs | plugin (new or `pass-cli`) | PreToolUse on Bash. Blocks `sops -d` / `--extract` and reads of `.env*` unless the output is captured into a variable or file, never stdout. Pair it with a `sops:copy` mise task for the user's own `!` runs. |
| H2 | P1 | `cloud-ops-guard` | 6 human + 204 briefs | plugin (`infra`) | PreToolUse on Bash. Allows `tofu apply <saved.tfplan>` and blocks untargeted `apply -auto-approve`, `import`, and `state` mutations. In subagent sessions it blocks credentialed `aws` and `tofu plan` unless the brief carries an `ALLOW:` token. It replaces the blanket `mise run tofu:*` allow rule. |
| H3 | P2 | `write-boundary` | 326 briefs | plugin hook + pi extension | The brief declares `WRITE: <globs>`. PreToolUse then blocks Edit/Write outside those globs, plus `git checkout/reset/restore/stash/clean` while other writers share the checkout. This turns prose guardrails into enforcement. |
| H4 | P2 | `project-aws-profile` | 9 | project `.claude/settings.json` `env` | Sets `AWS_PROFILE=rovitracker` for the platform repo and `installsync` for installsync. A SessionStart check reports an expired SSO session. Today the agent prefixes `export AWS_PROFILE=` on up to 43 bash calls per session. No code is needed, only settings. |
| H5 | P3 | `keep-going` Stop hook | 6–8 (mostly pi) | plugin | Blocks Stop while the active plan or task list has unchecked items and the last turn asked no question. It only reports how many items remain. Claude-side benefit is UNCONFIRMED, so try the instruction fix in C2 first. |
| H6 | P3 | `docs-sync-nudge` | 8 | plugin (`authoring`) | Stop hook that lists docs referencing the changed paths and offers `authoring:docs-audit`. |

### Commands

| ID | Pri | Candidate | Sessions | Where | What it does |
| --- | --- | --- | ---: | --- | --- |
| K1 | P1 | `/ship [push\|pr\|merge]` | ~113 commit+push (51 personal, 62 work), 22 PR/merge, 54 commit briefs | `git` / `github` plugin | One command for the most-typed chain, "commit, push, create pr, then merge pr". It runs `git:commit`, then pushes. `pr` also opens the PR and watches `gh pr checks`. `merge` also squash-merges after approval, deletes the branch, and syncs main. A failure hands off to K3. Today `git:commit` refuses to push, and `commit-commands` is not enabled, so every commit costs another turn. |
| K2 | P2 | `/wt-start <topic>`, `/wt-finish [--merge\|--pr]` | 16 human + 35 briefs | `git` plugin | Covers the per-task worktree ritual: create from a pinned base, verify toplevel and HEAD before the first edit, then merge into the parent branch or open a PR, check for unmerged commits, and remove the worktree and branch. One cleanup deleted 26 stale worktrees. `git:worktree` covers mechanics, not this lifecycle. |
| K3 | P2 | CI run triage fast path | 12 | `github:actions` (improve) | Triggers on an `actions/runs/` URL. Runs `gh run view --log-failed` and classifies the failure as a missing var or secret, OIDC permissions, a runner/toolcache problem, or code. Then it fixes, reruns, and watches. Recurring causes go in a reference (CodeBuild runner toolcache, OIDC role). |
| K4 | P2 | `/ship-plugin <name>` | 5 | this repo, `.claude/commands/` | Validates `--strict`, checks that the docs page, README row, and marketplace entry are current, then commits, fast-forwards into main, pushes, runs `claude plugin install <name>@adminhead`, and reminds the user to `/reload-plugins`. It replaces a 5–7 turn tail. |
| K5 | P3 | Dependabot merge sweep | 4 | `github` plugin | Lists open Dependabot PRs grouped by ecosystem, merges green ones in order, rebases or reruns stale ones, fixes or skips red ones, and ends with a result table. `github:dependabot` covers only config. |

### Skills: new

| ID | Pri | Candidate | Sessions | Where | What it does |
| --- | --- | --- | ---: | --- | --- |
| S1 | P1 | `homelab-add-service` | 9 | project-local, `voidrot/homelab-mgmt/.claude/skills` | The full service-add checklist: tofu VM from the template, the compose role (digest pin, 127.0.0.1 bootstrap), `hosts.yml`/`site.yml`/haproxy/`dns.yml`/`ip-addresses.md`/`agents.yml` entries, the optional authentik OIDC app, and the fixed acceptance checks. Briefs restate it in about 40 lines each time. |
| S2 | P1 | `rovitracker-prod-investigate` | 14 | project-local, rovitracker/platform | Triggers on an omnisync Step Functions ARN, a Sentry short-id, or "investigate <svc> in prod". It walks the path the user re-explains each time: execution history and failed state, ECS or Lambda logs, the toolbox MCP DB query, a Sentry cross-check, and known gotchas (RDS proxy, rovidb2 private DNS). |
| S3 | P1 | `infra:ansible` | 24 | `infra` plugin | Ansible is the main tool in homelab-mgmt, and the plugin has no skill for it. Covers `changed=0` idempotency reruns (13 sessions), `--check` limits (a broken haproxy config passed check mode), and `mise exec` vs `uv run`. |
| S4 | P2 | `rovitracker-onboard-app` | 7 | project-local | Checklist for making a new app or lambda deployable: release-please config and manifest, deploy-app routing and release-trigger workflows, the ECR module, the terragrunt app unit with config and secret, and a Sentry project with DSNs in app config. Ends with a "what's left to deploy X" report. The user re-derived it for 6 services. |
| S5 | P2 | `nix-home-manager-ops` | 18 | project-local, `voidrot/home-manager` and `homelab-nix` | Three procedures. Add a package: `nix search`, place it in the right module, `nix fmt`, `nix eval` per host. Triage a rebuild failure: innermost `error:`, `--show-trace`, then classify. Triage a user service or coredump: `systemctl --user`, `journalctl`, `coredumpctl`, nix-ld. Keep it project-local. On 2026-09-30 the user dropped the global nix skills. |
| S6 | P2 | `review-loop` | 452 briefs in 52 multi-review parents | `efficient-core` or agent defs | The reviewer writes findings to a file. The fixer brief says "fix exactly these, preserve other edits". The re-review gets the same file plus the new HEAD and checks only those blockers and regressions. Default verdict `APPROVED \| CHANGES REQUIRED`, capped at 3 rounds. Only 12 of these briefs passed findings by file. The rest re-summarized them by hand. |
| S7 | P2 | `hook-repair` | 46 briefs | `tooling` plugin | Reruns the failing pre-commit/prek hook, fixes only the reported findings, never suppresses rules, weakens tests, or bulk-reformats, reruns the exact hook, and does not commit. `tooling:pre-commit` covers setup, not repair. |
| S8 | P3 | `mcp:smoke-test` | 5 | `mcp` plugin | "Test the X MCP tools": checks the connection, lists tools, calls each read-only tool with minimal args, skips mutating tools, and reports a pass/fail table. `mcp:review` forbids live probes, so it doesn't cover this. |
| S9 | P3 | `freecad-design-loop` | 7 | project-local, `voidrot/3d-designs` | Load the reference STEP, extract dimensions and ports, prototype parametric parts, run fixed fit and printability checks, export STL per part, and build Bambu multi-color text bodies. Includes the FreeCAD Wayland crash fix. Seed it from the CLAUDE.md written in session 5d53c68f. |
| S10 | P3 | operator handoff queue | 7 | skill or convention | One tracked list of manual operator steps ("what else is waiting on me"), replacing about 40 "X is done" replies. It could be a claude-mem `work_state` list convention rather than a new skill. |

### Skills: improve existing

| ID | Pri | Skill | Sessions | Change |
| --- | --- | --- | ---: | --- |
| I1 | P1 | `efficient-core:planning` | ~40 (20 + 16 + 4) | Add a closing gap and open-question pass. Ask blocking questions through AskUserQuestion, with each option explained. Save the plan to `docs/plans/<name>.md`. Step 5 now says to proceed on assumptions "rather than asking", which cuts against what the user asks for every time. Users answer prose question lists with "#1 … #2 …" in 16+ sessions. |
| I2 | P1 | `infra:terraform` | 23 + 10 | It never triggered in 23 homelab sessions that ran tofu plans. Across 31 sessions only 2 Skill calls happened at all. Fix the description triggers for tofu/terragrunt/`mise run tofu`. Add references for targeted applies, `-lock-timeout`, and the recurring terragrunt errors (`There is no variable named "dependency"`, fck-nat `user_data` inconsistent final plan). |
| I3 | P2 | `claude-mem:do` or a thin `/implement-plan <path>` | 12 + 6 | Add a run-to-completion contract: split into tasks, fan out to worktrees, and continue between phases unless blocked. Track "what's left" in the plan file. The user typed "continue implementing" 5–17 times in single sessions, and "yes commit and continue" after each approved slice. |
| I4 | P2 | `authoring:agent-teams` | 6 | Bundle the slice-landing protocol the lead hand-wrote in scratchpads that are now gone: a contract file, a serialized rebase-and-land script, and a lock. |
| I5 | P2 | `sentry:sentry` | 7 | Make the user's standard a project-overridable profile: errors, logs (zerolog bridge at warn+), metrics, and traces; no client scrubbing; default breadcrumbs; dev sample rate 1.0; DSNs in IaC app config. |
| I6 | P3 | `pass-cli:pass-cli` | 4 | Add a Proton Pass ssh-agent troubleshooting reference covering `SSH_AUTH_SOCK` in GUI vs shell, `gpg.format=ssh` signing with a `key::` literal, keychain/omz agents fighting it, and the agent service's PAT/keyring wiring. |

### Mods

| ID | Pri | Candidate | Sessions | What it shows |
| --- | --- | --- | ---: | --- |
| M1 | P2 | `agent-status` | 4 | Running background agents and teammates with idle time, plus done/total slices. Answers "is slice 120 stuck?" and "what's left". |
| M2 | P3 | `mcp-status` | 9 | Health of the project's MCP servers (connected, failed, or needs auth). Replaces toggling `/mcp` and typing "try now" 2–4 times per session. Check first whether the mod API exposes MCP state (UNCONFIRMED). |

### Instruction changes (CLAUDE.md, AGENTS.md, agent defs)

These cost a few lines each. No new component is needed.

| ID | Pri | Target | Sessions | Change |
| --- | --- | --- | ---: | --- |
| C1 | P1 | global `~/.claude/CLAUDE.md` | 10 + 4 + 8 | Open decisions go through AskUserQuestion, one at a time, never as a numbered prose list. Works with I1. |
| C2 | P2 | global CLAUDE.md | 12 + 6 | When an approved plan has remaining slices, commit each approved slice and continue without asking, unless blocked. Try this before H5. |
| C3 | P1 | `voidrot/homelab-mgmt/CLAUDE.md` (missing today) | 9 | Tool entrypoints (`mise run tofu plan -out`, apply the saved plan then delete it, `mise exec` vs `uv run` for ansible), storage-pool conventions, sops layout, and "don't offer key rotation" (declined 4 times). |
| C4 | P2 | rovitracker `CLAUDE.md` | 7 | Small-team minimalism: no added validation scripts, precondition gates, or approval gates. Prefer marketplace actions. No mise in CI (rate limits). `.reusable.yml` suffix. `<app>-<component>-<purpose>-<env>` naming. Agents keep re-adding gates the user then strips. |
| C5 | P3 | global CLAUDE.md | 3 | For JS/TS lint and format, use Biome or oxlint/oxfmt, not Prettier+ESLint, unless the repo already chose one. |

### pi-specific

These target `~/.pi/agent` (managed in home-manager), not this repo.

| ID | Pri | Target | Briefs | Change |
| --- | --- | --- | ---: | --- |
| Pi1 | P1 | all pi agent defs and `~/.pi/agent/AGENTS.md:116` | 745 | Every subagent runs `prompt_mode: replace`, so the orchestrator re-forwards AGENTS.md and overrides in 36% of briefs and drops scoped files inconsistently. Add a fixed body line to each def: read `~/.pi/agent/AGENTS.md` and every AGENTS.md/CLAUDE.md from repo root to the target, nearest wins. Then remove the forwarding mandate. An append prompt mode would be cleaner but is UNCONFIRMED. |
| Pi2 | P2 | read-only pi defs (reviewer, quick-review, explore, plan, librarian) | 1,029 | Bake in the output contract: word cap, severity-ranked findings with path:line, and a stop rule. Tell the orchestrator to state only deviations. These roles already lack edit tools, yet briefs still say "read-only". |
| Pi3 | P2 | pi routing matrix | 266 | `coder-simple`, `fixer`, `fixer-high`, and `fixer-max` handled 266 briefs but no longer exist as defs, and the routing matrix still names `coder-simple`. Reconcile them. |
| Pi4 | P3 | pi orchestrator / workflows | 136 in 30 fan-outs | Write shared context once to `$TMP/<run>/context.md` and pass the path. About 391K chars were re-pasted across sibling briefs. |
| Pi5 | P3 | pi role defs | 119 | Name each role's standing skills in the def (plan → efficient-planning, committer → git-commit) instead of forwarding SKILL.md paths. |
| Pi6 | P3 | pi `AGENTS.md` | 9 | Port the Claude Orchestration and Routing sections in one pass, replacing piecemeal edits. |

## Suggested order

1. H1 (secret guard), plus a decision on the leaked key.
2. K1 `/ship`, then I1 + C1 (planning gap pass and AskUserQuestion). These three cover the most typed turns.
3. I2 terraform triggers, then S3 ansible and C3 homelab CLAUDE.md, the cheapest homelab wins.
4. H2 cloud-ops guard, then S1 and S2 project skills.
5. pi Pi1–Pi3 in one home-manager pass.
6. Everything else as the need recurs.

## Excluded

| Looked like | Why excluded |
| --- | --- |
| Commit message quality | `git:commit` covers it, with no complaints. The push gap is K1 |
| Plan → implement | `efficient-core:planning` and `claude-mem:make-plan`/`do` cover it. The gaps are I1 and I3 |
| ADRs, AGENTS.md→CLAUDE.md migration, docs-URL → skill | `authoring:*` skills cover these |
| Over-engineering reviews | ponytail covers them. Repo-specific rules went to C4 |
| `/context` checks | `usage-band` covers them |
| PR review-comment loops, issues from findings | `github:pr-comments`, `claude-mem:babysit`, `github:issues` |
| `/plugin` and `/reload-plugins` churn | Iteration noise, not a procedure |
| tmux/claude-tmux, GPU passthrough, Omni, AWS one-liners | One script or a single session each |
| Diagnose-only and "medium breadth" brief templates | Fewer than 5 briefs |
| Session mining (this task) | 2 sessions. The extractor lives in this session's scratchpad if it recurs |
