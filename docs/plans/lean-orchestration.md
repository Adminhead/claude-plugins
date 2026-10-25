# Leaner orchestration: fewer handoffs, cost-tiered workers

Status: proposed, 2026-10-25. Nothing changed yet.

Source: Anthropic's "When to fold subagents into your main agent loop" (claude.com, Oct 2026) and its kit `anthropics/single-agent-loop-kit` (Measure, Combine, Fold; a verdict per subagent of fold, merge, call as tool, or keep).

## Decisions

- The main session stays an orchestrator. It plans, routes, integrates and verifies; it doesn't become a do-everything loop.
- Workers keep explicit cheaper models. Defaulting to the session model (Opus 5.5) would burn the subscription allowance on work haiku or sonnet does well. The article's case is quality, cost and latency per token on the API; ours is allowance per model, so model tiering is a reason to keep subagents the article doesn't weigh.

What we take from the article: cut handoffs between authors, keep verification independent but proportionate, thin the orchestrator prompt, put domain rules in skills instead of prompt rules, and migrate with evals.

## Baseline

From `~/.local/state/claude-usage` (2026-10-18 to 10-25, 50 sessions, 787 Agent calls, all from the main loop):

| Agent (model) | Calls | Note |
|---|---|---|
| reviewer (sonnet, high) | 267 | 34% of calls; a review after nearly every change, about 1 per coder call |
| coder-high (sonnet) | 187 | picked directly, not reached by escalation (no prompts cite an earlier attempt) |
| coder (haiku) | 74 | the prompt calls it the default; in practice it's the second choice |
| scribe (haiku) | 65 | docs handed off from the author who has the context |
| architect (opus) | 42 | |
| coder-critical (opus) | 38 | |
| security-auditor (opus) | 31 | |
| general-purpose (inherit) | 30 | runs on the session model, the most expensive worker |
| devops (opus) | 24 | |
| debugger / Explore / dba / coder-max | 8 / 7 / 6 / 3 | |

Per session: median about 6 calls, top sessions 165, 102, 78.

## Changes

| Area | Change | Why |
|---|---|---|
| orchestration prompt | rewrite to about half its 80 lines | drop the `escalate:` table, the climb-one-rung ladder and duplicated rules; keep routing, briefs, worktrees, evidence rules |
| coder tiers | merge `coder`, `coder-high`, `coder-critical` and `coder-max` into one `coder` (frontmatter `model: sonnet`, `effort: medium`); the orchestrator picks `model` and `effort` per call from a table in its prompt | the four files differ only in name, description, model, effort, color, one tier sentence and an escalate example; the Agent tool's `model` overrides frontmatter |
| model table (in the orchestration prompt) | haiku/medium for mechanical, fully specified edits; sonnet/medium by default; opus/high for concurrency, security, data and core invariants; fable/high only on an explicit escalation or when the user asks | matches what the orchestrator already picks (sonnet 187, haiku 74) and states each model's allowance cost. The Agent tool sets `effort` only when instructions ask, so the prompt names the effort for each row |
| escalation | a retry on a stronger model is a new `coder` call with a higher `model` and the failed attempt's report; `SendMessage` can't change an agent's model | replaces the climb-one-rung tier ladder |
| one author per change | the coder writes code, tests and the docs its change makes stale; `scribe` only for standalone docs (READMEs, guides, Outline) | cuts the coder → scribe handoff |
| review | reviewer becomes a verifier: run the checks, compare to acceptance criteria, report pass/fail with evidence. Required for multi-file, risky or specialist output; for a small diff with a passing check the orchestrator reads the diff itself. Same per-call model rule: haiku for a quick pass, sonnet/high for a thorough one, opus for high-stakes thorough passes | cuts the per-change review gate; keeps independent checking where it pays |
| general-purpose | route implementation to `coder`, not `general-purpose` | it inherits opus |
| usage log | record the Agent call's `model` and `effort` with its type (`usage-log/hooks/register.tsx:84`) | after the merge every call reads `coder:coder`, so the per-model share would be lost |
| specialists (dba, devops, security-auditor) | keep as routes; move generic procedure into skills preloaded with `skills:`; try sonnet for dba and devops, evals decide | opus on every infra or schema call is expensive |
| architect, debugger, browser-tester, auditors, plugin-vetter | keep | context isolation and independent verification |
| shippers | audit in slice 5 | probably fold into the ship skills |
| agent-router | keep | the orchestrator still routes; it's the tool search for agents |

## Slices

