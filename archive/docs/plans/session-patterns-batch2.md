# Session patterns, batch 2

Build plan for the second batch of candidates from [session-patterns.md](session-patterns.md). Status: built and merged to local `main`, 2026-10-10. H2 changed in review: apply and output are never auto-allowed (see docs/plugins/infra.md).

Already built, out of scope: K1 (`github:ship`), I1 (planning closing review), I2 (`infra:terraform`), S3 (`infra:ansible`).

## Outcome and completion

- Outcome: 15 of the 17 candidates land as hooks, skills, a mod, a repo-local command, and global instruction lines. H5 is deferred and M2 is dropped (see Decisions). Each candidate is checked by its own test or eval, and the batch merges into local `main`.
- Completion conditions:
  - Every in-repo item has a passing check from the Verification table, and `claude plugin validate --strict .` passes.
  - Each touched plugin has its version bumped once, matching in `plugin.json` and `.claude-plugin/marketplace.json`, with its `docs/plugins/<name>.md` page and README row updated.
  - `docs/plans/session-patterns.md` marks each item built or dropped, and says why for any that were dropped.
  - Global `~/.claude/CLAUDE.md` holds the C1, C2, C5, and S10 lines.

## Requirements and choices

### Fixed requirements

- Follow the house authoring standard (`docs/plans/skill-adoption.md:36-57`).
  - A description says what the skill does, "Use when …", "Not for … (`plugin:skill`)", and stays under 1024 characters.
  - SKILL.md holds the procedure, and references hold the detail.
  - Write in plain imperatives with reasons.
- Plugins declare no `dependencies`. A cross-plugin pointer says "(`plugin:skill`, if installed)".
- Guards fail toward safety:
  - A security hook that can't parse a command it matches returns `ask`, not allow.
  - A security hook that crashes also returns `ask`. Claude Code treats any exit code other than 0 or 2 as a non-blocking error and runs the call, so the script wraps `main` in a catch-all that prints `ask` and exits 0.
  - The H6 nudge hook fails open, so a broken nudge never traps a session.
- No hook prints secrets or environment values.
- Nothing is pushed, and no user settings change, without the user's say-so. H2 replaces the `Bash(mise run tofu:*)` allow rule in `voidrot/homelab-mgmt/.claude/settings.local.json`, and the user makes that edit.
- I5 stays generic. The user's personal Sentry defaults go into their own projects' profiles, not into the plugin.

### Implementation suggestions (replaceable)

- Write the classic command hooks in Python 3, stdlib only, to match `docs_drift.py`. Use `shlex` to split compound commands. Test them with a `tests/check.sh` harness that feeds JSON fixtures, following `plugins/code-search/scripts/tests/check.sh`.
- Use classic hooks rather than mod `tool.check` for H2 and H6. Mods are early access (`index.d.ts:4`). Classic hooks are documented and stable.
- Store per-session hook state in `${CLAUDE_PLUGIN_DATA}`, keyed by `session_id`.

### Discovery findings

- Hook API, from https://code.claude.com/docs/en/hooks.md:
  - PreToolUse input carries `agent_id` and `agent_type` inside subagents.
  - A deny ranks above ask, which ranks above allow. A blocking hook takes precedence over settings allow rules (permissions.md). A hook `allow` does not bypass deny or ask rules.
  - A hook `allow` approves the whole Bash string, including every segment of a compound command.
  - Stop input has `stop_hook_active` and `last_assistant_message`. `{"decision":"block","reason"}` keeps Claude going.
  - After 8 consecutive blocks, the engine forces a stop.
  - `TaskCreated` and `TaskCompleted` hook events exist, with no matcher support (`index.d.ts:4987`). A task deleted through `TaskUpdate` fires neither, so a count built from them drifts.
- A hook cannot see a subagent's brief. A subagent transcript lives at `~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl`. Whether a hook can reliably derive that path is UNCONFIRMED.
- The mod API's `$.agent.list()` returns `id`, `name`, `type`, `status` (pending, running, waiting, idle, completed, failed, killed), `parentId`, and `description` (`index.d.ts:125-196`). It has no timestamps, so a mod has to track idle time itself.
- The mod API has no MCP server status. `$.mcp` has only `call` and `connect`, and `connect` works only for servers in the plugin's own manifest. `$.tool.list()` returns `ToolInfo` with only `name`, `description`, and `mcp: boolean` (`index.d.ts:12409`), with no server field. M2 is therefore dropped (see Decisions).
- Mods exist: `usage-band`, `git-line`, and the `example` template. They are tested with `claude plugin test` from `plugins/<mod>/tests/*.test.tsx`, and their docs pages follow the "What it shows / How it updates / Install" layout.
- The repo has no PreToolUse or Stop hook yet. Its one classic hook is `code-search`'s SessionStart hook.
- The repo has no CI. All checks run by hand.
- `github:actions` takes a run ID, not an `actions/runs/` URL, and has no failure classes. `github:dependabot` is config-only by design (`SKILL.md:3`).
- `tooling:pre-commit` covers setup only.
- `sentry:sentry` hardcodes no personal standard and has no profile concept.
- `efficient-core:second-opinion/references/dual-review.md:27-28` already caps fix rounds at 3. Its skill is read-only, though, so a fixer step doesn't belong there.
- claude-mem, which provides `do`, `make-plan`, and `work_state`, is external. I3 therefore becomes a skill in this repo.
- Global `~/.claude/CLAUDE.md` is a plain file, not managed by home-manager.

