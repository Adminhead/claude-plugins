# Third-party review: small repos

Scope: `3rd-party/` mattpocock, agent-skills (addyosmani), humanizer, anti-ai-slop-writing, ponytail, taste-skill, claude-code-best-practice, plus `avoid-ai-writing@conorbronsdon-skills`. Every skill and agent was listed with its description and word count. I opened every port or cross-dep candidate in full or in its key sections.

## 1. Summary

- Items rated: about 121. That is 38 mattpocock skills, 25 agent-skills skills + 4 agents, 1 humanizer, 1 anti-ai-slop, 6 ponytail skills + hooks + band mod, 14 taste-skill, 20 agents + 9 skills in claude-code-best-practice, and avoid-ai-writing.
- Verdicts: **port 17** (12 mattpocock, 3 agent-skills, 1 ponytail, 1 taste-skill), **merge 16**, **cross-dep 1**, **skip about 87**. The skip count includes the bulk categories in section 3.
- **Writing-style winner: `avoid-ai-writing@conorbronsdon-skills`** (cross-dep or a direct install). humanizer merges into it; skip anti-ai-slop-writing.
- **ponytail: replace the upstream plugin.** Port only its core ruleset as one small hooks plugin. Its skills, its per-prompt hook and its band mod are not worth what they cost on every turn.
- mattpocock is the best source here: short, concrete skills (grilling, diagnosing-bugs, tdd, prototype, wizard, codebase-design, domain-modeling, handoff, retro, pr). It ships as a 27-skill mega-plugin, so port, never cross-dep.
- agent-skills is good but long (1.5k-3.5k words per skill) and mostly covered by built-ins or mattpocock. Port 2 skills (doubt-driven-development, deprecation-and-migration) and 1 agent (web-performance-auditor).
- taste-skill: port only the flagship v2 `design-taste-frontend`, which has scripts, a library and a real-browser inspector. Skip the 13 variants.
- claude-code-best-practice is a course and demo repo. Skip everything. At most it is reading material for the repo-local authoring skills.
- None of these upstreams except avoid-ai-writing (and humanizer, which loses) ships a focused plugin. All others are one-plugin bundles, so cross-dep does not fit them.

## Upstream packaging (cross-dep viability)

| Repo | Marketplace / plugin | Granularity | Maintenance | License | Cross-dep? |
|---|---|---|---|---|---|
| mattpocock/skills | `mattpocock-skills@claude-plugins-official` (also its own `.claude-plugin/marketplace.json`) | 1 plugin, 27 skills | Very active (2026-10-13), 295k stars | MIT | No: mega-plugin |
| addyosmani/agent-skills | `agent-skills@addy-agent-skills` | 1 plugin, 25 skills + 9 commands (agents not wired) | Active (0.6.13, 2026-10-13) | MIT | No: mega-plugin |
| blader/humanizer | `humanizer@humanizer` | 1 plugin, 1 skill (5.2k words) | Active (3.1.0, 2026-10-16), 58k stars | MIT (LICENSE says Siqi Chen) | Yes, but loses to avoid-ai-writing |
| jalaalrd/anti-ai-slop-writing | none (README points at a nonexistent `founder-toolkit` repo) | 1 bare skill | Stale (2026-04-18) | No LICENSE file; GitHub reports none | No |
| conorbronsdon/avoid-ai-writing | `avoid-ai-writing@conorbronsdon-skills` | 1 plugin, 1 skill (4.8k words + references, detector, node scripts) | Active (3.38.0 upstream, pushed 2026-10-15), 5k stars | MIT | **Yes** |
| DietrichGebert/ponytail | `ponytail@ponytail` | 1 plugin: 6 skills + 3 classic hooks + band mod + userConfig | Very active (5.3.2, 2026-10-17) | MIT | No: bundles 3 component types |
| Leonxlnx/taste-skill | `taste-skill@taste-skill` | 1 plugin, 14 skills | Active (2026-10-14) | MIT | No: mega-plugin |
| shanraisshan/claude-code-best-practice | none | Docs repo | Active (daily badge bumps) | MIT | N/A |

## Writing-style decision: avoid-ai-writing vs humanizer vs anti-ai-slop-writing

I checked avoid-ai-writing against the user's migrated copy at `~/.claude.bak/skills.migrated/avoid-ai-writing/` (v3.36.0, with the same `plugins/avoid-ai-writing` layout). Upstream is now 3.38.0, so details may have moved slightly.

