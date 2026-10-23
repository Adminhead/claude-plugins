# G9 review: thinking, process, docs and planning skills (33 plugins)

Scope: adr-writing catchup codebase-design cold-read config-audit debloat deprecation-migration docs-audit domain-modeling doubt-review experiment-loop handoff leakage-audit macrothink modernize necromancy planning poka-yoke prism problem-solving prototype prove recommend-plugins reorder research second-opinion session-retro setup-wizard ssot-consolidate the-fool v0-restart v0-rewrite vet.

Checks run: `python3 scripts/plugins.py check` passed. `claude plugin validate` and `validate --strict` passed on the spot-checked plugins (claude 2.1.309). `bash plugins/setup-wizard/skills/setup-wizard/tests/template.spec.sh`: all passed. necromancy unittest: 39 OK. docs-audit tests: 6/6 under a minimal pytest shim. **pytest is not installed**, so `adr-writing/skills/adr-writing/tests/test_new_adr.py` (24 fixture-based tests) did not run. All plugin names in recommend-plugins match `ls plugins/` and `.claude-plugin/marketplace.json` (257 = 257), and every sibling a group skill names exists in `plugins/`.

## Summary

- **[high] Cross-plugin "not-<sibling>" graders can never fail.** `claude plugin eval` loads only the plugin under test ("No … other plugins", `.claude/skills/skill-evals/references/cli.md:132`). So these graders forbid a skill that is never present: `experiment-loop/evals/experiment-loop-vs-problem-solving/graders/not-problem-solving.md`, `prototype/evals/prototype-vs-planning/graders/not-planning.md`, `research/evals/trigger-research-1/graders/not-problem-solving.md`, and `problem-solving/evals/*/graders/not-coding.md` (3 cases). They pass every time and say nothing about which skill wins a boundary. With no current suite able to measure mis-routing, which is this group's main risk, the gap is high severity. Real pairwise boundaries need one scratch plugin that holds all the competing skills (proposal under Cross-group notes).
- **[high] The three most-named neighbours have zero evals.** `docs-audit` is the named owner in hard negatives of cold-read, ssot-consolidate and v0-rewrite. `planning` is in programming-core and named by 8 group skills. `modernize` competes directly with deprecation-migration. codebase-design, poka-yoke, domain-modeling, config-audit and second-opinion also have none. In total, **19 of 33 plugins have no eval**: 11 of them are manual, and 8 are model-invocable.
- **[high] Three-way description collision on "copies of a fact disagree".**
  - `v0-rewrite` claims "when related docs have drifted apart" (`v0-rewrite/skills/v0-rewrite/SKILL.md:3`).
  - `ssot-consolidate` claims "the copies disagree" (`ssot-consolidate/skills/ssot-consolidate/SKILL.md:3`).
  - `docs-audit` claims "assigning doc roles so each fact has one owner" (`docs-audit/skills/docs-audit/SKILL.md:12`, and `references/doc-roles.md:5,14`).

  No eval pins this boundary.
- **[med] Other description-level collisions that no eval covers:**
  - modernize "plan the migration / how do we get off this stack" vs deprecation-migration "migrate users off the legacy service".
  - poka-yoke "designing an interface … hard to misuse" vs codebase-design "designing or improving a module's interface".
  - catchup "what does this term mean in the plan?" vs domain-modeling "discussing codebase terminology".
  - planning "grill me" plus `references/stress-test.md:3` "plan, design, or idea" vs the-fool "test my assumptions", while the-fool (`SKILL.md:17`) sends plans to planning.
  - doubt-review "am I sure this is safe" vs the-fool "what could go wrong" vs second-opinion "risky changes".
- **[med] 11 of 33 are manual-only (`disable-model-invocation: true`):** debloat, handoff, macrothink, necromancy, prism, prove, recommend-plugins, reorder, session-retro, setup-wizard, v0-restart. Their descriptions are not in the model's listing, so a model-invocable sibling picks up their phrasing instead:
  - "tighten this" goes to v0-rewrite.
  - "start over from v0" goes to v0-rewrite (same name stem) or modernize.
  - "why did that session go badly" goes to catchup.
  - "prove it / source?" goes to research.
  - "am I tunnel-visioned" goes to the-fool.

  Only `v0-rewrite-quiet-debloat` and the two catchup negatives guard this. Every model-invocable sibling needs a quiet case on its manual neighbour's phrasing.