### Material unknowns

| Unknown | Assumption | Least updating evidence | Trigger |
| --- | --- | --- | --- |
| Can H2 read a subagent's brief for an `ALLOW:` token? | Yes. The hook derives the subagent transcript path from `transcript_path`, `session_id`, and `agent_id`, and reads the first user message. | A spike: a Bash PreToolUse hook in a test subagent logs its input and the derived path. | If the path isn't derivable, drop the token. In subagents, credentialed `aws` and `tofu plan` then get `ask`, which in practice means the main session runs them. |
| Can a mod see task progress (done/total) for M1? | Only by counting Task tool calls, which drifts on deletes (see discovery). | Read the mod `tool.call` types for TaskCreate and TaskUpdate inputs. | If `TaskUpdate` with a deleted status is visible, count it. Otherwise M1 ships agent status only. |
| What counts as "credentialed `aws`" for H2? | Any `aws` call except `--version` and `help`. | None needed. It is a definition. | Revisit if read-only calls such as `sts get-caller-identity` prompt too often in subagents. |
| Which command updates an installed plugin from the local marketplace (K4)? | `claude plugin marketplace update adminhead`, then `claude plugin update <name>@adminhead`. | `claude plugin update --help` and one run. | Adjust the K4 steps to whatever works. |

## Lanes

Each lane is one `coder` in its own worktree, except lanes I and H, which I do directly. Lanes write only inside their own write surface. Lanes A and F are the riskiest, so they start first.

| Lane | Items | Write surface | Risk | Review |
| --- | --- | --- | --- | --- |
| A | H2 | `plugins/infra/{hooks,scripts}`, infra docs and version | High: it can block real infra work, or fail to block it | `review` and `security-auditor` |
| B | H6, I4 | `plugins/authoring/{hooks,scripts,skills/agent-teams}`, authoring docs and version | Medium | `quick-review` |
| C | K3, K5, ship step-6 handoff | `plugins/github/skills/{actions,ship}`, a new `github` skill, github evals, docs and version | Low | `quick-review` |
| D | S6, I3 | `plugins/efficient-core/skills`, docs and version | Low | `quick-review` |
| E | S7, I5 | `plugins/tooling`, `plugins/sentry`, their docs and versions | Low | `quick-review` |
| F | M1 | New `plugins/agent-status`, its marketplace entry and README row | Medium, on the early-access API | `quick-review` |
| H | K4 | `.claude/skills/ship-plugin/SKILL.md` (repo-local) | Low | self-review |
| I | C1, C2, C5, S10 | `~/.claude/CLAUDE.md` (outside the repo, not committed) | Low | self-review |

- Shared files are `README.md` and `.claude-plugin/marketplace.json`. Each lane touches only its own rows and entries. Only the orchestrator edits `docs/plans/session-patterns.md`. I merge the lanes in order A→F and resolve conflicts there.
- Subagent worktrees can't run `git`, because of the guard noted in memory. Coders leave changes uncommitted, and I commit each lane after its review.
- Lane D's I3 skill and lane I's C2 line describe the same contract. Both say: commit each approved slice and continue unless blocked. I write C2 first and give its wording to lane D.

## Steps

### Lane A: H2 `cloud-ops-guard` (infra)

1. Spike the subagent-brief question from the unknowns table. Record the result in the lane report.
2. Add `plugins/infra/hooks/hooks.json` with a PreToolUse hook on `Bash`. It runs `scripts/cloud-ops-guard.py`.
3. Tokenize with `shlex.shlex(posix=True, punctuation_chars=True)`, because plain `shlex.split` leaves `plan;apply` as one token. Split segments on `&&`, `||`, `;`, `|`, `&`, and newlines.
4. In each segment, see through these forms:
   - `VAR=x` prefixes, `env`, and `sudo`.
   - `mise exec --`.
   - `mise run tofu <env> <subcommand>`, skipping the env positional, as in `mise run tofu core plan`.
   - `terragrunt`, including `run --all`, plus `tofu`, `terraform`, and `-chdir=`.
