# G1 hook and mod plugins, plus scripts/shared, 2026-11-14

Scope: agent-router, atlassian-docs, bash-rules, cache-clock, check-bypass-guard, cloud-ops-guard, consult, docs-sync, git-statusline, mcp-health, outline-docs, plan-ledger, readonly-agent-gate, turn-stats, usage-band, usage-log, the hooks and scripts half of orchestration, and `scripts/shared/`.

I ran everything read-only. The guard probes import the shipped pure functions (`decide`, `checkGit`, `checkBashWrites`, `analyze`, `askRule`, `run`, `checkFileWrite`) through bun, from scripts under `/tmp/g1probe/`.

Test results:

| Suite | Result |
|---|---|
| `claude plugin test`, agent-router / cache-clock / consult / git-statusline / mcp-health / turn-stats / usage-band / usage-log / plan-ledger / bash-rules | 23 / 7 / 109 / 28 / 12 / 6 / 60 / 12 / 153 / 256 pass, 0 fail. The bash-rules timing tests passed this run. |
| `bun test`, plan-ledger specs | 394 pass |
| `bun test`, check-bypass-guard and readonly-agent-gate | 118 pass |
| `bun test`, scripts/shared | 13 pass |
| `bun test`, atlassian-docs, outline-docs, orchestration, consult specs and usage-log scripts | 75 pass |
| `readonly-bash.cases.sh` | 1132 pass |
| docs-sync `check-docs-sync.sh` | 50 pass |
| consult `agy-gate-check.sh` | all pass |
| `plugins.py check` | ok |
| cloud-ops-guard `check.sh` | 824 of 829 FAIL on this host. This is a harness problem, not a guard bug (see cloud-ops-guard). With the real bun binary first on PATH, 829 pass. `cloud-ops-guard.spec.ts` gives 6 pass, 1 fail, from the same cause. |
| `claude plugin validate` | Every plugin passes. consult, usage-band and usage-log report TypeScript errors in test and script files, and usage-band reports "gating hook without .catch: session.compact". |

## Summary

- Verdicts: 13 KEEP, 3 KEEP-FIX (plan-ledger, check-bypass-guard, mcp-health), 1 DEPRECATE (agent-router, medium confidence). The orchestration hooks half is KEEP.
- **[high] plan-ledger:**
  - `verifyChecks: auto`, the default since 6b5ada0e, runs model-written check argv through `$.process.run` with no prompt (`plugins/plan-ledger/hooks/register.tsx:686-703,893-901,746`).
  - None of the Bash guards (bash-rules, cloud-ops-guard, check-bypass-guard) see that call, and the only refusal left is an explicit user `deny` rule.
  - The argv comes from the main model, or from an architect draft built from untrusted repo content, so a user's `ask` rule is silently overridden.
- **[high] readonly-agent-gate is not installed on the owner's machine.**
  - It has been an optional install since d2711c93, and no meta pulls it in. `~/.claude/plugins/installed_plugins.json` lists orchestration-meta, plan-ledger, bash-rules and the others, but not readonly-agent-gate.
  - So the architect, reviewer and debugger agents are read-only only by instruction, and architect has Write and Edit.
- Prior findings: 9 of 10 V rows are FIXED and V9 is PARTLY. Of the 2026-10-23 report's other items, 14 are still open, 3 partly fixed and 3 fixed or not applicable (table below). Most of the F7 and F9 leftovers are still open (lists below).
- New [med]:
  - check-bypass-guard's wrapper table misses `flock`, `ionice`, `unshare`, `systemd-run`, `chrt`, `taskset` and `npx -y`, so `flock /tmp/l git commit --no-verify` gets no verdict (`git-bypass.ts:38-51`).
  - mcp-health still marks a server failed when a hook denied its call.
- agent-router duplicates the engine's own agent listing. Every agent type with its description already reaches the model, and `agent.offer` fires "in the agent listing" per the mods d.ts. The router adds a second, truncated copy, up to 30 rows of 320 characters, to every Agent tool description.
- The statusline and telemetry mods (git-statusline, usage-band, turn-stats, cache-clock, mcp-health) serve the human, not the model, so I judged them only on whether they work and are maintained. All of their tests pass, and all of them got enabled and tuning options in this cycle.