- **[med] No outcome evals exist anywhere in the group.** All 43 cases are routing. The group's core rules are read-only-until-approved, move-only, never load the raw transcript, and fresh subagent with no intent. Each can be checked for free with `tool_used … max: 0` or `regex` graders, and none is tested. Manual commands can still get outcome evals through a slash-command prompt.
- **[med] recommend-plugins misclassifies bundles and duplicate LSPs.**
  - It sorts "Core bundles (`*-core`…)" by name (`recommend-plugins/skills/recommend-plugins/SKILL.md:30`). But `ef-core` and `aspnet-core` are focused plugins, and the category field it already reads at `:22` (`bundle`) is the reliable test.
  - The duplicate-LSP rule (`:40`) exempts only jdtls-lsp. dotnet-meta depends on `csharp-lsp@claude-plugins-official`, so an installed csharp-lsp would be flagged as a "duplicate" of itself.

  No stale plugin names were found.
- **[med] Evals blocked by dependencies.** `vet` (`plugin-vetter`) and `second-opinion` (`consult`) declare `dependencies`, and the eval sandbox drops the plugin as `dependency-unsatisfied` (`docs/research/evals-2026-10-21.md:7`). Today vet's suite runs only on a hand-made copy. second-opinion cannot get a suite until a script strips `dependencies` into a temp copy.
- **[low] Systemic eval hygiene.**
  - Every case commits `runs: 1`, which the skill-evals checklist rejects.
  - `adr-trigger` and `problem-solving-flaky` have no `model` pin.
  - Tags are mixed: positives are tagged `[trigger]` in doubt-review, the-fool, deprecation-migration and problem-solving, but `[routing]` elsewhere, so `--tag routing` skips them.
  - Three "hard negatives" are trivial rather than near-misses: `doubt-quiet-prettier`, `fool-quiet-format`, `depr-quiet-darkmode`.
- **[low] Four SKILL.md descriptions are invalid strict YAML** because of an unquoted `: `: `catchup:3`, `deprecation-migration:3`, `necromancy:3`, `the-fool:3`. The engine tolerates them (validate passes, evals fire), but PyYAML and Agent Skills validators do not. `scripts/plugins.py:289` checks only eval frontmatter. Extend that check to SKILL.md or quote the values.

### Confusion matrix (likely collisions)

The Owner column names the plugin that should win. "(m)" marks a manual-only owner that the model cannot invoke.

| # | User intent (example phrasing) | Owner | Likely thief(s) | Pinned today? |
|---|---|---|---|---|
| 1 | "Adversarially review my decision to cache sessions in an LRU before we ship" | doubt-review | the-fool, second-opinion | no (`cold-read-quiet-doubt` guards cold-read only) |
| 2 | "Play devil's advocate on rewriting the monolith in Go" | the-fool | doubt-review, modernize, planning | no |
| 3 | "Have codex look at this auth diff" | second-opinion | doubt-review, `/code-review` | no |
| 4 | "Grill me on this rollout plan" | planning | the-fool | no |
| 5 | "Would a new hire follow this README?" | cold-read | docs-audit, v0-rewrite | partial (cold-read side only) |
| 6 | "README and runbook give different timeouts, fix it" | ssot-consolidate | v0-rewrite, docs-audit | partial (`ssot-quiet-docs` is drift-from-CLI, not this) |
| 7 | "This design doc is a pile of patches, clean it up" | v0-rewrite | docs-audit ("restructure docs"), debloat (m) | partial |
| 8 | "Reorder CONTRIBUTING's sections by workflow" | reorder (m) | v0-rewrite, docs-audit | no |
| 9 | "Start this feature over, keep only the API contract and tests" | v0-restart (m) | v0-rewrite, modernize, planning | no |
| 10 | "Plan how we get off AngularJS" | modernize | deprecation-migration, planning | no |
| 11 | "Move the 40 internal callers off the legacy billing service, then turn it off" | deprecation-migration | modernize, planning | no |
| 12 | "/reports got 10x slower after Tuesday's deploy" | problem-solving | experiment-loop | no (reverse direction only, and its grader is a no-op) |
| 13 | "Which algorithm for top-k over a 10M-event stream with 50MB?" | problem-solving | research | no |
| 14 | "Is this repo worth adding to our marketplace?" | vet | research | yes (`vet-quiet-research`) |
| 15 | "Is our grader leaky, since the same model writes and scores?" | leakage-audit | the-fool (evidence audit), experiment-loop | partial |
| 16 | "What does 'carve' mean in the plan?" | catchup | domain-modeling | no |
| 17 | "Should 'account' mean the login or the billing entity? Settle it" | domain-modeling | catchup, codebase-design | no |
| 18 | "Why did yesterday's session go so badly?" | session-retro (m) | catchup | no |
| 19 | "Design the refund API so nobody can refund an unpaid order" | poka-yoke | codebase-design | no |
| 20 | "This OrderService is a pass-through, deepen it" | codebase-design | poka-yoke, coding | no |
| 21 | "Record that we picked SQLite" | adr-writing | domain-modeling (writes ADRs itself, `domain-modeling/SKILL.md:20`) | no |
| 22 | "Mock three different layouts for the settings page" | prototype | codebase-design design-it-twice | no |
| 23 | "My setup has too many skills, clean it up" | config-audit | session-retro (m), recommend-plugins (m), agent-config-audit | no |
| 24 | "What adminhead plugins fit this Go repo?" | recommend-plugins (m) | vet, config-audit | no |
| 25 | "Am I tunnel-visioned on this approach?" | macrothink (m) | the-fool | no |
| 26 | "Look at this plan through security, cost and readability" | prism (m) | the-fool, second-opinion | no |
| 27 | "Source? Did you make that up?" | prove (m) | research, doubt-review | no |
| 28 | "Fresh-eyes read before I hand this off" | cold-read | handoff (m) | yes (`cold-read-handoff`) |
| 29 | "Recover the crashed session" | necromancy (m) | catchup | yes |