5. Classify each segment:

   | Segment | Decision |
   | --- | --- |
   | `apply <file.tfplan>` (a saved plan) | safe |
   | `plan`, `validate`, `fmt`, `init`, `output`, `state list\|show` | safe |
   | `apply` without a saved plan, interactive or `-auto-approve` | deny, reason "save a plan with -out, then apply that file" |
   | `destroy`, `import`, `state rm\|mv\|push\|replace-provider` | deny, with the safe alternative in the reason |
   | Any `aws` call except `--version` and `help`, or `tofu\|terragrunt plan`, inside a subagent | deny unless the brief has a whole line `ALLOW: cloud-ops`. If the spike fails, `ask` instead |
   | A matched tool inside `$()`, backticks, `bash -c`, `eval`, or any matched-tool token it can't classify | ask |
   | No matched tool | none |

6. Combine the segment results into one decision:
   - Any deny makes the whole command deny, and any ask makes it ask.
   - Return `allow` only when every segment is safe and the command has no `$()`, backticks, redirects, or `bash -c`. An allow approves the whole string, so one unchecked segment would ride along.
   - Return no output otherwise, so the normal permission flow applies.
7. Write the `ALLOW:` token into the docs as a model-written brief marker. It is not the user's consent, and the docs say so.
8. Add `scripts/tests/check.sh` with fixtures for every row above. Include compound, quoted, `$()`, `bash -c`, `VAR=` prefix, and wrapper forms, a non-matching command, malformed stdin (expect `ask`), and a forced exception (expect `ask`).
9. Add an "Ops guard" section to `docs/plugins/infra.md`. It says what is blocked, how `ALLOW:` works, and that the user should replace the `mise run tofu:*` allow rule. Bump infra to 0.4.0.

### Lane B: H6 `docs-sync-nudge` and I4 slice landing (authoring)

1. H6: add a Stop hook running `scripts/docs-sync-nudge.py`.
   - When `stop_hook_active` is set, exit 0 so the hook never loops.
   - Otherwise, collect the changed non-doc paths. These are the working-tree changes plus commits since the HEAD that a SessionStart hook recorded for this `session_id`. Then find docs that mention those paths or their basenames, using `git grep -l`.
   - Act once per change set, keyed by a hash of the sorted paths stored in `${CLAUDE_PLUGIN_DATA}`. The action is to block the stop with a reason that lists the docs and asks Claude to check them or offer `authoring:docs-audit`.
   - Fail open, and skip silently outside a git repo.
2. Add fixture tests for H6: no change, a code change with a referencing doc, a doc-only change, a repeat with the same hash, and `stop_hook_active`.
3. I4: add `skills/agent-teams/references/slice-landing.md` with a contract-file template, a lock, and the land protocol.
   - The lock is `flock` on `.git/slice-land.lock`.
   - The protocol is: rebase the slice branch on the parent, run the slice's check, fast-forward the parent, and release the lock.
   - Add `scripts/land-slice.sh` with a `check.sh` that uses temp repos. Point to it from SKILL.md in one line.
4. Bump authoring to 0.4.0 and update its docs page and README row.

### Lane C: K3, K5, and the ship handoff (github)

1. K3: widen the `github:actions` description to cover a pasted `actions/runs/<id>` or `/job/<id>` URL and "CI failed". Then add a "Failed run" procedure:
   - Parse the URL into the repo and run ID.
   - Run `gh run view --log-failed`.
   - Classify the failure as a missing var or secret, OIDC or permissions, a runner or toolcache problem, flaky, or a code failure.
   - Fix it, rerun with `gh run rerun --failed`, and watch.
   - Put recurring causes, such as the CodeBuild runner toolcache and the OIDC role, in `references/failure-classes.md`.
2. Have `github:ship` step 6 hand failed checks to `github:actions` instead of only summarizing them.
3. K5: add a new skill, `github:dependabot-prs`, so that `github:dependabot` stays config-only. It should:
   - List open Dependabot PRs grouped by ecosystem.
   - Merge green ones one at a time, re-checking the next one after each merge, using the repo-allowed method and never `--admin`.
   - Comment `@dependabot rebase` on stale PRs and rerun flaky ones.
   - Report red ones without fixing them unless the user asks.
   - End with a result table.
   - Treat the user's request as authorization for green merges only.