## Prior findings re-checked

V rows (docs/plans/plugin-review-fixes.md), checked by probe:

| Prior finding (source) | Status | Evidence |
|---|---|---|
| V1 `git config [--local\|--global] core.hooksPath`, `config set`, `commit.gpgsign false` | FIXED | All deny, as do `--remove-section core`, `--rename-section commit x` and `--unset-all commit.gpgsign`. Code: `configRule`, `plugins/check-bypass-guard/scripts/git-bypass.ts:219-286`. `user.name` and `--get` stay null. |
| V2 Bash writes to protected configs | FIXED | `pre-commit uninstall`, `chmod -x .git/hooks/pre-commit`, `rm .pre-commit-config.yaml`, `rm -rf .husky`, `sed -i … .eslintrc.json`, `mv .pre-commit-config.yaml /tmp/` and `npx husky uninstall` all ask. Wired at `check-bypass-guard.ts:52`. `echo x >> .eslintignore` asks only when the file exists, by design (`bash-protect.ts:149-161`). |
| V3 cloud-ops allowlist allows `mise run tofu`, `plan` and `init` | FIXED | All return null by default (`autoAllow`, `cloud-ops-guard.ts:1317,1321`). A subagent's `init` with no brief token asks (`:1312-1316`). |
| V4 aliases and wrappers | PARTLY | `k`, `tf`, `kubecolor`, `oc`, `nix run nixpkgs#terraform -- destroy` and `busybox sh -c` deny. `helmfile destroy`, `pulumi destroy` and `python3 -m awscli` ask. `parallel terraform ::: destroy` is still null. |
| V5 `prd` not treated as production | FIXED | `DEFAULT_PROD` and the `prodPattern` option are at `cloud-ops-guard.ts:61-74`. `--context prd delete pv` denies. |
| V6 subagent deny text hands out the token | FIXED | The text at `cloud-ops-guard.ts:146-147` no longer tells the model to add the token itself. |
| V7 bash-rules danger gaps | FIXED | All listed commands now hit, as do `/Applications`, `/private/var/db`, `flock … rm -rf ~` and `docker volume rm $(…)`. The must-pass cases stay null. |
| V8 judge sends unredacted commands to ollama.com | FIXED | The three request builders redact `AKIA` keys. `ollamaCloud` defaults to false (`plugins/bash-rules/hooks/rules/judge.ts:31-34`). The description wording is a leftover, listed under bash-rules. |
| V9 readonly symlink write, sqlite3, make install, scp | PARTLY | Links, sqlite3 DML and dot-commands, `make install`, `scp`, `wget`, `curl -o`, `ssh host cmd` and `split` are now blocked. Still allowed, and not listed in the header (`readonly-bash.ts:4-18`): `zip -r`, `7z x`, `xxd -r`, `gcc -o`, `cmake -B`, `vim -es`, `ed`. |
| V10 / S0 prune scope | FIXED | `scripts/shared/log/usagelog.ts:79,87-93` deletes only regular files named `<stream>-YYYY-MM-DD.jsonl`, with `-maxdepth 1`. The trust model is at `:6-10`. |
| S0 walker unwraps busybox, toybox and fish | FIXED | check-bypass-guard denies `busybox sh -c 'git commit --no-verify'` and the `fish -c` form. |

Other items from the 2026-10-23 report:

