# ECC

Source: https://github.com/affaan-m/ECC · License: MIT (Affaan Mustafa, 2026) · Last commit: 2026-10-15 15:17 -0400 (`Merge pull request #3596 from affaan-m/feat/pr-burst-protection`) · Catalog: [catalog.md](catalog.md)

Local clone: `3rd-party/ECC/` (gitignored). Plugin `ecc@ecc`, version 2.2.3.

## Purpose

ECC ("Everything Claude Code") is described in its README as "the agent harness operating system": a harness-native operator layer of skills, agents, slash commands, hooks, rules, and MCP conventions for Claude Code and adjacent harnesses (Codex, OpenCode, Cursor, Kimi, Kiro, Gemini, and others). It is maintained by Affaan Mustafa (`affaan-m`), who says a single maintainer ships weekly. The repo has about 3,900 commits since 2026-01-17. The README pushes a paid hosted GitHub App (ECC Pro) and sponsorships; the core is MIT.

## Layout

| Path | Contents |
|---|---|
| `skills/` | 311 canonical skills, each `SKILL.md` with `name`/`description` frontmatter |
| `agents/` | 71 canonical subagent definitions (`tools`, `model` frontmatter) |
| `commands/` | 97 slash-command files (`description` frontmatter); the plugin manifest calls these "legacy command shims" |
| `hooks/` | `hooks.json` (production hook graph), `memory-persistence/hooks.json` (reference only) |
| `scripts/hooks/` | 58 Node hook scripts plus `scripts/lib/` helpers |
| `.claude-plugin/` | `plugin.json`, `marketplace.json` (one plugin, `source: ./`) |
| `pi/core/`, `.agents/`, `.kiro/`, `.cursor/`, `.codex/`, `.opencode/`, … | Per-harness mirrors and installers |
| `docs/<locale>/` | Translated READMEs and mirrored skills/agents (ar, pt-BR, zh-CN, zh-TW, ja-JP, ko-KR, tr, ru, es, de, …) |
| `docker/`, `ecc2/`, `src/`, `tests/`, `schemas/`, `manifests/` | Tooling, tests, install manifests |

## Counts

The catalog's totals count copies. The canonical numbers match `plugin.json`.

| Item | Catalog says | Canonical | Where the difference comes from |
|---|---|---|---|
| Skills (`SKILL.md`) | 1062 | 311 | +132 `pi/core/skills/*` (first copy checked is byte-identical to `skills/`), +46 `.agents/skills`, +43 `.kiro/skills`, +12 `.cursor/skills`, +518 under `docs/<locale>/` |
| Agents (`.md`) | 310 | 71 | About 200 under `docs/<locale>/`, 33 in `.kiro/agents/` |
| Commands | 457 | 97 | Translated and mirrored command files |
| hooks.json | 4 | 4 | `hooks/hooks.json` (27 entries), `hooks/memory-persistence/hooks.json` (6), `.cursor/hooks.json` (15), `scaffolds/cursor/hooks.json` (1) |

## Categories

Skills are bucketed by keyword on directory name (first match wins), so treat these as approximate.

| Skills by area | Count | Examples |
|---|---|---|
| Agent harness, orchestration & workflow | 74 | `agent-harness-construction`, `continuous-learning-v2`, `council`, `dmux-workflows`, `orch-pipeline` |
| Languages, frameworks & infra | 52 | `python-patterns`, `golang-testing`, `kotlin-ktor-patterns`, `springboot-patterns`, `kubernetes-patterns` |
| Business, ops & domain workflows | 36 | `finance-billing-ops`, `investor-materials`, `customs-trade-compliance`, `logistics-exception-management` |
| Testing, QA & evals | 35 | `tdd-workflow`, `e2e-testing`, `eval-harness`, `browser-qa`, `ai-regression-testing` |
| Security, compliance & audit | 29 | `security-review`, `hipaa-compliance`, `defi-amm-security`, `security-bounty-hunter` |
| Design, UI & media | 24 | `frontend-design-direction`, `remotion-video-creation`, `liquid-glass-design`, `motion-patterns` |
| Unclassified | 23 | mixed one-offs |
| AI, ML & data science | 19 | `prompt-caching-strategy`, `pytorch-patterns`, `scientific-db-pubmed-database`, `recsys-pipeline-architect` |
| Networking & homelab | 10 | `network-bgp-diagnostics`, `netmiko-ssh-automation`, `homelab-wireguard-vpn` |
| Docs & architecture | 7 | `architecture-decision-records`, `codebase-onboarding`, `docs-governance` |
| Healthcare | 2 | `healthcare-cdss-patterns`, `healthcare-phi-compliance` (plus more under other buckets) |

Agents by area (71 canonical):