## Per-plugin findings

### adr-writing
- [low] Unit tests need pytest, which this environment lacks. `skills/adr-writing/tests/test_new_adr.py:11` imports pytest and uses fixtures. Note the requirement in the skill or the CI docs.
- [low] domain-modeling also writes ADRs with its own fallback format (`domain-modeling/SKILL.md:20`). The boundary is stated but untested.

Evals now: 1 positive (`adr-trigger`, no `model` pin), 0 negatives, 0 outcome.

Suggested evals:
- `adr-quiet-glossary` (hard negative vs domain-modeling): "We keep saying 'tenant' and 'workspace' interchangeably. Pick one and write it down for the team."
- `adr-quiet-plan` (hard negative vs planning): "Write the implementation plan for moving the job queue to SQLite."
- `adr-supersede` (outcome, scaffold with `docs/adr/0003-use-postgres.md`): "We're replacing ADR 3 with SQLite, record it." Graders: `tool_used Bash input_match new_adr.py.*--supersedes`, and a regex on the new file for `Proposed; supersedes \[0003\]`. The old file must be unchanged: regex on it with `match: not_contains` for `Superseded by`.

### catchup
- [med] The description phrase "what does this term mean in the plan?" (`SKILL.md:3`) overlaps domain-modeling. Add "Not for deciding what a term should mean (domain-modeling)".
- [low] Its YAML is invalid under a strict parser (`SKILL.md:3`, unquoted `: `).

Evals now: 2 positive, 2 hard negative (handoff, necromancy). Good. Negatives are `[trigger]` while positives are `[routing]`.

Suggested evals:
- `catchup-quiet-retro` (hard negative vs session-retro (m)): "Why did yesterday's agent session waste so many calls? I want fixes for next time."
- `catchup-quiet-glossary` (hard negative vs domain-modeling): "Help me decide whether 'order' and 'purchase' should be one concept, and add it to GLOSSARY.md."
- `catchup-readonly` (outcome): use the away prompt with a scaffolded git repo, then grade `tool_used Edit|Write max 0, arm: both` plus a regex for `Needs you`.

### codebase-design
- [med] The description is broad ("making code more testable or AI-navigable", `SKILL.md:3`) and claims interface design that poka-yoke also claims. It has no "Not for" line pointing to poka-yoke (misuse-proofing), coding or unit-testing (`:12` lists only domain-modeling, adr-writing and api-rest-design).
- [low] The architecture review depends on the codebase-memory MCP (`:56`) and has no fallback.

Evals now: none.

Suggested evals:
- `cd-deepen` (positive): "OrderService just forwards to five repos and every test mocks all five. How should this module be reshaped?"
- `cd-arch-review` (positive): "Find refactor candidates in this codebase's architecture."
- `cd-quiet-pokayoke` (hard negative vs poka-yoke): "We've had three incidents where amount_cents and amount_dollars got swapped. Make that impossible."
- `cd-quiet-coding` (hard negative vs coding): "Add a `limit` param to listOrders."

### cold-read
Nothing new to report. Its boundaries are clear (`SKILL.md:12-15`).

Evals now: 2 positive, 2 hard negative (docs-audit, doubt-review).