0. **Vet the kit.** `vet` on `anthropics/single-agent-loop-kit`, then `plugin-vetter` on its skill before copying anything. If it passes, run its audit against this roster and compare its verdicts with the table above; read every "fold" verdict against the allowance argument.
1. **Log models, then baseline evals.** First add `model` and `effort` to the usage log's `agent-call` line (`usage-log/hooks/register.tsx:84`, with its test) and confirm a plugin agent honours a per-call `effort`. Then extend the two existing suites: `evals/orchestration/` (`claude plugin eval` routing cases across agent-plugin combinations, subagents really run) and `evals/orchestration-ab/` (the system-prompt A/B harness: real installed plugins, first routing decision only, subagent calls denied). Update `evals/orchestration/` graders that name tier agents when the coders merge. Each case checks a routing outcome, stated as model and effort so it holds before and after the merge:
   - a one-file fix is done inline, no Agent call
   - a mechanical 6-file rename goes to a coder on haiku, in parallel worktrees
   - an API redesign goes to a coder on sonnet, not opus
   - a concurrency fix goes to a coder on opus at high effort
   - nothing uses fable without an explicit escalation
   - a schema migration question goes to dba (or loads the postgres skill)
   - an IaC change touching IAM gets security-auditor
   - a feature change ships tests and updated docs from the same coder, no scribe call
   - a small diff with a passing test gets no reviewer call; a multi-file change does
   - a failing test with unknown cause goes to debugger before any coder
   Record pass rates and Agent calls per model on the current prompt.
   Done ahead of the rewrite (2026-10-25, uncommitted): `orchestration.md:10` now keeps unknown-cause and concurrency/security/data/invariant work out of "do it yourself" regardless of size, and a "Routing examples" section of ten contrasting pairs sits before the escalation rules. Retest, 8 cases × 3 runs, default prompt in all arms: B (old prompt) 18/24, C (fixed prompt) 23/24, D (old prompt plus the same text as an on-demand skill) 19/24 with the skill loaded 0/24. C fixed race-fix (0→3/3) and failing-test (0→3/3) without over-delegating the two known-cause inline cases (3/3), and was the cheapest arm ($0.268 vs $0.279 per run, 5.0 vs 6.3 turns, 16% fewer input tokens). Multi-slice still went to haiku `coder` 2/3 times: the orchestrator settled the design choice itself on a ~280-line repo. Routing guidance stays in the prompt; an on-demand routing skill never fires. Follow-up: the Planning rule now lets the orchestrator settle a small design choice in a small codebase but sends a several-module feature to `coder-high`, with a matching example; the multi-slice case accepts `architect` or `coder-high`. Rerun of C (3 runs each): multi-slice 3/3 to `coder-high`, race-fix 3/3, small-safe-change 3/3 inline.
2. **Rewrite the orchestration prompt** (`plugins/orchestration/agents/orchestration.md`), including the model table. It replaces the rule at `orchestration.md:28` that tiers are picked "not by setting `model`". A/B against the old prompt with `claude-orchestrate -a` pointing at a user-scope copy of the current agent; run slice 1 on both.
3. **Merge the coders and update the worker prompts.** One `plugins/coder/agents/coder.md`: tier-neutral opening line, the "writes its own docs" rule, and an escalate example that asks for a stronger model or a diagnosis. Delete `coder-high`, `coder-critical` and `coder-max` (or move them to `archive/plugins/`) and drop them from `orchestration-meta`. Trim `scribe` to standalone docs and rewrite `reviewer` as the verifier. The routing table reads these descriptions, so they matter as much as the prompt.
4. **Skills for specialist procedure.** Move generic how-to out of dba and devops into skills, preload them, and test sonnet for both against slice 1.
5. **Shippers.** Decide fold or keep for `shipper` and `forgejo-shipper`.
6. **Dependents.** `readonly-agent-gate/scripts/agents.ts:8-25` only if an agent's name or read-only status changes; `orchestration-meta` deps; `scripts/plugins.py check`, then `catalog`.
7. **System prompt.** Run `scripts/prompt-drift.sh` against the current Claude Code (pinned at 2.1.302; upstream cut its prompt by 80%+). Decide whether to keep replacing the default prompt with `--agent` plus `system_override.md`, or append the orchestration prompt to the default with `--append-system-prompt-file`, which would retire `system_override.md` and the drift check. Measured 2026-10-25 on Claude Code 2.1.310, Opus 5.5, one `-p` turn in this repo: default prompt alone 29,569 input tokens; default plus the orchestration body appended 33,203; `--agent` plus `system_override.md` 36,407, or 34,966 without the agent-router table (1,441 tokens). Like for like, appending to the default prompt is about 1,760 tokens smaller per request. A/B run 2026-10-25 (10 routing cases × 3 runs per arm, Opus, real plugin set, subagent calls denied by a hook; harness in the session scratchpad): routing matched on 8 of 10 cases; the default-prompt arm delegated vet-plugin to plugin-vetter 3/3 where the replacement arm vetted inline 0/3; mechanical-rename 2/3 vs 1/3; destructive was contaminated (the hook denied a `git clean -n` dry run, so models learned the command was blocked). Cost per run was equal ($0.331 vs $0.330); the default arm used 12% fewer input tokens, 1.1 fewer turns and was 6% faster. Both arms did race-fix and failing-test inline on Opus (0/3 delegated) and sent multi-slice to haiku `coder` instead of `architect` (0/3): the current orchestration prompt under-delegates whichever system prompt carries it, which slice 2 has to fix. Leaning toward the switch; agent-router then needs a new way to detect an orchestration session, since it keys on the main thread's `agent_type`.
8. **Measure after a week.** Same usage-log table: calls per session, reviewer share, opus vs sonnet vs haiku call share, eval pass rates.

## Open questions

- Fable: merging `coder-max` makes fable reachable in every repo, gated only by the prompt rule (that was already true of the `model` parameter). Keep `coder-max` as a per-repo plugin if an install-level gate matters.
- dba and devops on sonnet: acceptable if evals hold, or keep opus for anything touching shared state?
- Slice 7: switch to appending to the default prompt (smaller as measured, and no drift upkeep), or keep the replacement for some behavior the default prompt lacks?