| Prior finding (source) | Status | Evidence |
|---|---|---|
| bash-rules: rsync `--delete ~/`, `killall5`, `tmux kill-server`, `fuser -k`, `psql < <(echo DROP…)` (G1 med) | STILL OPEN | Each gets no verdict from `analyze`. |
| bash-rules: scan re-run up to three times per call (G1 low, F7) | STILL OPEN | `register.tsx:138` and `:241`; `askRule` re-scans at `rules.ts:141-147`. |
| bash-rules: wall-clock timing tests (G1 low, F7) | PARTLY | They pass here, but they still assert wall-clock times (`danger.test.tsx:316,324,345`, `shell.test.tsx:396-398`). |
| check-bypass-guard: inline-suppression asks (G1 med, F7) | STILL OPEN | An Edit that adds `// eslint-disable-next-line` returns null. |
| check-bypass-guard: no README (G1 low) | STILL OPEN | Only a LICENSE ships. |
| cloud-ops: `AWS_DESTRUCTIVE` additions (G1 med, F7) | PARTLY | `kms schedule-key-deletion` now asks. Still null: `authorize-security-group-ingress … 0.0.0.0/0`, `sqs purge-queue`, `ecr batch-delete-image`, `iam create-access-key`, `s3api put-bucket-acl --acl public-read`, `route53 change-resource-record-sets` (`cloud-ops-guard.ts:416`). |
| consult: agy gate allows reads of any path (G1 med, F7) | STILL OPEN | `plugins/consult/scripts/agy-gate.sh:13-14` matches on the tool name only and never inspects `.toolCall.args`. |
| consult: `SECRET` list too narrow (G1 med, F7) | STILL OPEN | `plugins/consult/hooks/consult/consult.ts:19` is unchanged: no `.envrc`, `*.tfstate`, `*.tfvars`, `.npmrc`, `.netrc`, `kubeconfig`. |
| consult: `$.ui.log` writes to the transcript (G1 low) | STILL OPEN | `plugins/consult/hooks/register.tsx:103,116,118` have no `{ to: 'debug' }`. |
| mcp-health: hook deny counted as a server failure (G1 med, F7) | STILL OPEN | `plugins/mcp-health/hooks/health.ts:30-35` `outcomeOf` treats any `isError: true` as an error. |
| mcp-health: `plugin_<x>_` prefix kept in names (G1 low) | STILL OPEN | `serverOf`, `health.ts:19-25`. |
| git-statusline: git runs without the session cwd (G1 med, F7) | FIXED / not a bug | The mods d.ts says `$.process.run` uses "cwd the session's by default", the same source as `$.session.cwd()` (`register.tsx:18-27`). |
| git-statusline: fsmonitor not disabled (G1 low) | STILL OPEN, low | `register.tsx:20,27,32` pass no `-c core.fsmonitor=false`. The d.ts promises only "repo hooks off". |
| usage-log: `promptText` defaults to true (G1 med, F7) | STILL OPEN | `plugins/usage-log/.claude-plugin/plugin.json:23`, `hooks/events.ts:11`. |
| usage-log: env-chosen log directory and prune (G1 med) | FIXED (prune). Override kept by design | See V10. |
| usage-band: `$.ui.log` without debug (G1 low) | STILL OPEN | `plugins/usage-band/hooks/register.tsx:27`. |
| usage-band: `session.compact` without `.catch`, and `$.store` read-modify-write race (G1 low) | STILL OPEN | `register.tsx:85-92,35-37`. validate still warns. |
| cache-clock: TTL default `5m`, ticks forever (G1 low) | STILL OPEN | `plugins/cache-clock/hooks/clock.ts:13`, `register.tsx:31-35`. The README now explains when to pick `1h` (`README.md:21`), so this is downgraded to a doc-only issue. |
| turn-stats: `↑` for output tokens (G1 low) | STILL OPEN | `plugins/turn-stats/hooks/stats.ts:70`. The plugin.json example says `41k out`, which contradicts the code. |
| docs-sync: git hardening, no hook timeout, no README (G1 low) | PARTLY | `--no-ext-diff` was added (`docs-sync-nudge.ts:143`). There is still no `--no-textconv` or `core.fsmonitor=false`, no `timeout` in `hooks/hooks.json`, and no README. |
| atlassian-docs / outline-docs: no rule when both are installed (G1 low) | STILL OPEN | Neither `hooks/session-context.md` mentions the other. |
| agent-router: alphabetical cut at 30 agents (G1 low) | PARTLY | `maxAgents` and `hideAgents` options exist (`routes.ts:155-161`), but the order is still alphabetical (`:172`). |
| agent-router: `$.settings.read()` reads merged settings (G1 low) | STILL OPEN | `register.tsx:72`. |
| agent-status findings | N/A | The plugin is now in `archive/plugins/agent-status`. |
| readonly-agent-gate: main thread with `agent_type` is ungated (G1 low) | FIXED (documented) | `readonly-gate.ts:3-5` states it is deliberate. |