Suggested evals:
- `cold-read-quiet-v0` (hard negative vs v0-rewrite): "Clean this doc up after five rounds of edits."
- `cold-read-subagent` (outcome): use the design-doc prompt with `allowed_tools` including Agent. Grade `tool_used Agent min 1`, plus a regex on `trace` that the Agent prompt does not contain the private intent line.

### config-audit
- [low] plugin.json lists verdicts "keep, improve, retire or merge" and omits **Update**, which the skill has (`SKILL.md:32`).
- [low] There is no "Not for" pointer to session-retro (manual) or recommend-plugins (manual).

Evals now: none.

Suggested evals:
- `ca-bloat` (positive): "I have ~60 skills and 9 MCP servers and /context is mostly tool schemas. What should go?"
- `ca-quiet-security` (hard negative vs agent-config-audit): "Check my .claude/settings.json and hooks for anything that could exfiltrate secrets."
- `ca-quiet-recommend` (hard negative vs recommend-plugins): "Which plugins should I add for this Rust repo?"
- `ca-no-delete` (outcome): scaffold a `~/.claude`-like dir, then grade `tool_used Bash input_match '\brm\b' max 0`.

### debloat (manual)
- [low] It points to `avoid-ai-writing` (`SKILL.md:17`), an upstream plugin that is not in adminhead, without "if installed".

Evals now: none. Routing is not applicable.

Suggested evals:
- `debloat-keeps-rules` (outcome, slash prompt `/debloat` with a 3-paragraph policy containing 4 numbered MUST rules). Graders: regex `count:4` for `MUST` on the last message, and an llm rubric "every rule present, shorter".

### deprecation-migration
- [med] It collides with modernize on "migrate off legacy" (`SKILL.md:3` vs `modernize/SKILL.md:3`) and has no "Not for" line naming modernize.
- [low] Its YAML is invalid under a strict parser (`SKILL.md:3`).

Evals now: 2 positive, 1 trivial negative (dark mode).

Suggested evals:
- `depr-quiet-modernize` (hard negative vs modernize): "Our app is on AngularJS 1.8 and Node 14. Plan how we get onto a supported stack."
- `depr-quiet-plan` (hard negative vs planning): "Plan the implementation of CSV export for reports."
- Replace `depr-quiet-darkmode` with `depr-quiet-dropcolumn-dev`: "Drop the unused `legacy_flag` column from my local dev SQLite."

### docs-audit
- [med] `SKILL.md:12` claims "assigning doc roles so each fact has one owner". That is ssot-consolidate's job, and ssot names docs-audit as not-for, but the reverse pointer is missing. Add "Not for consolidating one scattered fact (ssot-consolidate) or rewriting a drifted doc as v0 (v0-rewrite)".
- [low] The description's "or to restructure docs" invites v0-rewrite and reorder requests.

Evals now: none, although 3 siblings route to it.

Suggested evals:
- `da-stale-readme` (positive): "We renamed --out to --output and dropped DATABASE_URL last sprint. Are the README and .env.example still right?"
- `da-quiet-ssot` (hard negative vs ssot-consolidate): "The retry count is in three docs with three values. Give it one home."
- `da-quiet-coldread` (hard negative vs cold-read): "Would a stranger follow docs/setup.md?"
- `da-readonly` (outcome, scaffold repo with drift). Graders: `tool_used Edit max 0, arm: both`, `tool_used Bash input_match docs_drift.py min 1`, and regex `P[0-3]:`.

### domain-modeling
- [med] It overlaps catchup on term questions, and its "Not for" line (`SKILL.md:10`) does not name catchup.

Evals now: none.

Suggested evals:
- `dm-overloaded` (positive): "'Account' means the login in auth and the billing entity in invoices. Help us split it."
- `dm-quiet-catchup` (hard negative vs catchup): "I was out a week. What new terms did the team coin in docs/plans?"
- `dm-quiet-adr` (hard negative vs adr-writing): "Record the decision to use SQLite as an ADR."

### doubt-review
- [med] Its description overlaps the-fool and second-opinion. The body boundaries (`SKILL.md:14-16`) are good but are not in the description, which is what routes. Add "Not for idea-level devil's advocate (the-fool) or another model family (second-opinion)" to the description.

Evals now: 2 positive, 1 trivial negative (prettier).

Suggested evals:
- `doubt-quiet-fool` (hard negative vs the-fool): "Play devil's advocate: should our startup go all-in on a mobile app?"
- `doubt-quiet-second` (hard negative vs second-opinion): "Get GPT's opinion on this auth diff."
- `doubt-no-claim` (outcome, allow Agent). Graders: regex on `trace` for the Agent prompt containing `Adversarial review`, and the same with `match: not_contains` for `CLAIM:`.