- All three target the same tells: stock vocabulary, dash overuse, triads, not-X-but-Y, bold labels, chatbot residue. Keeping more than one duplicates triggers and wastes listing tokens.
- **avoid-ai-writing (winner):** a single-skill plugin with detect-only and edit-in-place modes, severity tiers, voice profiles, an optional house-style file, iterate-to-convergence, and a deterministic detector (`detector/patterns.js`, `scripts/check-style.js`). The user already uses it, and the old `scribe` agent preloaded `avoid-ai-writing:avoid-ai-writing`. It is MIT, maintained and focused, so it is the one cross-dep candidate in this set.
- **humanizer: merge into avoid-ai-writing.** It is good and well maintained, with a structural-first, numbered pattern list and a "keep every fact" check. But it is the same size (5.2k words) and does the same job, with no detector and no detect-only mode. It is the fallback if the user ever wants to drop avoid-ai-writing.
- **anti-ai-slop-writing: skip.** No LICENSE file, stale since April, and crude generation-time rules ("no three consecutive same-length sentences", banned-word lists).

---

## 2. Table

### mattpocock (MIT, Matt Pocock; attribute in each port)

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| grilling | `skills/productivity/grilling` | port | `grill` | none | 328w, excellent: design-tree frontier rounds, recommended answer per question, subagent for facts. Absorbs grill-me, grill-with-docs and agent-skills interview-me. It conflicts with a proceed-on-assumption default, so it triggers only on "grill/stress-test". Baseline candidate (see questions). |
| grill-me | `skills/productivity/grill-me` | merge | -> `grill` | | 22w wrapper that only calls grilling. |
| grill-with-docs | `skills/engineering/grill-with-docs` | merge | -> `grill` | | 35w wrapper (grilling + domain-modeling). |
| handoff | `skills/productivity/handoff` | port | `handoff` | baseline | 144w, `disable-model-invocation` (no listing cost). Add the claude-handoff variant as an optional `--bg` step (`claude --bg --name`). |
| claude-handoff | `skills/in-progress/claude-handoff` | merge | -> `handoff` | | Same doc, then launches a background agent. Make it a flag. |
| diagnosing-bugs | `skills/engineering/diagnosing-bugs` | port | `diagnose` | none | 1.4k w + `scripts/hitl-loop.template.sh`. Its core is ten ways to build a feedback loop and a "red-capable command" gate. Make the GLOSSARY/ADR reads optional. Absorbs agent-skills debugging-and-error-recovery. |
| tdd | `skills/engineering/tdd` (+tests.md, mocking.md) | port | `tdd` | none | 574w: seams, tautological-test anti-pattern, vertical slices. Make "confirm seams with user" optional and drop the codebase-design/GLOSSARY coupling. Wins over agent-skills test-driven-development (2.5k w). |
| prototype | `skills/engineering/prototype` (+LOGIC.md, UI.md) | port | `prototype` | none | 487w. `archive/plugins/prototype` is already a port of it (526w, with evals), so re-ship the archived version and diff it against upstream for new fixes. Drop the tracker-capture step. |
| wizard | `skills/engineering/wizard` (+template.sh) | port | `setup-wizard` | none | 673w. Generates a bash wizard for human-only steps (secrets, dashboards). Audit template.sh: hidden entry, no echo or history leaks, `.env` gitignored. |
| codebase-design | `skills/engineering/codebase-design` (+DEEPENING.md, DESIGN-IT-TWICE.md) | port | `codebase-design` | none | 851w deep-module vocabulary: the deletion test, "one adapter = hypothetical seam", interface includes invariants. Fold improve-codebase-architecture in as a user-invoked reference flow. Point the explore step at codebase-memory. |
| improve-codebase-architecture | `skills/engineering/improve-codebase-architecture` | merge | -> `codebase-design` | | 899w HTML-report and grill flow. One component per plugin, so it becomes a reference. Replace the spawn-subagent walk with codebase-memory `get_architecture`. |
| domain-modeling | `skills/engineering/domain-modeling` (+ADR-FORMAT, GLOSSARY-FORMAT) | port | `domain-modeling` | none | 493w glossary + ADR session with a three-part ADR gate. Absorbs agent-skills documentation-and-adrs (ADR parts only). |
| pr | `skills/engineering/pr` | port | `pr-body` | none | 568w template: summary diagram, evidence, merge danger (door, blast radius). Keep the Dex Horthy / Humanlayer credit. Make GLOSSARY optional. |
| retro | `skills/engineering/retro` | port | `session-retro` | none | 679w, user-invoked. Proposes environment fixes (checks over prose rules, no-op steering, tool economy). Point it at the transcript location and swap writing-for-agents for repo-local skill-authoring. |
| to-tickets | `skills/engineering/to-tickets` | port | `to-tickets` | none | 917w tracer-bullet slicing with blocking edges. Rewrite for `gh issue` plus a local-file fallback and drop the `/setup-matt-pocock-skills` dependency. Absorbs to-spec as a "spec first" step. Dry-run, then ask before posting. |
| to-spec | `skills/engineering/to-spec` | merge | -> `to-tickets` | | 493w conversation-to-spec synthesis. Same tracker dependency. |
| writing-for-agents | `skills/productivity/writing-for-agents` | merge | -> repo-local `.claude/skills/skill-authoring` | | 1.8k w. Context pointers, one trigger per branch, no-op pruning. Not shipped; borrow into the authoring skill. Keep explicit never-rules despite its "negation is weak" claim. |
| setup-ts-deep-modules | `skills/in-progress/setup-ts-deep-modules` | port | `ts-module-boundaries` | node-typescript-meta | 1.1k w, user-invoked, beta upstream. dependency-cruiser entry-point boundaries with a "prove the rules bite" step. Low priority. |
| triage | `skills/engineering/triage` | skip | | | Issue/PR state machine for maintainers with external contributors. Niche for a solo marketplace (see questions). |
| wayfinder | `skills/engineering/wayfinder` | skip | | | 2k w multi-session decision map. Depends on the tracker setup and sibling skills; Plan agent and to-tickets cover most of it. |
| code-review | `skills/engineering/code-review` | skip | | | Built-in /code-review. Its "spec axis" is the only extra. |
| implement, implement-spec | `skills/engineering/implement*` | skip | | | Thin chains of tdd -> code-review -> commit. |
| research | `skills/engineering/research` | skip | | | 131w. Background agents, deep-research and Workflow cover it. |
| ask-matt, setup-matt-pocock-skills | `skills/engineering/` | skip | | | Router and config for his own suite. |
| teach, to-questionnaire, wait-what | `skills/productivity/` | skip | | | Niche or prompt macros (wait-what is a 60w prompt tied to GLOSSARY). |
| chief-of-staff, loop-me | `skills/in-progress/` | skip | | | The Workflow tool and agent teams cover coordination; loop-me is a grilling variant. |
| writing-beats, writing-fragments, writing-shape | `skills/in-progress/` | skip | | | Article-writing beta, out of scope. |
| git-guardrails-claude-code | `skills/misc/` | skip | | | Grep hook; permission deny/ask rules do this natively (rejected in the prior review). |
| setup-pre-commit | `skills/misc/` | skip | | | Husky-only. Write a prek/pre-commit skill fresh if wanted. |
| migrate-to-shoehorn, scaffold-exercises | `skills/misc/` | skip | | | Author-specific. |

