# Leaner orchestration: fewer handoffs, cost-tiered workers

Status: ready to implement, 2026-10-25. The routing prompt fix and the A/B harness are committed (`0173e84`, `be15911`); everything below is open.

Source: Anthropic's "When to fold subagents into your main agent loop" (claude.com, Oct 2026) and its kit `anthropics/single-agent-loop-kit`.

## Decisions

- The main session stays an orchestrator: it plans, routes, integrates and verifies.
- Workers keep explicit cheaper models. The article weighs quality, cost and latency per API token; this setup runs on a subscription allowance per model, so routing work away from Opus is the main reason to keep subagents.
- One `coder` agent; the orchestrator picks `model` (and `effort`, if slice 1 shows it reaches the agent) on each call. A per-call `model` overrides the agent file's.
- `coder-max` merges too: fable is reachable from any repo, used only on an explicit escalation or when the user asks. The retired tier plugins move to `archive/plugins/`.
- Routing guidance lives in the orchestration prompt with contrasting examples, not in an on-demand skill (measured: a routing skill loaded 0/24 times).
- A small design choice in a small codebase may be settled by the orchestrator, but a feature spanning several modules goes to a sonnet coder, not haiku.
- dba and devops may run on sonnet for design and read-only work if their outcome evals hold; work that applies changes to shared state (migrations, infra applies) stays on opus.
- From the article: cut handoffs between authors (the coder writes its own tests and the docs its change makes stale), keep verification independent but proportionate, and migrate with evals.

## Evidence

**Usage baseline** (`~/.local/state/claude-usage`, 2026-10-18 to the morning of 10-25, about 50 sessions and 787 Agent calls, all from the main loop; a cut at 10-24 gives 773): reviewer 267 (about one per coder call), coder-high 187 (picked directly; no prompt cites an earlier attempt), coder 74, scribe 65, architect 42, coder-critical 38, security-auditor 31, general-purpose 30 (inherits Opus), devops 24, debugger 8, Explore 7, dba 6, coder-max 3. Median about 6 calls per session.

**System prompt size** (Claude Code 2.1.310, Opus 5.5, one `-p` turn in this repo): default prompt alone 29,569 input tokens; default plus the orchestration body 33,203; `--agent` plus `system_override.md` 36,407, of which the agent-router table is 1,441. Like for like, appending to the default prompt is about 1,760 tokens smaller per request.

**A/B, replacement vs default prompt** (`evals/orchestration-ab/`, 10 cases × 3 runs, subagent calls denied so only the first routing decision counts): same routing on 8 of 10 cases; the default-prompt arm delegated plugin vetting 3/3 where the replacement arm did it inline 0/3. Equal cost per run ($0.331 vs $0.330); the default arm used 12% fewer input tokens and 1.1 fewer turns.

**Routing fix** (B old prompt, C fixed prompt, D old prompt plus the same text as a skill; cases race-fix, failing-test, multi-slice, vet-plugin, mechanical-rename, inline-typo, known-cause-test-fix, small-safe-change; 3 runs each): B 18/24, C 23/24, D 19/24 with the skill never loaded. C moved race-fix and failing-test from inline Opus work to `coder-critical` and `debugger` (0/3 → 3/3) without over-delegating the two known-cause inline cases, and was the cheapest arm ($0.268 vs $0.279 per run, 5.0 vs 6.3 turns). After the planning-rule follow-up, multi-slice went to `coder-high` 3/3. Results live in the session scratchpad, not the repo.

"The retest set" below means those eight cases plus api-redesign.

## Slices

Run in order on local `main`, one commit set per slice. Bump `version` in `plugin.json` and its `marketplace.json` entry for every touched plugin (`scripts/plugins.py check --since` enforces it), run `check`, regenerate the catalog when descriptions change, and ship with `ship-plugin`. No worktree isolation: agent worktrees branch from the pushed base and would miss unpushed slices.

### 1. Log resolved model and effort

- `plugins/usage-log/hooks/register.tsx`: log the mods `turn.step` event, which carries the engine-resolved `model`, `effort` and `agentId` per request (`plugins/agent-router/.claude-plugin/types/claude-code/index.d.ts:14114-14145`), so the model split is known even when a call omits `model`. Keep the `agent-call` line (`:84`) and add the call's requested `model`/`effort` to it. `turn.step` fires on every model request and `write()` spawns a process per line (`register.tsx:23`), so log only when `(agentId, model, effort)` changes. Update `tests/register.test.tsx:68,76` and add a test for the new line, `scripts/usage-report.ts:99` (agent table gains a resolved-model column) and `README.md:22`.
- Effort check: one `claude -p` session that spawns `coder` twice, once with `effort: "high"` and once with none; read the subagent's resolved effort from the new `turn.step` lines.
- Gate for slice 3: if per-call effort reaches the agent, merge into one `coder`. If not, merge into two agents: `coder` (sonnet/medium, haiku by `model`) and `coder-critical` (opus/high, fable by `model`), so risky work keeps high effort.
- Acceptance: a session's log shows resolved model and effort per subagent request; the effort result and the chosen merge shape are recorded in this plan.
- Result (2026-10-25, `e79cbe5`): usage-log writes a `model-step` line per loop when its resolved model/effort changes, and `agent-call` carries the requested `model`/`effort`; the report gains a "Models by loop" table. Effort probe (`claude -p --model sonnet`, PreToolUse hook logging `CLAUDE_EFFORT` and the payload `effort.level`): a `coder:coder` spawned with `effort: "high"` ran at `high` while the main loop was at `medium`; one spawned without effort ran at the session's `medium`. Per-call effort reaches plugin agents, so slice 3 merges into one `coder`. Not yet seen live: the installed usage-log updates on ship.