### experiment-loop
- No content issues found.

Evals now: 1 positive. Its `not-problem-solving` grader is a no-op.

Suggested evals:
- `el-quiet-regression` (hard negative vs problem-solving): "p95 doubled after yesterday's deploy, find out why."
- `el-quiet-loop` (hard negative vs the /loop builtin): "Check the deploy every 5 minutes."
- `el-no-reset` (outcome, scaffold git repo + bench script, `--allow-tools Bash Edit`). Graders: `tool_used Bash input_match 'reset --hard' max 0`, and `tool_order` with `git switch -c` before the first `git commit`.

### handoff (manual)
- `claude --bg/--name`, `agents`, `attach`, `logs` and `stop` all verified against claude 2.1.309 help.

Evals now: none.

Suggested evals:
- `handoff-redacts` (outcome, slash `/handoff` after a seeded history file containing `sk-ant-…`). Grader: regex `match: not_contains` for `sk-ant-` on the written file's `trace`.

### leakage-audit
- [low] "Writing or running evals: not this skill" (`SKILL.md:14`) names no owner. skill-evals is a repo-local `.claude/skills` skill, not a plugin.

Evals now: 2 positive, 2 hard negative.

Suggested evals:
- `la-quiet-loop` (hard negative vs experiment-loop): "Set up a loop that keeps commits only when `make bench` improves."
- `la-names-pattern` (outcome): use the same-model grader prompt with a regex for `Shared hallucination|Tautology|Verifier is designer`.

### macrothink (manual)
- No content issues found.

Evals now: none.

Suggested evals:
- `macro-divergence-first` (outcome, slash prompt with a seeded decision, allow Agent). Graders: `tool_used Agent min 2`, and regex `match: not_contains` for `consensus|verified|proved`.

### modernize
- [med] Description collision with deprecation-migration. The body's "Not for" (`SKILL.md:12`) omits deprecation-migration.

Evals now: none.

Suggested evals:
- `mod-angularjs` (positive): "We're on AngularJS 1.8, Node 14 and a dead Bower mirror. How do we get off this stack?"
- `mod-quiet-depr` (hard negative vs deprecation-migration): "We're sunsetting /v1 with 200 external consumers. Plan the deprecation."
- `mod-quiet-planning` (hard negative vs planning): "Plan adding SSO to our Rails app."
- `mod-quiet-v0restart` (hard negative vs v0-restart): "Our prototype is a mess. Plan a restart keeping only the API contract and tests."

### necromancy (manual)
- [low] The description has "Use for …" triggers (`SKILL.md:3`) that cannot fire because the skill is manual. They are harmless but misleading.
- [low] Its YAML is invalid under a strict parser.
- Script: masks secrets and writes 0600. 39 tests pass.

Evals now: none.

Suggested evals:
- `necro-no-raw` (outcome, slash prompt with a scaffolded `CLAUDE_CONFIG_DIR` transcript). Grader: `tool_used Read input_match '\.jsonl"' max 0`.

### planning
- [med] "grill me" in the description, plus `references/stress-test.md:3` "plan, design, or idea", contradicts the-fool's boundary (`the-fool/SKILL.md:16-17`: ideas go to the-fool, plans to planning). Narrow stress-test to plans and designs, or add "an idea or strategy goes to the-fool".

Evals now: none.

Suggested evals:
- `plan-slices` (positive): "Plan adding org-level SSO across api, web and worker. It touches auth and migrations."
- `plan-grill` (positive): "Grill me on this rollout plan before I start." (with the plan inline)
- `plan-quiet-fool` (hard negative vs the-fool): "Play devil's advocate on whether we should enter the EU market."
- `plan-quiet-modernize` (hard negative vs modernize): "How do we get off Python 2.7 and Django 1.11?"
- `plan-quiet-implement` (hard negative vs implement-plan): "Implement docs/plans/sso.md."

### poka-yoke
- [med] Interface-design overlap with codebase-design. `SKILL.md:8` names second-opinion, language skills and db-schema-design, but not codebase-design.

Evals now: none.

Suggested evals:
- `py-incident` (positive): "Second time someone ran the purge job against prod with the default scope. Make that impossible, then find similar spots."
- `py-quiet-codebase` (hard negative vs codebase-design): "This module's interface is as big as its implementation. Deepen it."
- `py-quiet-review` (hard negative vs /code-review): "Find bugs in this diff."

### prism (manual)
- No content issues found.

Evals now: none.