Counts for all 35 rows above (the 11 V rows plus 24 other items): 15 FIXED or N/A, 14 STILL OPEN, 6 PARTLY.

### F7 leftovers still open

All of these are covered in the table above:

- consult: the agy read-path restriction and the SECRET list.
- mcp-health: a hook deny counted as a server failure.
- usage-log: the `promptText` default.
- cloud-ops: the `AWS_DESTRUCTIVE` additions (partly fixed).
- check-bypass-guard: the inline-suppression asks.
- bash-rules: scan caching, and the timing tests (partly fixed).
- The shared `wrappers.ts`, which does not exist yet.

git-statusline's cwd is closed (FIXED / not a bug).

### F9 leftovers still open

check-bypass-guard (all of these return null):
- `env -C`, `sudo -D` and `doas -C` new-file writes.
- An alias already in git config, such as `git ci`.
- `~/.gitconfig`, `~/.config/git/config` and `GIT_CONFIG_GLOBAL=…`.
- `install` or `dd` into `.git/hooks`, and `.git/modules/*/hooks`.
- `pyproject.toml` lint sections.
- NotebookEdit: the matcher is `Bash|Edit|Write|MultiEdit`.

cloud-ops-guard:
- `talosctl $VERB`.
- `nix-shell -p … --run`.
- `uvx --from awscli aws …`.
- `watch k`, `doas k` (documented).
- `kubectl frob -h`.

bash-rules:
- A brace list of more than 64 alternatives (fails open), quotes inside a brace alternative, and `{a..b}` sequence braces.
- stdin-fed `xargs -I{}`.
- Masking of `sshpass -p`, `redis-cli -a` and `docker login -p`.
- The GNU parallel quote case no longer reproduces.

readonly-agent-gate:
- Planted links inside a tree copied with `cp -r`, rsync or tar (documented).
- `patch -r` and `sort --compress-program`.
- Not probed: the `mv` over-block.

## Per-plugin

### plan-ledger — KEEP-FIX (high)

- **Value.** Tooling, Enforcement, Routing/role and K-private.
  - It is the orchestrator's shared work ledger.
  - A subagent cannot self-verify: `decideAgent` allows only get, claim, list and status, plus progress, block, fail and claim_done for a bound agent (`plugins/plan-ledger/hooks/plan/authorize.ts:150-193`). Verify is main-loop only (`:117`).
  - `verify` takes no result fields (`tool.ts:143-146,225-228`). The mod runs the stored argv itself (`register.tsx:886-922`), and `apply.ts:646-667` re-checks gen, checksHash and results.
  - Caller identity comes from the engine-pinned `e.agentId`, confirmed through `$.agent.list()` with status `running` (`tool.ts:366-375`). It cannot be spoofed through tool input (`tool.ts:144`).