### 2. Launcher appends to the default prompt

- `plugins/orchestration/scripts/claude-orchestrate`:
  - at launch, strip the frontmatter from `agents/orchestration.md` (same `awk` as `evals/orchestration-ab/build.sh`) into `${XDG_STATE_HOME:-~/.local/state}/claude-orchestrate/orchestration.md`, a real file the herdr paths (`:117,125`) can read;
  - pass it with `--append-system-prompt-file` instead of `--agent`, and put `CLAUDE_ORCHESTRATE=1` in `launch_env` (`:82`) so the herdr `--env` path carries it;
  - `-a AGENT` / `CLAUDE_ORCHESTRATE_AGENT` keep the `--agent` route for other agents; `-p FILE` appends that file instead; `--no-prompt` appends nothing.
- `plugins/agent-router/hooks/register.tsx` and `routes.ts:22`: treat the session as orchestration when `$.env.get("CLAUDE_ORCHESTRATE")` is set, keeping the `agent_type` and `settings.agent` checks for `claude --agent`. Update its tests and README.
- Retire `prompts/system_override.md`, `scripts/prompt-drift.sh` and `prompt-drift.test.sh`. Update `plugins/orchestration/README.md`, the description in `plugins/orchestration/.claude-plugin/plugin.json:4` and its marketplace entry, and the hand-written prompt-drift rows in the root `README.md:439-440`.
- `evals/orchestration-ab/`: add an arm that loads the working-tree `agent-router` with `--plugin-dir plugins/agent-router` and `CLAUDE_ORCHESTRATE=1` (the live table, no snapshot); run every arm under `env -u CLAUDE_ORCHESTRATE` otherwise, so a harness started from a launcher session doesn't leak the table into all arms. First confirm that `--plugin-dir` wins over the installed `agent-router` of the same name; if it doesn't, disable the installed copy for that arm through `--settings` `enabledPlugins`.
- `evals/orchestration/`: add an append-route entry next to `fixtures/orchestrator-main/` (case `append_system_prompt` with the stripped body, `env: CLAUDE_ORCHESTRATE=1`; generate it with a small script if the field can't point at a file), so routing evals test the shipped route.
- Acceptance: a launcher session shows the routing table in the Agent tool description; the live-router arm scores at least the snapshot arm's 23/24 over the retest set.
- Result (2026-10-25, `1e07a62..993cfa3`): probes showed the table with `CLAUDE_ORCHESTRATE=1` and none without, and `--plugin-dir` wins over the installed agent-router. Eval cases only pass `EVAL_*` env, so `evals/orchestration/fixtures/orchestrator-append` is a test-only mod that sets `CLAUDE_ORCHESTRATE`; `gen-append.py` generates `append-*` cases (first: `append-docs`, not yet run). Retest set, 3 runs each: arm L (shipped route, live router) 27/27, arm C (static snapshot) 25/27, L $0.340 vs $0.359 per run and 10% fewer input tokens. vet-plugin is n/a in both: plugin-vetter isn't installed where the harness runs (temp cwd, so project- and local-scope plugins don't load), and the snapshot arms' earlier vet-plugin passes called an agent that didn't exist.

### 3. Merge the coders, model table in the prompt

Shape from slice 1's gate (one `coder`, or `coder` plus `coder-critical`).