| Agents by area | Count | Examples |
|---|---|---|
| Code & domain review | 32 | `code-reviewer`, `security-reviewer`, `python-reviewer`, `database-reviewer`, `rag-pipeline-reviewer` |
| Build/fix resolvers | 10 | `build-error-resolver`, `go-build-resolver`, `rust-build-resolver`, `pytorch-build-resolver` |
| Testing, ops & maintenance | 10 | `tdd-guide`, `e2e-runner`, `loop-operator`, `harness-optimizer`, `refactor-cleaner` |
| Planning, architecture & exploration | 7 | `planner`, `architect`, `code-architect`, `code-explorer`, `spec-miner` |
| Business & misc | 5 | `chief-of-staff`, `marketing-agent`, `seo-specialist`, `harmonyos-app-resolver` |
| Open-source packaging | 3 | `opensource-forker`, `opensource-sanitizer`, `opensource-packager` |
| GAN design loop | 3 | `gan-planner`, `gan-generator`, `gan-evaluator` |
| Networking | 1 | `network-config-reviewer` (plus `network-architect`, `network-troubleshooter`, `homelab-architect` in other buckets) |

Models: 61 `sonnet`, 6 `haiku`, 4 `opus`.

## Hooks

| hooks.json | Events | What it does |
|---|---|---|
| `hooks/hooks.json` (production, auto-loaded by the plugin) | PreToolUse (10), UserPromptSubmit (1), PreCompact (1), SessionStart (2), PostToolUse (2), PostToolUseFailure (2), Stop (8), SessionEnd (1) | Every entry goes through `plugin-hook-bootstrap.js` → `run-with-flags.js`, so it runs only when the `hook_profile` allows it. PreToolUse: `gateguard-fact-force.js` (denies first Edit/Write/Bash until the agent states facts), `config-protection.js`, `doc-file-warning.js`, `suggest-compact.js`, `mcp-health-check.js`, `governance-capture.js`, `hookify-runtime.js`, `observe-runner.js`, `pre-bash-dispatcher.js`. Stop: `check-console-log.js`, `stop-format-typecheck.js`, `cost-tracker.js`, `evaluate-session.js`, `session-end.js`, `desktop-notify.js`, `plan-canvas-pending.js`. SessionStart: `session-start-bootstrap.js` (loads bounded prior context), `plan-canvas-sessions.js`. PostToolUse: `posttooluse-dispatcher.js` (consolidated sync and async runner). PostToolUseFailure: `skill-run-tracker.js`, `mcp-health-check.js`. PreCompact: `pre-compact.js` (saves a summary). |
| `hooks/memory-persistence/hooks.json` | SessionStart, PreCompact, PreToolUse/PostToolUse (observe), SessionEnd | Self-described as reference only; the production graph is `hooks/hooks.json`. |
| `.cursor/hooks.json` | 15 Cursor events (sessionStart … stop) | Cursor harness counterpart, scripts in `.cursor/hooks/`. Not used by the Claude plugin. |
| `scaffolds/cursor/hooks.json` | sessionStart | Template for Cursor installs. |

The hook scripts are plain Node with `child_process` and `fs`. The `hook_profile` setting (minimal, standard, strict) decides which of them run.

## Install / use

From the README (exact commands):

```
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc

npx ecc-universal@2.2.3 setup                       # recommended guided Claude plugin setup
npx ecc-universal@2.2.3 install --guided
npx ecc-universal@2.2.3 install --profile minimal --target claude
npx ecc-universal@2.2.3 consult "security reviews" --target claude

git clone https://github.com/affaan-m/ECC.git && cd ECC && npm install
./install.sh --profile minimal --target claude

codex plugin marketplace add affaan-m/ECC           # Codex
```

Do not stack a manual install on top of `/plugin install`, because hooks would run twice. The README also says plugin installs do not auto-enable its bundled MCP servers. Nothing here has been installed into this workspace.

## Provenance and overlap