### addyosmani/agent-skills (MIT)

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| doubt-driven-development | `skills/doubt-driven-development` | port | `doubt-review` | none | 2.6k w; trim to about 1k. Fresh-context adversarial reviewer for in-flight non-trivial decisions, with a sharp "when NOT to use" list. Distinct from /code-review (finished artifacts). |
| deprecation-and-migration | `skills/deprecation-and-migration` | port | `deprecation-migration` | none | 2k w; trim. Hyrum's law, deprecation decision tree, expand-contract column migrations. Nothing else in scope covers it. |
| web-performance-auditor (agent) | `agents/web-performance-auditor.md` | port | `web-perf-auditor` | node-typescript-meta | 1.8k w agent with quick mode (static anti-patterns, marked "not measured") and deep mode (Lighthouse/PSI/CrUX JSON, Chrome DevTools MCP). Honest about not fabricating. Absorbs performance-optimization's web parts. |
| observability-and-instrumentation | `skills/observability-and-instrumentation` | merge | -> archived `observability:instrumentation` | | `archive/plugins/observability/skills/instrumentation` (718w) is ours and tighter. Borrow the "define 2-4 on-call questions first" step. |
| interview-me | `skills/interview-me` | merge | -> `grill` | | 2.5k w; grilling does the same in 328w. Borrow the confidence-number stop condition. |
| test-driven-development | `skills/test-driven-development` | merge | -> `tdd` | | mattpocock version wins on length. |
| debugging-and-error-recovery | `skills/debugging-and-error-recovery` | merge | -> `diagnose` | | mattpocock version wins. |
| api-and-interface-design | `skills/api-and-interface-design` | merge | -> `codebase-design` | | Borrow the contract-first and Hyrum's-law points only. |
| documentation-and-adrs | `skills/documentation-and-adrs` | merge | -> `domain-modeling` | | ADR template overlap. |
| planning-and-task-breakdown | `skills/planning-and-task-breakdown` | merge | -> `to-tickets` | | Slicing overlap; the Plan agent covers the rest. |
| performance-optimization | `skills/performance-optimization` | merge | -> `web-perf-auditor` | | Generic measure-first; the backend parts are covered by the stack metas. |
| code-review-and-quality, code-simplification, security-and-hardening | `skills/` | skip | | | Built-in /code-review, /simplify, /security-review. |
| code-reviewer, security-auditor, test-engineer (agents) | `agents/` | skip | | | Built-ins and the `tdd` port cover them. |