Suggested evals:
- `prism-one-question` (outcome, slash prompt with a short plan). Graders: an llm rubric "one resolving question; no averaging; 2-5 lenses", and regex `match: not_contains` for `average`.

### problem-solving
- No content issues found. The 4 not-coding graders across its 3 cases are no-ops in single-plugin runs.
- [low] `problem-solving-flaky` has no `model` pin.

Evals now: 3 positive, 0 effective negatives.

Suggested evals:
- `ps-quiet-experiment` (hard negative vs experiment-loop): "Try optimizations one at a time on a branch until `make bench` is under 400ns. Run 15 without asking."
- `ps-quiet-research` (hard negative vs research): "Compare Temporal vs Inngest for durable workflows."
- `ps-algo` (positive, algorithm branch): "Top-k over 10M events/day with 50MB of memory. What approach?"
- `ps-signal-first` (outcome): grade with `tool_order` that Bash runs before any Edit.

### prototype
- No content issues found. `not-planning` is a no-op grader.

Evals now: 1 positive.

Suggested evals:
- `proto-ui-variants` (positive): "Show me three very different layouts for the billing settings page I can flip between."
- `proto-quiet-design` (hard negative vs codebase-design design-it-twice): "Design this module's interface two radically different ways and compare."
- `proto-quiet-prod` (hard negative vs react / web-development): "Build the production settings page with tests."

### prove (manual)
- [med] `SKILL.md:14`, "The trigger is a feeling, not a request: when you are about to assert a checkable fact … check it before writing it", tells the model to self-invoke. But `:5` sets `disable-model-invocation: true`, so the model can never act on it. Drop the line or make the skill model-invocable.

Evals now: none.

Suggested evals:
- `prove-verdicts` (outcome, slash `/prove` with a seeded passage holding 1 true repo fact and 1 false one). Graders: regex `Confirmed` count ≥1, regex `Wrong` count ≥1, and an llm rubric that the false one is marked Wrong.

### recommend-plugins (manual)
- [med] `SKILL.md:30` classifies core bundles by the `*-core` name. `ef-core` and `aspnet-core` are focused plugins (marketplace `category` ≠ `bundle`). Use `category == "bundle"`, which step 2 (`:22`) already reads.
- [med] `SKILL.md:40`: dotnet-meta depends on `csharp-lsp@claude-plugins-official`, the same shape as java-meta's jdtls-lsp. Only jdtls is exempted, so an installed csharp-lsp would be flagged as a duplicate of the meta's own dependency. Generalize the rule: an official LSP that is itself a dependency of a proposed meta is not a duplicate.
- [low] `SKILL.md:121` gives add commands for claude-code-lsps and gradle-skills but not `claude-plugins-official`. That marketplace is needed by programming-core (context7), dotnet-meta and java-meta.
- Names: every adminhead plugin named (aspire, aspnet-core, aws-meta, blazor, devenv, dotnet-meta, ef-core, forgejo-meta, github-meta, godot-*, java-meta, mise, orchestration(-meta), play-framework, sbt, scala(-meta), spring-boot(-testing), tilt, baseline) is in `marketplace.json`. The upstream names match `examples/claude-settings/settings.global.json` and `docs/plans/plugin-adoption.md:31`.

Evals now: none.

Suggested evals:
- `rp-no-marketplace` (outcome; the sandbox has no adminhead marketplace, slash `/recommend-plugins`). Graders: regex `claude plugin marketplace add Adminhead/claude-plugins`, and `tool_used Bash input_match 'plugin install' max 0`.
- `rp-dotnet` (outcome, with a fixture `marketplace.json` reachable through `context.add_dirs` if feasible): a scaffold with an EF Core csproj. Assert `ef-core` is proposed as focused, not as a bundle.

### reorder (manual)
- No content issues found.

Evals now: none.

Suggested evals:
- `reorder-move-only` (outcome, slash with a 12-item list). Graders: one regex per item (12 `count:1` checks), plus llm "one nameable principle".

### research
- [low] `trigger-research-1` (SQLite STRICT) is a one-fact question Claude answers alone, so it is a weak positive. Its `not-problem-solving` grader is a no-op.

Evals now: 1 positive.

Suggested evals:
- `research-compare` (positive): "We need a job queue for a Node service. Compare BullMQ, Graphile Worker and pg-boss for our constraints."
- `research-quiet-vet` (hard negative vs vet): "Is github.com/x/agent-hooks worth adding to our marketplace?"
- `research-quiet-prove` (hard negative vs prove (m)): "You said Node 22 removed `punycode`. Source? Did you make that up?" Arguably research may fire; decide the intended owner and pin it.
- `research-quiet-deps` (hard negative vs dependency-vetting): "Is the npm package left-padx safe to add?"