- Mostly original. `metadata.origin` in `skills/*/SKILL.md`: 210 `ECC`, 8 `ECC direct-port adaptation`, 47 `community`, 36 with no origin, and a few named outside sources (a hospital, RapportScore, Flox, and others).
- Explicit attributions exist. `react-performance` is adapted from Vercel Labs `agent-skills` (MIT). `database-reviewer` has Supabase agent-skill patterns (MIT). `osint-investigation` is adapted from `shoyann/RZK-The-Hunter`. `frontend-slides` is inspired by `zarazhangrui`. `blueprint` is inspired by `antbotlab/blueprint`.
- Overlap with `3rd-party/wshobson-agents` is small. By name, 2 of 311 ECC skills (`architecture-decision-records`, `recsys-pipeline-architect`) appear there, and 2 of 71 agents (`architect`, `code-reviewer`). The two shared skills are not copies: the ADR skill differs by 333 diff lines, and the recsys skill by 196. None of the sampled ECC names I checked (`python-patterns`, `python-testing`, `security-review`, `tdd-workflow`, `api-design`, `backend-patterns`) is in wshobson. wshobson has 185 unique skill names and 202 agent files. Name-level only; I did not diff contents beyond those two.
- Heavy duplication, not generation from wshobson. The inflation in the catalog count comes from per-harness and per-locale copies. Headings are highly templated: `## When to Activate` appears in 151 skills, `## When to Use` in 130, `## Related Skills` in 70. That points to one house style, probably LLM-assisted. The repo alone cannot prove how it was authored.
- Marketing is mixed into the README (Pro and sponsor CTAs), and the README warns about unofficial mirrors.

## Highlights

- `skills/gateguard/SKILL.md` and `scripts/hooks/gateguard-fact-force.js`: PreToolUse gate that forces facts (importers, schemas) before the first edit or shell command.
- `skills/blueprint/SKILL.md`: turns one objective into a PR-sized, dependency-ordered construction plan for multi-agent work.
- `skills/continuous-learning-v2/`: instinct capture and clustering, with `scripts/instinct-cli.py`.
- `commands/evolve.md`: promotes clustered instincts into commands or skills.
- `agents/gan-planner.md`, `agents/gan-generator.md`, `agents/gan-evaluator.md` (with `skills/gan-style-harness/`): generator/evaluator design loop.
- `agents/opensource-sanitizer.md`, `agents/opensource-forker.md`, `agents/opensource-packager.md` (with `skills/opensource-pipeline/`): strip secrets and internal refs before publishing.
- `skills/healthcare-phi-compliance/` and `skills/healthcare-cdss-patterns/`, with `agents/healthcare-reviewer.md`: clinical and PHI domain.
- `skills/customs-trade-compliance/` and `skills/logistics-exception-management/`: supply-chain operations.
- `skills/cisco-ios-patterns/`, `skills/netmiko-ssh-automation/`, `skills/network-config-validation/`: network device automation.
- `skills/defi-amm-security/`, `skills/evm-token-decimals/`, `skills/prediction-market-risk-review/`: on-chain and prediction-market review.
- `skills/plan-canvas/` and `scripts/hooks/plan-canvas-pending.js`: Stop-hook guard against undelivered plan feedback.
- `skills/hookify-rules/` and `scripts/hooks/hookify-runtime.js`: ECC-native rule hooks.
- `skills/cost-aware-llm-pipeline/` and `skills/prompt-caching-strategy/`: LLM cost and caching patterns.

## Quality notes

- Good: `skills/tdd-workflow/SKILL.md` has clear activation triggers and a concrete red-green-refactor flow. `agents/code-reviewer.md` has a tight checklist, a confidence filter (report only >80% sure), and a prompt-injection baseline. `skills/gateguard/SKILL.md` gives a clear rationale. `scripts/hooks/gateguard-fact-force.js` has a clear header and cross-platform handling.
- Unverified claims: gateguard cites "+2.25 quality points" from an A/B test. Only 5 skills cite evaluation numbers, and I did not find the eval data in the repo.
- Inconsistency: 36 skills lack an `origin` field. The hook chain is three layers deep (bootstrap, flag runner, script), so each event spawns several Node processes.
- Hygiene: a quick grep found hard-coded `/home/<user>` paths in skill docs and test fixtures (e.g. `skills/flox-environments/SKILL.md`). I did not run a full secret scan.
- Only the README, manifests, four hooks files, and eight sampled files were read (tdd-workflow, gateguard, blueprint, django-security, code-reviewer agent, evolve command, gateguard script, plus name-level checks across the tree). The catalog was read only at its header.

## Relevance to adminhead

- Good donor for domain skills that the wshobson-agents overlap does not cover: healthcare, customs and logistics, network automation, and DeFi. Cherry-pick individual skills with attribution. Do not vendor the whole tree.
- The hook design (profiles, `run-with-flags`, first-touch gates) is a reference for `plugins/coremods`. adminhead's mods can't run these node hooks directly, and classic hooks do not fire for calls a mod denied (per the mods rules in CLAUDE.md).
- Expect inflated numbers: quote 311 skills, 71 agents, 97 commands, not 1062, 310, and 457.
- The README's install path (`/plugin install ecc@ecc`, `npx ecc-universal`) is a competing install route. Avoid stacking it on any local plugins.
- Licence is MIT, so reuse with attribution is clear, but check each attributed upstream (Vercel, Supabase, shoyann, zarazhangrui) before copying their text.