### ponytail (MIT, Dietrich Gebert)

**What it is:** a "lazy senior dev" mode. The `ponytail` skill (about 590 words) says to take the smallest complete change in a fixed order (does it need to exist, reuse the codebase, then stdlib, then an installed dep, then one line), fix callers and tests, leave a `shortcut:` comment for known limits, and never cut validation or security. The plugin injects that ruleset through node hooks:

- **SessionStart:** writes a flag file under `~/.claude` and injects the rules.
- **SubagentStart:** injects the rules into every subagent.
- **UserPromptSubmit:** spawns `node` on every prompt to track `/ponytail` level commands.

It also ships a band mod above the prompt that tracks cost, turns, tokens and reuse, writes a CSV to `~/.config/ponytail/band/`, and can call an optional webhook. On top of that come 5 more skills (review, audit, debt, gain, help).

**Keep it?** Not as the upstream plugin.

- The core rules are good and match the YAGNI line this marketplace already takes.
- The package is the problem. It costs 5 extra skill descriptions every turn, a node process on every prompt, a ruleset in every subagent, and a mod.
- ponytail-review and ponytail-audit duplicate /code-review, and ponytail-gain is a benchmark advert.

Port the ruleset alone as one hooks plugin. Or, cheaper still, paste the 40 lines into `~/.claude/CLAUDE.md`, which subagents also read, and ship nothing.

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| ponytail (core ruleset) | `skills/ponytail/SKILL.md`, `hooks/ponytail-activate.js`, `hooks/ponytail-subagent.js` | port | `lean-mode` | baseline | One `hooks.json`: a SessionStart hook prints the ruleset as additionalContext (shell or static file, no node), with no per-prompt tracker or flag file. Fixed "full" level. Keep the MIT credit. Inject into subagents only if testing shows CLAUDE.md-style context doesn't reach them. Alternative: put it in user CLAUDE.md and ship nothing. |
| ponytail-review, ponytail-audit | `skills/ponytail-review`, `skills/ponytail-audit` | skip | | | /code-review covers them. ponytail-review's "judge scale against the repo's stated load" line could feed a /code-review note. |
| ponytail-debt | `skills/ponytail-debt` | skip | | | Collects `shortcut:` comments into PONYTAIL-DEBT.md; a grep does the same. |
| ponytail-gain, ponytail-help | `skills/` | skip | | | Benchmark scoreboard and command reference. |
| band mod | `hooks/band/register.tsx` | skip | | | Cost/token band plus CSV ledger. Useful only as a mod-authoring example (`docs/3rd-party/README.md` already lists it). |
| mode-tracker hook | `hooks/ponytail-mode-tracker.js` | skip | | | Runs node on every prompt just to switch levels. |

### taste-skill (MIT, leonxlnx)

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| taste-skill v2 (`design-taste-frontend`) | `skills/taste-skill/` | port | `frontend-taste` | none (or new:web-meta) | 4.9k w SKILL + 9 references, an 8-file JSON library and node scripts (`draw.mjs`, `inspect.mjs`, `assets.mjs`, `lint.mjs`). 1.8 MB. Needs Node 22+ and a Chromium. Concrete and testable, with blind-test learnings and a scoped description ("Not for dashboards or app screens"). Trim the description, which is long. Overlaps Anthropic `frontend-design`, so keep one (see questions). |
| redesign-skill | `skills/redesign-skill` | merge | -> `frontend-taste` (as a reference) | | 2.4k w audit checklist. Some taste rules ("Inter everywhere -> Geist/Satoshi") are opinion. Keep the audit-of-existing-UI flow only. |
| output-skill (`full-output-enforcement`) | `skills/output-skill` | skip | | | Anti-truncation prompt; current models don't need it, and it fights concise output. |
| gpt-tasteskill, soft-skill, minimalist-skill, brutalist-skill | `skills/` | skip | | | Style variants; the v2 direction library supersedes them. gpt-taste is tuned for GPT/Codex. |
| image-to-code-skill, imagegen-frontend-web, imagegen-frontend-mobile, brandkit | `skills/` | skip | | | 3k-6.5k w each. Need an image-generation tool and are written for Codex. |
| stitch-skill | `skills/stitch-skill` | skip | | | Google Stitch only. |
| taste-skill-v1, taste-skill-v2-experimental | `skills/` | skip | | | Legacy compatibility copies (v2-experimental is 13k words). |