4. Add "Not for merging Dependabot PRs (`github:dependabot-prs`)" to the `github:dependabot` description.
5. Add routing evals: `actions-run-url-routing`, and `dependabot-prs-routing` with a not-`dependabot` grader.
6. Bump github to 0.5.0 and update its docs page and README row.

### Lane D: S6 and I3 (efficient-core)

1. S6: add a new skill, `efficient-core:review-loop`.
   - The reviewer writes findings to `<scratchpad>/review-<slug>.md`. Each finding has an ID, severity, `path:line`, and claim, and the file ends with a verdict of `APPROVED` or `CHANGES REQUIRED`.
   - The fixer brief says "fix exactly these IDs, preserve unrelated edits".
   - The re-review gets the same file plus the new HEAD, and checks only those IDs and any regressions they caused. It runs at most 3 rounds, then reports what is still open.
   - Have `second-opinion/references/dual-review.md` point to it for the findings format.
2. I3: add a new skill, `efficient-core:implement-plan <path>`.
   - Read the plan, mirror its slices as tasks, and run independent slices in worktrees.
   - After each slice: check it, review it, commit it when the plan or user approved per-slice commits, and update a "Status" or "What's left" block in the plan file.
   - Continue to the next slice unless blocked. Stop only on a failed check after 3 attempts, a decision the user owns, or a destructive step.
   - Use the C2 wording.
   - Point to `claude-mem:do` (if installed) for plans made by `make-plan`.
3. Add routing evals for review-loop and implement-plan. Bump efficient-core to 0.4.0 and update its docs page and README row.

### Lane E: S7 and I5

1. S7: add a new skill, `tooling:hook-repair`.
   - Rerun the failing pre-commit or prek hook, then fix only the reported findings.
   - Never suppress rules, weaken tests, bulk-reformat, or use `--no-verify` or `SKIP=`.
   - Rerun the exact hook, and leave the changes uncommitted.
   - Have `tooling:pre-commit` point to it with "Not for …".
   - Add a routing eval.
2. I5: add a project profile to `sentry:sentry`.
   - Before choosing defaults, read a `## Sentry` section from the project's CLAUDE.md or AGENTS.md. It covers signals, scrubbing, breadcrumbs, sample rates per environment, and where DSNs live.
   - When the section is missing, use generic defaults from a new `references/profile.md` and offer to write the section.
   - Add an eval case in which a profile in a fixture CLAUDE.md changes the output.
3. Bump both plugins and update their docs pages and README rows.

### Lane F: M1 `agent-status` mod

1. Spike first. Check whether mod `tool.call` events show TaskCreate and TaskUpdate inputs, including deletes, well enough to count tasks.
2. Scaffold `plugins/agent-status` from `plugins/example` and the `git-line` layout. The engine minimum is the same as the other mods.
3. Render an `AbovePrompt` line only while any agents are live. The line shows each agent's name or description, its status, and its idle time, plus done/total tasks when the spike allows it.
4. Get idle time from status changes, timestamped by the mod and refreshed with `$.clock.every`.
5. Keep parsing and formatting pure in `line.tsx`, and test them with `claude plugin test`.
6. Add the docs page, the README row, and the marketplace entry.

### Lane H: K4 `/ship-plugin` (repo-local)

1. Add `.claude/skills/ship-plugin/SKILL.md` with argument `<name>`. The model may invoke it, so the orchestrator can run it at close-out. It never pushes without the user's say-so, because `github:ship` already asks. It runs these steps in order:
   - `claude plugin validate --strict`.
   - Check that the versions match in `plugin.json` and `marketplace.json`, and that the docs page and README row exist and mention any new skills.
   - Run the plugin's own tests, whichever exist: `check.sh`, `pytest`, or `claude plugin test`.
   - Commit to local `main`.
   - Run `claude plugin marketplace update adminhead` and `claude plugin update <name>@adminhead`. The `adminhead` marketplace is a directory source pointing at this repo, so the update works before any push.
   - Remind the user to run `/reload-plugins`.
   - Push through `github:ship` at push level, only when the user asks.

### Lane I: global instructions (C1, C2, C5, S10)

1. C1: add one bullet to "Asking Questions". Open decisions go through AskUserQuestion, batched up to 4 related questions, and never as a numbered prose list.
2. C2: add one bullet to "Scope". Under an approved multi-slice plan that includes per-slice commits, commit each slice that passes its checks and continue without asking, unless blocked.
3. C5: add one bullet to "Design". For JS/TS linting and formatting, use Biome or oxlint/oxfmt unless the repo already chose a tool.
4. S10: add one bullet under "Scope". Record manual steps the user must take in the claude-mem `work_state` list `operator`, mark them done when the user confirms, and answer "what's waiting on me" from that list. The SessionStart work-state digest already brings open lists to the surface.