### second-opinion
- [med] It cannot be evaluated as is: `dependencies: ["consult"]` (`plugin.json`) gets the plugin dropped in the sandbox.
- [low] The model and effort matrix (`SKILL.md:30-36`) is self-dated "October 2026" and points to `codex debug models` / `agy models` for refresh. That is acceptable, but unverifiable here.
- The consult timeout default 480 / max 540 matches `consult/hooks/consult/consult.ts:11` and `appserver.ts:7`.

Evals now: none.

Suggested evals (run on a deps-stripped copy, with `--mocks` for consult):
- `so-codex-diff` (positive): "Get an outside model to check this auth middleware diff before I merge."
- `so-quiet-doubt` (hard negative vs doubt-review): "Fresh-context, adversarially review my claim that this retry wrapper is idempotent."
- `so-split-pass` (outcome): a scaffolded 1,200-line diff. Grade `tool_used mcp__consult__consult min 2`, and that no input has `timeoutSec` > 540.

### session-retro (manual)
- [low] The description says "Use when the user asks for a retro" (`SKILL.md:3`) while the skill is manual (`:4`). The phrasing is inert.
- The transcripts reference is dated 2026-10-17 and is consistent.

Evals now: none.

Suggested evals:
- `retro-evidence` (outcome, slash with a seeded transcript via scaffold). Graders: llm "each proposal quotes evidence; ranked; no edits", and `tool_used Edit max 0`.

### setup-wizard (manual)
- [med] GitHub-only. Scoping reads only `.github/workflows/*` (`SKILL.md:24`), and `set_secret`/`set_var` call `gh` (`template.sh:222-250`). The marketplace ships forgejo-meta. On a Forgejo remote, every secret lands in SKIPPED with a misleading "gh not ready" message. Either scope `.forgejo/workflows` and state the limit, or detect a non-GitHub remote and say so.
- [low] `_check_name` (`template.sh:54-60`) allows lowercase names. A key that collides with a helper's local variable (`input`, `current`, `key`, `value`, `name`, `prompt`) is written into the local and lost silently. Readonly specials (`UID`, `EUID`, `PPID`, `SECONDS`, `RANDOM`) abort with a cryptic error. Reserve them or require uppercase.
- [low] `write_env` rewrites `.env` with `cat "$_TMP" > "$ENV_FILE"` (`template.sh:212`), which is not atomic. A Ctrl-C mid-write can truncate `.env`. Use `mv` with the mode copied.

Evals now: none. The `tests/template.spec.sh` unit tests all pass.

Suggested evals:
- `wiz-ci-secret` (outcome, slash; scaffold `.env.example` + `.github/workflows/ci.yml` using `secrets.STRIPE_SECRET_KEY`). Graders: regex on the produced script for `set_secret STRIPE_SECRET_KEY`, `match: not_contains` for `ask STRIPE_SECRET_KEY`, and `tool_used Bash input_match 'bash -n'`.

### ssot-consolidate
- [med] The description collides with v0-rewrite ("related docs have drifted apart") and docs-audit (doc roles). Its own not-for lines are good (`SKILL.md:12-16`).

Evals now: 2 positive, 2 hard negative (docs-audit drift, imports).

Suggested evals:
- `ssot-quiet-v0` (hard negative vs v0-rewrite): "This one runbook has five 'Update:' notes stacked on each other. Rewrite it clean."
- `ssot-approval-gate` (outcome, scaffold 3 docs with conflicting timeouts, allow Edit). Graders: `tool_used Edit max 0` (the skill stops at the report before approval), and regex `canonical`.

### the-fool
- [low] Its YAML is invalid under a strict parser (`SKILL.md:3`).
- The workflow requires AskUserQuestion twice (`:24,31`), which a `-p` eval may not provide. Outcome evals must list it in `allowed_tools`.

Evals now: 2 positive, 1 trivial negative (JSON formatting).

Suggested evals:
- `fool-quiet-doubt` (hard negative vs doubt-review): "Before I commit, cross-examine my claim that this LRU session cache is safe under concurrent logout."
- `fool-quiet-plan` (hard negative vs planning): "Grill me on this 6-slice implementation plan." (plan inline)
- `fool-quiet-leakage` (hard negative vs leakage-audit): "Is our eval leaky? The same model writes the answers and grades them."
- `fool-quiet-threat` (hard negative vs threat-model): "Build a STRIDE threat model of our upload service."