- `plugins/coder/agents/coder.md`: `model: sonnet`, `effort: medium`, tier-neutral opening line; replace step 6's "don't add docs" (`:26`) with "write the tests and the docs your change makes stale"; the escalate example (`:28`) asks for a stronger model or a diagnosis.
- Move `plugins/coder-high`, `coder-critical` (unless kept by the gate) and `coder-max` to `archive/plugins/`; remove them from `.claude-plugin/marketplace.json` and the `orchestration-meta` deps; fix the `coder-max` per-repo text in `orchestration-meta/plugin.json:4`, `marketplace.json:144` and the root `README.md:6,53`; regenerate the catalog.
- `plugins/orchestration/agents/orchestration.md`:
  - frontmatter description (`:3`) and the Planning rule (`:26`, "`coder-high`, not `coder`") in model terms;
  - replace the Implementation tier ladder (`:28`), the debugger `fix — <complexity>` ladder (`:50`) and the `coder-max` handling (`:54`) with the model table: haiku/medium for mechanical, fully specified edits; sonnet/medium by default; opus/high for concurrency, security, data and core invariants; fable/high only on an explicit escalation or when the user asks;
  - a retry on a stronger model is a new `coder` call carrying the failed report (`SendMessage` can't change model);
  - route implementation to `coder`, never `general-purpose`;
  - rewrite the routing examples in model terms.
- `plugins/debugger/agents/debugger.md:39-40`: the `fix — <complexity>` line names a model, not a tier.
- Harness: one frozen roster snapshot per arm (`router-table-head.md` for B, the new roster for C), since B's old tier prompt can't be tested against a roster without its tiers. `grade.py:57-63` and `cases.json` expectations check `model` as a JSON field next to `subagent_type`.
- `evals/orchestration/`: update the 11 `prompt.md` `plugins:` lists that point at `../../../../plugins/coder-high` and the others, and the graders that name tiers (`grep -rl coder- evals/orchestration`).
- Acceptance: arm C (new prompt, new roster) against B (HEAD prompt, old roster) over the retest set, scored by model; no case regresses; `plugins.py check` passes.

### 4. One author per change, reviewer as verifier

- `plugins/scribe/agents/scribe.md`: standalone docs only (READMEs, guides, Outline, changelogs), not docs a code change makes stale.
- `plugins/reviewer/agents/reviewer.md`: run the checks, compare against acceptance criteria, report pass/fail with evidence; stays read-only.
- Orchestration prompt Review rules: a review is required for multi-file, risky or specialist output; for a small diff with a passing check the orchestrator reads the diff itself; reviewer model per call (haiku quick, sonnet/high thorough, opus for high-stakes thorough).
- Evals: these are second-call behaviours the A/B harness can't see, and `evals/orchestration/` cases today allow only `[Read, Glob, Grep, Agent]` in 4 turns. Add a case type there with `allowed_tools` including Edit, Write and Bash (the run also needs `--allow-tools Edit Write Bash` and `--scaffold`, since a case can't grant write tools itself), a scaffold with a passing test suite, `max_turns` around 14, and the slice-2 append-route entry. Cases: a feature change ships tests and docs from one coder with no scribe call; a small diff with a passing test gets no reviewer call; a multi-file change gets one.
- Acceptance: those cases pass at 3 runs; the retest set doesn't regress.

### 5. Specialists on cheaper models

- `dba` already preloads `db-schema-design` and `postgres`; trim procedure from `dba.md` that those skills already carry. `devops` preloads nothing; leave its body unless an existing skill (terraform, kubernetes, docker) covers a section, then preload that skill. No new plugins.
- The existing `spec-dba` and `spec-devops` cases only check routing, so they can't judge a model. Add outcome cases where the specialist runs and an `llm` rubric grades its output: a migration plan with backfill and rollback (dba), a Terraform change touching IAM (devops). Run each on sonnet and opus.
- Acceptance: sonnet matches opus on the outcome cases for design and read-only work, or the agents stay on opus; apply-to-shared-state work stays on opus either way; the result is recorded here.

### 6. Shippers

Read `plugins/shipper` and `plugins/forgejo-shipper`; fold each into its ship skill or keep it. Acceptance: if folded, the ship skill's evals still pass and the routing table no longer lists the agent; the decision and reason are recorded here.

### 7. Trim the prompt

With the ladders gone, remove duplicated rules from `orchestration.md` and measure its tokens before and after. Acceptance: arm C holds its slice-3 score over the retest set.

### 8. Measure after a week

From slice 1's `turn.step` lines: calls per session, reviewer share, and the resolved opus vs sonnet vs haiku split for the main loop and subagents.

## Risks

- **Effort may not reach plugin agents.** Slice 1 checks it and picks the merge shape before slice 3.
- **A forgotten `model` falls back to the agent file's sonnet**, never Opus (`CLAUDE_CODE_SUBAGENT_MODEL` is unset).
- **The A/B harness sees only the first routing decision.** Review and docs hand-offs need the slice-4 cases, which run real subagents and cost more.
- **The harness runs against installed plugins.** Working-tree plugins need `--plugin-dir`; installed copies change only on ship.
- **A shipped prompt change reaches every orchestration session.** Each slice ships only after its evals pass; the old prompt is one `git revert` away.
- **Archiving tier plugins** leaves them installed for users of `orchestration-meta` until they prune; note it in the ship message.

## Optional

Vet `anthropics/single-agent-loop-kit` (`vet`, then `plugin-vetter` on its skill) and compare its per-agent verdicts with this plan. Low priority: the decisions above rest on our own measurements.
