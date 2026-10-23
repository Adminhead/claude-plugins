# paperthin

Source: https://github.com/LilMGenius/paperthin · License: MIT (Copyright 2026 LilMGenius) · Last commit: 2026-10-01 (`fix: re-cut a tag the author broke instead of rolling the version forward`) · Catalog: [catalog.md](catalog.md)

## Purpose

Plain-Markdown agent skills that keep an artifact "clean and true": rewrite a drifted doc, check the model's reading of a request, consolidate a fact that lives in several places, audit an eval for leakage, and similar hygiene reflexes. The suite says it is agent-agnostic and that its skills remove more than they add. Its README calls the restraint the product: a pass that finds nothing to improve changes nothing. Checked at commit 7d5dc62, package version 0.17.7.

## Layout

- `.claude-plugin/plugin.json`: one plugin, `paperthin`, that lists all 28 skills by path.
- `skills/<perspective>/<name>/SKILL.md`: one directory per skill, grouped by perspective (`depth/`, `breadth/`, `coil/`, `mesh/`). AGENTS.md says perspective is the only durable cut inside a plugin, and topic domains belong in separate plugins.
- `AGENTS.md`: the contributor and authoring guide. Claude Code reaches it through a one-line `CLAUDE.md`.
- `README.md` and `docs/readme/`: the human-facing README and its translations.
- `docs/invocation.md`: why each skill is user-invoked or model-invoked.
- `NOTICE`: per-source attribution for vendored material. It lists only mattpocock/skills.
- `scripts/` and `.github/workflows/release.yml`: catalog and sync checks, and the CI release run that a signed tag triggers.

## Counts

- 1 plugin, 0 marketplaces, 0 agents, 0 commands, 0 hooks.json files (from `catalog.md`).
- 28 skills on disk, and 28 listed in `plugin.json`.
- 12 user-invoked (`disable-model-invocation: true`): debloat, dedash, feynman, hate, macrothink, prism, re0-git, re0-merge, re0-plan, re0-release, re0-upgrade, reorder.
- 16 model-invoked: aim, autobahn, catchup, detool, factchk, mandela, modelchk, nba, re0, re0-loop, re0-memo, re0-work, readchk, shower, sip, ssotize.

## Themes

| Perspective | Skills | What it asks (AGENTS.md) |
|---|---|---|
| `depth/` (19) | re0, readchk, aim, modelchk, hate, macrothink, feynman, autobahn, reorder, detool, dedash, debloat, shower, factchk, mandela, sip, re0-git, re0-release, re0-merge | Refine or verify the thing in hand |
| `breadth/` (2) | ssotize, re0-upgrade | Reconcile one truth across files and platforms |
| `coil/` (6) | re0-plan, re0-loop, re0-memo, re0-work, catchup, nba | Carry learning between build cycles |
| `mesh/` (1) | prism | Converge independent views into consensus |

## Install / use

From the README:

```bash
npx skills@latest add LilMGenius/paperthin --global --agent '*'
```

The README asks you to run this from an elevated shell if your OS asks, so the skills are symlinked and update with the repo. Copied skills do not update. The upstream README gives no `claude plugin install` command, so this `npx` route is the documented one.

To update, run `/re0-upgrade`. It shows the reconciliation plan and asks for confirmation before it changes anything. Call a skill by name, such as `/re0`. Model-invoked skills also fire on their own; user-invoked skills run only when typed.

## Highlights

- `skills/depth/re0/SKILL.md`: refreshes an artifact into a clean v0 rather than patching it. The result should read as a v0 with no trace of the older draft.
- `skills/depth/hate/SKILL.md`: returns `{ root, first_nail }`, one load-bearing objection and the cheapest test that would settle it (user-invoked).
- `skills/depth/mandela/SKILL.md`: audits an eval, metric, or experiment against an 8-pattern leakage taxonomy.
- `skills/depth/sip/SKILL.md`: after an artifact or skill changes, taste-tests it with the suite's own skills rather than the author's in-session judgment.
- `skills/depth/autobahn/SKILL.md`: carves guardrail-adjacent scope out before execution, then runs the safe remainder in a fresh subagent that sees only the carved prompt, with a visible descope ledger.
- `skills/mesh/prism/SKILL.md`: splits one artifact across independent lenses and returns where they clash, not an average (user-invoked).
- `AGENTS.md`: authoring rules, such as keeping examples generic and giving each fact one home. Each skill states its runtime rules inline so it ships alone.
- `docs/invocation.md`: the rule for the invocation split. Default to model-invoked; go user-invoked only when the trigger is a deliberate human action or an always-available reflex would bias the agent.

## Quality notes

- Strong, opinionated stance. The README's `[PROOF]` blocks are case reports from the author's own projects, not benchmarks or evals. Read them as provenance, not as evidence of effect.
- Orchestrators (`sip`, `re0-loop`, `re0-release`, `re0-merge`) call other skills by name when they are present and skip the rest. AGENTS.md says they degrade gracefully.
- Several names are coinages (`re0`, `shower`, `ssotize`, `mandela`) that a reader cannot decode. The adminhead plan renames four of them.
- `re0-upgrade` changes the machine. It writes a `SessionStart` command into agent config files, and it fetches scripts from `scripts/` at the tag matching the installed version, with no hash check. Its SKILL.md also offers a GitHub star through `gh api`, behind consent. The adminhead vet rated it NEEDS HUMAN REVIEW, with no Critical or High findings.
- Maintenance is active: the last commit is 2026-10-01, and releases go out by signed tag through CI, which runs the npm publish with provenance (AGENTS.md "Releasing").

## Relevance to adminhead

- Ledger verdict is "Stole the idea" (see [docs/README.md](../../README.md)). The package is not installed; selected parts are adapted into adminhead plugins.
- The triage of all 28 skills is in [paperthin-ports.md, Triage (all 28)](../../plans/paperthin-ports.md#triage-all-28). It ports some skills as new plugins, some under new names, folds some into existing plugins, and skips the rest as overlapping with existing skills or bound to the upstream repo.
- The user decisions of 2026-10-23 are in [paperthin-ports.md, User decisions](../../plans/paperthin-ports.md#user-decisions-2026-10-23). `autobahn` is rejected: its pattern hides risky input from the executing subagent, which the user treats as a guardrail-routing pattern. `re0-work` is ported as `v0-restart`.
- Security vet: no Critical or High findings. `re0-upgrade` is rejected, which covers its SessionStart hook writes, its unpinned remote script fetch, and its consent-gated star offer. The plan's Status section lists no finished ports yet.