### humanizer, anti-ai-slop-writing, avoid-ai-writing

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| avoid-ai-writing | upstream `conorbronsdon/avoid-ai-writing` (`plugins/avoid-ai-writing`) | cross-dep | `avoid-ai-writing@conorbronsdon-skills` | none (direct user-scope install) | Single-skill plugin, MIT, 3.38.0, maintained. A meta dependency needs `conorbronsdon-skills` added to `allowCrossMarketplaceDependenciesOn`; a direct install needs nothing. Assessed from the local 3.36.0 copy. |
| humanizer | `humanizer/SKILL.md` | merge | -> `avoid-ai-writing` | | Same job, same size. Keep as the fallback winner. |
| anti-ai-slop-writing | `anti-ai-slop-writing/skills/anti-ai-slop-writing` | skip | | | No license file, stale, crude rules. |

### claude-code-best-practice (MIT)

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes |
|---|---|---|---|---|---|
| agent-browser skill | `.claude/skills/agent-browser` | skip | | | Wraps Vercel's `agent-browser` CLI; claude-in-chrome and playwright cover it. |
| All other skills and agents | see section 3 | skip | | | Demos and repo-maintenance agents. |

## 3. Skipped bulk categories

- **claude-code-best-practice, 28 items, all skip.**
  - Weather and time demo skills and agents (8: weather-*, time-*, both copies). These are teaching toys.
  - Presentation agents and skills (6). They edit the repo's own slide decks.
  - workflow-*-agent docs-drift researchers (5) and development-workflows-research-agent (1). Repo-specific.
  - RPI workflow agents (8). Thin (59-99 words) or generic personas such as a CTO advisor or a constitutional validator; built-in Plan and Explore cover them.
  - The guides (`best-practice/claude-skills.md`, `claude-settings.md`, the subagent frontmatter tables) are worth reading when updating the repo-local authoring skills, not shipping.
- **agent-skills, 13 skills plus the commands and hooks, skip:**
  - Covered by built-ins, Plan, Context7 or other ports (5): source-driven-development (Context7's own server instructions already demand doc lookups), spec-driven-development, idea-refine, incremental-implementation, using-agent-skills (router).
  - Generic or out of scope (8): ci-cd-and-automation, git-workflow-and-versioning, shipping-and-launch, frontend-ui-engineering, browser-testing-with-devtools (needs the chrome-devtools MCP), context-engineering, constraint-driven-development (3.5k w process).
  - The 9 slash commands only wrap the skills. The 4 shell hooks are not wired by any `hooks.json`.
- **mattpocock, 21 skips:** shown as grouped rows above (suite plumbing, thin wrappers, beta writing skills, author-specific misc).

## 4. Open questions for the user

1. **Baseline membership.** `handoff` is user-invoked, so it costs nothing per turn and is a safe pick. `lean-mode` (ponytail core) injects about 600 words every session. Should it go in baseline, or in your user CLAUDE.md with no plugin? Should `grill` (about 40 words of description) go in baseline too?
2. **ponytail.** Uninstall the upstream plugin once `lean-mode` (or the CLAUDE.md paste) is in place? Do you want the cost band? If so, it deserves its own focused mod plugin rather than coming bundled.
3. **avoid-ai-writing.** Make it a cross-dep of a meta (this requires adding `conorbronsdon-skills` to `allowCrossMarketplaceDependenciesOn`), or keep it as a plain user-scope install? I recommend the plain install.
4. **Frontend design.** Port `frontend-taste`, or keep Anthropic's `frontend-design`? Running both doubles the triggers on "build a landing page". Is a `web-meta` worth creating for frontend-taste, web-perf-auditor and prototype's UI branch?
5. **Tracker skills.** Do you want `to-tickets` built around GitHub issues, and is `triage` or `wayfinder` worth porting for your solo repos?