### Close-out

1. Merge the lanes in order, then run `claude plugin validate --strict .`, every new check, and the new evals with ablation.
2. Mark each item's status in `session-patterns.md`, and update memory.
3. Ship with K4 for each touched plugin, as its first real use. Pushing happens only once the user says so.

## Verification

| Condition or risk | Hypothesis | Cheapest reliable evidence | Why sufficient | Rerun when | If it fails |
| --- | --- | --- | --- | --- | --- |
| H2 blocks unsafe ops and passes safe ones | The parser classifies the fixtures correctly | `plugins/infra/scripts/tests/check.sh` (about 25 fixtures) | Covers every rule, plus compound, quoted, and wrapper forms | The guard script changes | Diagnose the parser before adding fixtures. |
| H2 is wired | The plugin hook fires on Bash | One `claude -p --plugin-dir plugins/infra` run against a stub `tofu` on PATH, expecting a deny | Fixtures can't prove wiring. Precedence over allow rules is documented | `hooks.json` or the CLI version changes | Diagnose the wiring before rerunning. |
| H6 never traps a session | `stop_hook_active` and the per-hash state stop repeats | Fixture tests in lane B | The loop guard is pure logic | The hook script changes | Fail open, then fix. |
| H6 is wired | Its Stop and SessionStart hooks fire | One `claude -p --plugin-dir plugins/authoring` run that edits a referenced file and checks for the nudge | Fixtures can't prove wiring | `hooks.json` changes | Diagnose the wiring before rerunning. |
| `github:ship` hands failed checks to `github:actions` | Step 6 names the handoff | Read the diff, plus the `actions-run-url-routing` eval for the receiving side | It is a one-line prose handoff | ship SKILL.md changes | Reword. |
| `dependabot-prs` merges only green PRs, never `--admin` | The skill's rules hold | An eval with a transcript grader asserting no `--admin` and no merge of a red PR, on a fixture `gh` stub | The merge rules are the risky part | The skill changes | Fix the skill, not the grader. |
| K4 runs end to end | Its steps match the repo | Its first real run at close-out, on each touched plugin | It is the real use, and every step prints a result | K4 changes | Fix the step that failed. |
| New skills route correctly | The descriptions trigger on the target prompts | Routing evals with ablation: actions-run-url, dependabot-prs, review-loop, implement-plan, hook-repair | Same method that passed for K1, I2, and S3 | A description changes | Fix the description, not the grader. |
| The I5 profile changes Sentry output | The skill reads the section | One eval with a fixture CLAUDE.md | Shows the profile is read | sentry SKILL.md changes | Diagnose before rerunning. |
| The I4 land script serializes landings | `flock` and fast-forward-only make landing safe | `check.sh` with two temp-repo branches, including one conflicting rebase | Exercises the lock and the refusal path | The script changes | Diagnose before rerunning. |
| M1 renders and updates | Pure formatting plus status tracking | `claude plugin test` in `plugins/agent-status` | The house method for mods | The mod changes | Diagnose before rerunning. |
| The marketplace is consistent | Versions and docs match | `claude plugin validate --strict .`, plus K4's own checks | K4 makes the check repeatable | Any manifest changes | Fix the drift. |
| CLAUDE.md lines are present and don't conflict | They sit in the matching sections | Read the diff by eye, and check against "Commit or push only when the user asks" | Prose with no runtime | Never | Reword. |

## Baseline, limits, and record

- Baseline: `validate --strict` passes on `main` at `0c50452`. The earlier routing evals pass.
- Retain the eval JSON (gitignored `evals/results`), the spike notes in lane reports, and any failed fixture that caught a real parser gap, kept as a fixture.
- Limits on claims:
  - H2 is a guardrail, not a sandbox. A determined bypass, such as an encoded payload or a script file, can evade it. A mod's `tool.check` can also override a hook block.
  - I4's land script is designed from the session-patterns description, because the original scratchpads are gone.
- Stop when every row above has passing evidence, or an item is marked dropped with a reason.

## Decisions

| Question | Decision | Reason |
| --- | --- | --- |
| 1. H5: build now? | Deferred. Ship C2 first, and build H5 only if "continue" prompts persist | Its task count drifts on deletes, and its benefit is UNCONFIRMED |
| 2. H6: what does the nudge do? | Block the stop once per change set, listing the docs. Claude checks them or offers `authoring:docs-audit` | Claude does the work, at one turn per change set |
| 3. M2: MCP status mod? | Dropped | The mod API exposes no MCP server state, and polling `claude mcp list` health-checks every server |