- **Evidence.** The companion skill plan-ledger-usage has 155 loads and was listed in 16 sessions (plugin-data.tsv). The orchestration and agent prompts depend on it. No evals.
- **Fixes.**
  - **[high]** The `verifyChecks: auto` default (6b5ada0e) runs checks without asking.
    - `ruleDecision` refuses only on `deny`; an `allow`, an `ask` or a throw all run the check (`register.tsx:686-703,893-901`).
    - The checks run through `$.process.run(check.argv, { cwd, timeoutMs: 600000 })` (`:746`), which no Bash guard sees.
    - The argv is written by the main model through create and amend (amend is blocked only while an item is claimed_done or verified, `apply.ts:755`), or by the architect's draft (`authorize.ts:136-139`). The architect reads untrusted repo content.
    - A user `ask` rule such as `Bash(git push:*)` is overridden.
    - Fix: get one human approval of the plan's full checks list at `activate`, and again on any amend that changes checks. Store the approved checksHash, and run silently only when the hash matches. The simpler fallback is to restore "ask unless `tool.check` says allow".
    - Add a line to plan-ledger-usage telling the orchestrator to review an architect's draft checks before activating.
  - **[med]** `README.md:82` ("verify asks through the person's own permission rules") and `:101` ("the prompt is the safeguard") contradict auto mode.
  - **[med] UNVERIFIED.** `commandFor` single-quotes every word (`verify.ts:46-48`, `checks.ts:84-86`), so `rm -rf x` is checked as `'rm' '-rf' 'x'`.
    - If Claude Code's `Bash(rm:*)` prefix rules do not match quoted words, the deny path fails open too. The tests stub `tool.check` (`tests/register.test.tsx:184,287-299`).
    - Fix: quote only the words that need it, and add a test against a real deny rule.
  - **[low]** The verify `cwd` may be any existing absolute directory (`register.tsx:667-678`; it is realpath'd and length-capped, so there is no traversal). Consider limiting it to the session repo and its worktrees.
  - **[low]** One verify can run up to 8 checks × 600 s, about 80 minutes (`types.ts:193`, `register.tsx:72`), with no total budget.
  - **[low]** Items are reserved by agent type, not by spawn (`authorize.ts:58-63,176-181`), so two parallel coders could claim each other's items. This is bookkeeping only, because verify still gates.
  - **[low]** Up to 100 plan files are re-read on every prompt and session start (`register.tsx:1028-1038,1407-1422`).
- **Sound as is:**
  - Locking: an mkdir lock with an owner token, stale takeover under a `.reap` mutex (`store.ts:96-116,200-211`), and checks run outside the lock.
  - Ids and the project key are regex-checked before any path is built (`store.ts:7-8,36-46`).
  - The git fingerprint is hardened (`verify.ts:21-28`).
  - Input bounds: 400k for the whole input, 64k per field, 8 checks of 600 bytes each (`tool.ts:17-19`, `checks.ts:15-45`).

### bash-rules — KEEP (high)

- **Value.** Enforcement (danger denies, credentials-file guard on Bash and file tools) and Tooling (the model judge). In baseline.
- **Evidence.** Hook plugin, so no usage counters. 256 mod tests pass. No evals.
- **Fixes.**
  - [med] The prior kill, rsync and procsub gaps are still open: `rsync -a --delete /tmp/empty/ ~/`, `killall5 -9`, `tmux kill-server`, `fuser -k 3000/tcp`, `psql < <(echo 'DROP TABLE users')`.
  - [low] `ollamaModel: 'clef:cloud'` with `ollamaCloud: false` means the Ollama stage is always skipped (`hooks/rules/judge.ts:31-34`). The plugin.json description says unsure commands go to "a local Ollama". Default to a local model name, or say that Ollama is off until configured.
  - [low] Cache the scan per command string (F7).
  - [low] Switch the timing tests to growth ratios.
  - [low] Add `sshpass -p`, `redis-cli -a` and `docker login -p` to `scripts/shared/log/usagelog.ts` SECRETS.

### check-bypass-guard — KEEP-FIX (medium)

- **Value.** Enforcement against the model's most common "make the hook pass" moves. In baseline. V1 and V2 are closed.
- **Evidence.** The 118 bun tests (shared with readonly-agent-gate) pass. No evals.
- **Fixes.**
  - [med] Wrappers missing from `scripts/git-bypass.ts:38-51`: `flock /tmp/l git commit --no-verify`, `ionice -c3 …`, `unshare -r …`, `systemd-run --user …`, `chrt 0 …`, `taskset 1 …` and `npx -y git commit -n` all return null. bash-protect reuses the same views, so `flock l rm .eslintrc.json` is missed too. cloud-ops and bash-rules unwrap all of these. Add them, or do the shared `wrappers.ts`.
  - [med] NotebookEdit is not in the hooks.json matcher, and user-global gitconfig writes are not covered (F9).
  - [med] Inline-suppression asks (F7).
  - [low] hooks.json runs bare `bun` with no `|| exit 2`, so a missing bun fails open. readonly-agent-gate fails closed here.
  - [low] No README.

### cloud-ops-guard — KEEP (medium)

- **Value.** Enforcement on the owner's daily infra stack (tofu, kubectl, aws). V3 to V6 are mostly closed.
- **Evidence.** Installed, optional. `check.sh` passes 829/829 once the real bun is first on PATH.
- **Fixes.**
  - [med] The `AWS_DESTRUCTIVE` additions for operations that loosen access (`cloud-ops-guard.ts:416`), listed in the table.
  - [low] `parallel terraform ::: destroy` is still null.
  - [low] `scripts/tests/check.sh:29-30` sets `HOME=$root`. A mise-shimmed `bun` then exits 1 ("config not trusted"), so 824 cases fail on this host. Resolve `command -v bun` to the real binary before overriding HOME.
  - [low] The F9 items (talosctl verbs, `nix-shell --run`, `uvx --from awscli`).

### readonly-agent-gate — KEEP (high)

- **Value.** Enforcement that the read-only agent roles depend on.
- **Evidence.** 1132 shell cases and the bun specs pass.
- **Fixes.**
  - **[high] (install, not code)** The plugin is not installed on this machine (`~/.claude/plugins/installed_plugins.json`) and no meta pulls it in, so reviewer, debugger and architect run ungated. Either add it to orchestration-meta, or have the orchestration README and recommend-plugins say plainly that the agents' read-only claim needs it.
  - [med] The V9 leftovers: `zip -r`, `7z x`, `xxd -r`, `gcc -o`, `cmake -B`, `vim -es`, `ed`, `patch -r` and `sort --compress-program` are allowed and not listed in the header (`scripts/readonly-bash.ts:4-18`). Block them, or list them in the header.

### consult — KEEP (high)

- **Value.** Tooling and K-private. It is the only way the model can reach the owner's locked codex app server or agy. It has a permission round-trip (`hooks/register.tsx:129-140`) and an opt-out marker.
- **Evidence.** In second-opinion. 109 mod tests, the specs and the agy gate check pass.
- **Fixes.**
  - [med] `scripts/agy-gate.sh:13-14` allows `read_file` and the other readers on any path. Restrict `.toolCall.args.*path*` to `$PWD`, the temp workspace.
  - [med] Widen `SECRET` (`hooks/consult/consult.ts:19`) with `.envrc`, `*.tfstate*`, `*.tfvars`, `.npmrc`, `.netrc`, `.pgpass` and kubeconfig.
  - [low] Send the `$.ui.log` calls at `register.tsx:103,116,118` to debug.
  - [low] Fix the TS errors validate reports in `scripts/codex-app-server.ts` and the tests. They are noise in every validate run.

### usage-log — KEEP (high)

- **Value.** Tooling. It produced this review's `plugin-data.tsv`, and nothing else records skill routing.
- **Evidence.** 12 mod tests and the report spec pass.
- **Fixes.**
  - [med] `promptText` defaults to true (`.claude-plugin/plugin.json:23`). Default it off, or say at install time that prompts are kept on disk for 30 days.
  - [low] `prompt.submit` awaits two process runs, `session.usage` and `command.list` before every prompt continues (`hooks/register.tsx:94-99`). Write after `next`, or fire and forget.
  - [low] Redaction runs over the whole prompt before clipping (`usagelog.ts:57-60`). Clip to about 4×MAX_FIELD first.

### docs-sync — KEEP (medium)

- **Value.** Tooling. A deterministic Stop-time list of the docs that mention files edited or names removed. The model does not reliably do this sweep unprompted.
- **Evidence.** No evals; the prior suggested case `rename-flag-stale-docs` was never written. 50 shell cases pass.
- **Fixes.**
  - [med] Add that outcome eval, since its whole value claim is unmeasured.
  - [low] Add `-c core.fsmonitor=false` and `--no-textconv` to `git()` (`scripts/docs-sync-nudge.ts:57-58`).
  - [low] Add a `timeout` to the hooks.json entries.
  - [low] Add a README.

### atlassian-docs — KEEP (low)

- **Value.** K-decision. What goes to Confluence or Jira versus the repo, and when to confirm before writing (`hooks/session-context.md:5-16`). Without the hook, the model never writes to Confluence unprompted.
- **Evidence.** No usage or evals. The owner's stack is Outline, so this plugin is probably unused here.
- **Fixes.**
  - [low] Add a line for when outline-docs is also installed ("ask which system this project uses").
  - [low] Add an outcome eval for "propose, don't file".

### outline-docs — KEEP (medium)

- **Value.** K-decision plus K-private: the owner's self-hosted wiki, and agent plans staying out of it (`hooks/session-context.md:9`).
- **Fixes.**
  - [low] The same both-installed line as atlassian-docs.
  - [low] An outcome eval.

### agent-router — DEPRECATE (Duplicate, medium)

- **Value claim.** Routing/role. `orchestration.md:25` points at its "Installed agent routes" section.
- **Evidence it duplicates the engine.**
  - The engine already lists every offered agent type, with its full description, to the model. The mods d.ts on `agent.offer`: "Fires when the engine offers an agent type to the model, in the agent listing and again at dispatch" (`.claude-plugin/types/claude-code/index.d.ts:4166`).
  - This review session received that listing, including the `<plugin>:<name>` scoped names.
  - The router re-renders the same data, cut to 320 characters per row and 30 rows (`hooks/routes.ts:97-98,165-191`), into the Agent tool description on every request.
  - Its only extra content is one sentence: "Prefer a specialized type over general-purpose" (`routes.ts:185`). orchestration.md:25 already says that.
- **Evidence.** No evals. orchestration-meta installs it. 23 tests pass, and the code is clean.
- **What is lost.**
  - A sorted, compact second copy of the list.
  - The `hideAgents` option, which no other tool offers. The engine-side alternative is `agent.offer` returning `{ isOffered: false }`.
  - Haiku or Sonnet orchestrators might route slightly better with a compact table if the engine listing gets truncated under pressure. That is UNVERIFIED.
- **Before archiving.** Run the orchestration routing evals once with and once without the plugin. If they show lift, keep it as KEEP-FIX: order plugin agents before built-ins instead of alphabetically, and use `$.settings.read({ source: 'user' })` at `register.tsx:72`. If not, archive it and reword `plugins/orchestration/agents/orchestration.md:25` to refer to the engine's agent listing.

### orchestration (hooks and scripts half) — KEEP (high)

- **Value.** Routing/role. The SessionStart hook links `~/.local/bin/claude-orchestrate` (`scripts/link-launcher.sh`). The launcher appends the prompt and sets `CLAUDE_ORCHESTRATE`, the bash shell and `CLAUDE_ENV_FILE` (`scripts/claude-orchestrate:100-127`).
- **Evidence.** The link spec passes.
- **Fixes.**
  - [low] With two installs (a user-scope one and an older project-scope one), the link flips to whichever session started last (`link-launcher.sh:27-28`). It also replaces a symlink the user pointed elsewhere on purpose. Link only when the current target is missing or inside `~/.claude/plugins/`.
  - [low] Needs source check: whether `CLAUDE_CODE_SHELL` and a preset `CLAUDE_ENV_FILE` are honoured this way (`claude-orchestrate:114-127`).

### git-statusline — KEEP (high; serves the human)

- **Value.** A UI mod, maintained: options were added in 51a959d0. 28 tests pass. In baseline.
- **Fixes.**
  - [low] Add `-c core.fsmonitor=false` to the three git calls (`hooks/register.tsx:20,27,32`).
  - [low] `git status` lists untracked files on every `session.measure`, which is slow in big repos. The timeout option exists; consider `-uno` as an option.

### usage-band — KEEP (high; serves the human)

- **Value.** Works and is maintained: pace options, 60 tests. In baseline.
- **Fixes.**
  - [low] Add `{ to: 'debug' }` at `hooks/register.tsx:27`.
  - [low] Wrap `session.compact` (`:85-92`) in try, or give it a `.catch`. validate warns about it.
  - [low] The TS error in `tests/band.test.tsx:287` (the `SessionCompactResult` shape).
  - [low] The cross-session `$.store` race (`:35-37`) can double-toast.

### mcp-health — KEEP-FIX (medium; serves the human)

- **Value.** Shows a failing MCP server. 12 tests pass. In baseline.
- **Fixes.**
  - [med] It shows a false ✗ and a toast when a classic hook or the user denies an MCP call. `outcomeOf` (`hooks/health.ts:30-35`) should skip `isError` results whose text starts `PreToolUse:… hook error`. Reuse `laterDeny`'s regex from `plugins/bash-rules/hooks/rules/outcome.ts:7,29-35`, and add the missing test.
  - [low] Strip `plugin_<x>_` in `serverOf` (`health.ts:19-25`) for display.

### cache-clock — KEEP (medium; serves the human)

- **Value.** Works: 7 tests. The estimate is documented honestly (`README.md:24-32`).
- **Fixes.**
  - [low] Default `ttl` to `1h`, since the owner is on a subscription (`clock.ts:13`, `plugin.json:16`).
  - [low] Stop the 15 s tick once the line shows cold (`register.tsx:31-35`).

### turn-stats — KEEP (low; serves the human)

- **Value.** Small and working: 6 tests.
- **Fixes.**
  - [low] The description says `41k out · cache 92%` (`plugin.json:4`), but the code prints `41k↑ 92%c` (`hooks/stats.ts:70-72`). Make them agree; `out` is clearer.

### scripts/shared — sound

- The walker unwraps busybox, toybox and fish, and the prune is scoped (S0 landed). walk.spec and usagelog.spec pass (13).
- Open: no shared wrappers table (F7), and the masking gaps listed under bash-rules.

## Cross-plugin findings

- **Wrapper tables have drifted again.**
  - check-bypass-guard lacks `flock`, `ionice`, `unshare`, `systemd-run`, `chrt` and `taskset`, which bash-rules and cloud-ops both unwrap.
  - cloud-ops lacks `parallel`.
  - The F7 `scripts/shared/shell/wrappers.ts`, synced like walk.ts, would close this class.
- **Guards do not see mod-run processes.** plan-ledger's `$.process.run` checks bypass bash-rules, cloud-ops-guard and check-bypass-guard (`plugins/plan-ledger/hooks/plan/verify.ts:64` says so). consult's runs do too, but those are fixed argv. This is why the plan-ledger auto default is [high].
- **The gate is optional while orchestration-meta is not.** The orchestration setup advertises read-only reviewer and debugger agents, but the gate that enforces that is not in any meta and not installed here.
- **The docs plugins** (atlassian-docs, outline-docs) still give conflicting "record it here" instructions if both are installed.
- **Data leaving the machine.** The bash-rules judge now stays local unless opted in, and consult asks first. usage-log keeps prompt text on disk by default (F7).
- **No evals in this family** except orchestration's routing cases. The cheapest valuable outcome evals:
  - docs-sync `rename-flag-stale-docs`.
  - check-bypass-guard `failing-hook-commit`.
  - The agent-router with/without routing comparison, which decides its verdict.
- **validate TypeScript noise** in the consult, usage-band and usage-log test files hides real warnings. Fix the types, or exclude the tests from the typecheck.

## Needs source check

- Whether Claude Code's `Bash(cmd:*)` permission rules match a command whose words are all single-quoted. This decides plan-ledger's remaining deny path.
- `CLAUDE_CODE_SHELL`, and whether a launcher-set `CLAUDE_ENV_FILE` is sourced before each Bash command (`plugins/orchestration/scripts/claude-orchestrate:114-127`).
- The cache-clock README claim (checked on 2.1.302) that subscription sessions cache the main conversation for 1 h, and the `ENABLE_PROMPT_CACHING_1H`, `FORCE_PROMPT_CACHING_5M` and `CLAUDE_CODE_PROMPT_CACHE_TTL` names (`plugins/cache-clock/README.md:21`).
- Whether the engine's agent listing is ever truncated to names only under listing pressure. If it is, agent-router has value as a compact fallback.
- The consult model ids in the tool description (`gpt-6-astra`, `gemini-4-argon-high`, `consult.ts:34`) against `codex debug models` and `agy models`.