### v0-restart (manual)
- No content issues found. Its name is close to v0-rewrite's, which is the main routing hazard.

Evals now: none.

Suggested evals:
- `v0r-keep-drop` (outcome, slash with a seeded retro note). Grader: llm "explicit keep/drop with evidence, one vertical loop, named first gate".

### v0-rewrite
- [med] The description's "when related docs have drifted apart" (`SKILL.md:3`) claims ssot-consolidate's case. Narrow it to "one doc that accreted edit residue".

Evals now: 2 positive, 3 hard negative (changelog, debloat, docs-audit).

Suggested evals:
- `v0-quiet-ssot` (hard negative vs ssot-consolidate): "The port is 8080 in README, 8000 in the runbook and 8081 in compose docs. Get it to one place."
- `v0-quiet-restart` (hard negative vs v0-restart (m)): "Start this feature over from v0 and keep only the contracts and tests."
- `v0-quiet-reorder` (hard negative vs reorder (m)): "Reorder CONTRIBUTING's sections to follow the workflow; don't change wording."
- `v0-no-residue` (outcome): use the existing design-doc prompt with regex `match: not_contains` for `edit [0-9]|Update \(|TBD` on the last message.

### vet
- [low] It needs the deps-stripped copy for evals (documented in `docs/research/evals-2026-10-21.md:12`). Automate that in a script instead of hand-editing.

Evals now: 2 positive, 4 hard negative. This is the best suite in the group.

Suggested evals:
- `vet-quiet-recommend` (hard negative vs recommend-plugins (m)): "Which adminhead plugins should I install for this Go repo?"
- `vet-ledger-verdict` (outcome, scaffold `docs/README.md` with a ledger). Graders: regex on that file for `\*\*(Adopted|Stole the idea|Watching|Rejected|Not evaluated)\*\*`, and `tool_used Bash input_match 'plugin install' max 0`.

## Cross-group notes

- **Pairwise routing harness (recommended fix for the high item).** Add a generator, for example `scripts/plugins.py routing-bundle --cluster G9 --out <tmp>`. It would copy the model-invocable SKILL.md frontmatter and bodies of a cluster into one throwaway plugin with `dependencies` stripped, and keep the generated plugin out of `plugins/` so the one-component rule is untouched. The confusion-matrix cases above would live there, one per row: `fires-<owner>` plus `not-<thief>` with `min 0 / max 0 / arm: both`, all at 3 runs. That is the only layout where a `not-<sibling>` grader can fail. It also fixes the vet and second-opinion dependency problem. Suggested clusters:
  - review: doubt-review, the-fool, second-opinion, cold-read, leakage-audit
  - docs: v0-rewrite, ssot-consolidate, docs-audit, cold-read, adr-writing, domain-modeling
  - planning: planning, problem-solving, experiment-loop, prototype, modernize, deprecation-migration, codebase-design, poka-yoke, research
  - continuity: catchup, domain-modeling, config-audit, vet
- **Neighbours outside the group with overlapping descriptions:**
  - `debugger` agent vs problem-solving: both do "root-cause diagnosis for failing or flaky tests".
  - `architect` agent vs planning and codebase-design: "choosing between designs".
  - `scribe` agent vs docs-audit: "resyncs docs after a code change".
  - `reviewer` agent and `review-loop` vs doubt-review and second-opinion.
  - `agent-instructions` vs session-retro and config-audit: "turns repeated agent mistakes into checks".
  - `agent-config-audit` vs config-audit.
  - `threat-model` vs the-fool's red-team mode.
  - `git-history` bisect vs problem-solving.
  - `dependency-vetting` and `plugin-vetter` vs vet and research.
  - Group 9 descriptions mostly name these in their bodies, not in the description that routes.
- **Manual-skill shadowing is a design question for the whole repo.** baseline ships 9 manual commands from this group. When a user types their natural-language trigger, an auto skill or nothing answers. Consider adding "(for X, the user runs /Y)" to the auto siblings' descriptions: v0-rewrite → /debloat, /v0-restart, /reorder; catchup → /session-retro; the-fool → /macrothink, /prism; research → /prove.
- **`plugins.py check` should also parse SKILL.md frontmatter with a strict YAML loader.** It currently guards only eval frontmatter (`scripts/plugins.py:289`), and the same bug class already broke 13 eval cases (`docs/research/evals-2026-10-17.md:9`, `evals-2026-10-23.md:9`).
- **Add pytest to the dev or CI environment.** Without it, the adr-writing tests (and the docs-audit tests, except through a shim) silently cannot run.
