# paperthin ports: ten new plugins and four folds

Status: draft, 2026-10-22. Not started; see `## Status` at the end.

Source: [LilMGenius/paperthin](https://github.com/LilMGenius/paperthin) at `7d5dc62` (MIT, Copyright (c) 2026 LilMGenius), checked out under `3rd-party/paperthin`. It is 28 plain-Markdown skills in four folders (`depth/`, `breadth/`, `coil/`, `mesh/`), installed with `npx skills add`. There is no hooks code and no MCP server. All 28 SKILL.md files were read in full for this plan.

## Done when
- Ten new plugins pass `claude plugin validate --strict`, the skill validator and `python3 scripts/plugins.py check`: `cold-read`, `ssot-consolidate`, `v0-rewrite`, `debloat`, `reorder`, `catchup`, `leakage-audit`, `macrothink`, `prism` and `v0-restart`.
- `prove`, `the-fool` and `session-retro` carry the folded rules, each with a minor version bump and a NOTICE that credits paperthin.
- The five model-invoked plugins have trigger evals with hard negatives against the plugin they overlap, and one eval run is recorded in `docs/research/`.
- paperthin is in `docs/3rd-party/README.md` with an overview and a generated catalog, and in the research ledger in `docs/README.md`.
- Every skill that is not ported has its reason in the triage table below.
- Everything is shipped with `ship-plugin`.

## Findings (verified 2026-10-22)
- **Security:** the plugin-vetter pass found no Critical or High issues.
  - It rated `re0-upgrade` NEEDS HUMAN REVIEW. That skill writes SessionStart hooks into `~/.claude/settings.json`, `~/.codex/config.toml` and `opencode.json`. It fetches `catalog.cjs` and `session-check.cjs` from a tag-pinned raw URL without a hash check, runs `npx skills add/update` and offers a consent-gated `gh api -X PUT user/starred/...`.
  - It flagged `autobahn` as a guardrail-routing pattern: carve the risky part out, then run the rest in a fresh subagent that never sees the risky input.
  - There is no hidden unicode, no encoded payload, no `allowed-tools` frontmatter, no `!` execution blocks and no postinstall script.
- **License chain:** paperthin's NOTICE credits mattpocock/skills for vendored blocks without naming any paths. Every line over 60 characters in all 28 SKILL.md files was grepped (`grep -rF`) against `3rd-party/mattpocock`, with zero hits. So the ported text is LilMGenius's own, and one MIT credit is enough.
- **House fit:**
  - Upstream prose is heavy with em-dashes and uses upstream coinages (`re0`, `sip`, `nba`). It also cross-references sibling skills by name (`sip` calls `shower`/`factchk`/`ssotize`/`detool`/`re0`, and `debloat` defers to `ssotize`/`re0`).
  - Upstream edit-safety rules assume Python scripts (`PYTHONUTF8=1`). Our skills edit with the Edit tool.
- **Overlap evidence:**
  - `avoid-ai-writing` (conorbronsdon-skills 3.38.0, installed) already handles em-dashes.
  - `git-commit` already says "the diff already shows what changed" (`plugins/git-commit/skills/git-commit/SKILL.md:62`).
  - `the-fool` has Socratic, dialectic, pre-mortem, red-team and evidence-audit modes.
  - `doubt-review` runs fresh-context adversarial review.
  - `prove` checks claims and is manual.
  - `handoff` and `necromancy` write agent-facing briefs.
  - `docs-audit` compares docs against code, and `docs-sync` nudges at Stop.
  - The orchestration agent and agent-router already size coder tiers.
  - The system prompt already tells the model to read ambiguity like a careful colleague and to ask only when readings diverge materially, which is `readchk`'s whole workflow.
- **Repo state:** local `main` equals `origin/main`. The working tree was clean at the start of this session, and this plan is the only new file. `the-fool` and `doubt-review` belong to no meta. baseline currently depends on `git-commit, recommend-plugins, handoff, check-bypass-guard, git-statusline, usage-band, mcp-health, bash-rules, prove, necromancy`.

## Triage (all 28)

| Upstream | Verdict | Target | Reason |
| --- | --- | --- | --- |
| `shower` | **Port** | `cold-read` (model) | Comprehension check by a context-free subagent given only the artifact's contents. doubt-review tries to *disprove* a decision; this asks whether a stranger can follow the artifact. There's no equivalent. |
| `ssotize` | **Port** | `ssot-consolidate` (model) | Audit scattered copies of one fact, get approval, then consolidate. docs-audit checks docs against code, not copies against each other. |
| `re0` | **Port** | `v0-rewrite` (model) | Rewrite a drifted doc as a clean v0 ("what is true now", not "what changed"). Nothing here does this for prose. `simplify` is code-only. |
| `debloat` | **Port** | `debloat` (manual) | Density pass that cuts words but never rules. It differs from avoid-ai-writing (AI tells) and from v0-rewrite (drift). |
| `reorder` | **Port** | `reorder` (manual) | Move items only, under one named principle. Small and cheap as a manual command. |
| `catchup` | **Port** | `catchup` (model) | Human-facing re-entry brief from live state: needs-you, changed, new words. handoff and necromancy write briefs for an agent, not a person. |
| `nba` | **Fold** | into `catchup` | The single next action becomes catchup's optional last line ("Next move"). The two ship as a pair upstream, and a separate skill would duplicate the state read. |
| `mandela` | **Port** | `leakage-audit` (model) | 8-pattern eval-leakage taxonomy. Relevant to `skill-evals`, `experiment-loop` and any A/B work, and nothing covers it. |
| `macrothink` | **Port** | `macrothink` (manual) | Strip the session's framing, fan out 2-5 fresh reads, report divergence first. second-opinion is cross-model review of a diff, not a reframing check. |
| `prism` | **Port** | `prism` (manual) | Split one artifact across 2-5 distinct lenses and return the question that resolves their disagreement. the-fool runs one mode at a time. |
| `factchk` | **Fold** | into `prove` | Add "check both directions: could the absurd be real, the obvious false?" and "flag fiction as a declared choice, don't fix it". prove stays manual. |
| `hate` | **Fold** | into `the-fool` red team | Add the `{root, first_nail}` output contract: one load-bearing objection plus the cheapest falsification. |
| `feynman` | **Fold** | into `the-fool` Socratic | Add "the user explains, the critic never supplies the rationale; narrow on a shallow answer, never repeat". |
| `re0-memo` | **Fold** | into `session-retro` | Add "cluster specific complaints up to the class that catches them; a lesson that fixes one case isn't one". |
| `readchk` | Skip | none | Already the harness system prompt's ambiguity rule. A model-invoked copy would pay listing cost to restate it. |
| `aim` | Skip | none | Same: proposing intent from handed-over data is default behavior. |
| `modelchk` | Skip | none | Advisory tier/effort sizing. agent-router and the orchestration routing table already decide tiers, and a second, neutral-vocabulary scale would conflict. |
| `detool` | Skip | none | Our plugins are Claude Code-specific by design, so portable-across-harnesses prose isn't a goal. |
| `dedash` | Skip | none | avoid-ai-writing already covers em-dashes. |
| `sip` | Skip | none | An auto-firing orchestrator that runs five skills after every change. Too costly as a reflex, and docs-sync plus review-loop already cover the moments it targets. |
| `re0-git` | Skip | none | git-commit and git-history cover message writing and rewording. Its `-S --date=now` rules are upstream house style. |
| `re0-work` | **Port** (user, 2026-10-23) | `v0-restart` (manual) | Controlled restart: keep proven contracts, gates, vocabulary, real-surface tests and the negative corpus, and drop accidental architecture. Nothing else plans a from-scratch restart. Manual, because throwing away built work is the user's call. |
| `re0-loop` | Skip | none | Build-cycle method tied to `.re0/` iteration folders. planning, implement-plan and experiment-loop cover the parts we use. |
| `re0-plan`, `re0-release`, `re0-merge` | Skip | none | Bound to the paperthin repo (`.re0/`, `catalog.cjs`, signed tags, npm publish via CI). |
| `re0-upgrade` | Reject | none | `npx skills` installer that also writes hooks into agent configs and fetches remote scripts. Not applicable to a marketplace, and the vetter flagged it. |
| `autobahn` | Reject (recommendation) | none | See Open question 1. Hiding risky input from the executing subagent so that it "has nothing to refuse" is a guardrail-routing pattern, whatever the ledger. |

Result: 28 upstream skills split three ways:
- 10 ported as new plugins;
- 5 folded: `nba` into the new catchup, and 4 into the existing prove, the-fool (two of them) and session-retro;
- 13 not ported.

## Decisions (defaults taken)
1. **Rewrite, don't vendor.** Each ported skill is rewritten in house style with `skill-authoring`, and every load-bearing upstream rule is kept, listed per plugin under "Keep" below.
   - The rewrite uses no em-dashes and our section order, and it drops cross-references to unported siblings.
   - Edit-safety becomes "report a MISS when the target isn't found; edit per occurrence, never a blanket replace". The `PYTHONUTF8` advice is dropped.
   - Each NOTICE says `Modifications: rewritten` and lists the kept rules, like `plugins/aspire/NOTICE`.
2. **Descriptive names for opaque coinages.** `shower` becomes `cold-read`, `re0` becomes `v0-rewrite`, `ssotize` becomes `ssot-consolidate` and `mandela` becomes `leakage-audit`. Plain words that a stranger can read stay: `debloat`, `reorder`, `catchup`, `macrothink`, `prism`. The NOTICE `Paths:` line maps each new name to its upstream path, and the SKILL.md credit line names the upstream skill.
3. **Invocation follows upstream, with listing cost weighed.**
   - Model-invoked: cold-read, ssot-consolidate, v0-rewrite, catchup and leakage-audit. Each one fires usefully without the user naming it, so each gets trigger evals.
   - Manual (`disable-model-invocation: true`): debloat, reorder, macrothink and prism, for upstream's reasons (an opinionated scope call, or an opt-in fan-out spend).
   - ssot-consolidate keeps upstream's approval gate between the read-only audit and any edit.
4. **Meta placement.**
   - baseline gets the general ones: cold-read, v0-rewrite, debloat, reorder, catchup, macrothink and prism.
   - leakage-audit goes to programming-core, because it is about evals and experiments.
   - ssot-consolidate goes to baseline: scatter happens in any repo's docs, not only in code.
   - Three model-invoked descriptions land in every session's listing (cold-read, v0-rewrite, catchup), plus ssot-consolidate, so the descriptions stay at 60 words or fewer.
5. **Folds are edits to existing plugins.** Each fold gets a minor bump, an `Upstream: https://github.com/LilMGenius/paperthin @ 7d5dc62` line and a `Paths:` line added to the plugin's NOTICE, with the MIT text appended to its LICENSE (or a second LICENSE file), plus a credit line in SKILL.md. Folds don't change any description or invocation, so no eval re-run is needed.
6. **Licensing for new plugins:** each ships upstream's MIT `LICENSE` and a NOTICE with `Upstream: https://github.com/LilMGenius/paperthin @ 7d5dc62`, `Paths:` and `Modifications:`. Root README Acknowledgements gets one row: `[LilMGenius/paperthin](https://github.com/LilMGenius/paperthin) | MIT`.
7. **Execution:**
   - Slices that run `plugins.py new` (S1-S4) run sequentially in the main checkout, because `new` rewrites marketplace.json, the README catalog and the meta files. The fold slice (S5) touches only its own plugins and may run in a worktree once S0 is pushed or committed locally with `worktree.baseRef: head`. Otherwise it also runs in the main checkout.
   - One commit per plugin, staged with explicit paths.
8. **Ledger verdict: "Stole the idea".** The upstream package is not installed. Its parts are adapted into our own plugins (the mapping rule in `harness-toolbox-ports.md` Decision 5).

## Approach per item
Each new skill keeps upstream's Goal/Workflow/Rules/Verification content in our structure. "Keep" lists the rules that must survive the rewrite, and the acceptance step greps for each one in paraphrase.

- **cold-read** (`shower`). Spawn a fresh subagent (`Agent`, general-purpose, no worktree). Hand it the artifact's *contents*, never a path, and never the intent. Tell it not to open the README, docs or neighbouring files. Compare its blind reading against a one-line intent noted privately beforehand. Report the defects ordered by how badly they block a fresh reader, plus a verdict (stands alone / minor gaps / needs work).
  - Keep: never self-assess in the same session; "I had to assume" is a finding; read, don't sweep (no "clean" from a grep); one read by default, several when stakes justify it; diagnose only, the fixes happen in the main session.
  - "Not for": doubt-review (disproving a decision) and docs-audit (docs vs code).
- **ssot-consolidate** (`ssotize`). Workflow:
  1. Name the one fact.
  2. Run a read-only audit with two search methods.
  3. Classify each hit (copy, paraphrase, partial, stale, contradictory).
  4. Pick a canonical home, with a justification.
  5. Report a table of location · kind · action, plus the plan.
  6. Wait for **explicit approval**.
  7. Fold unique details into the canonical home, reconcile contradictions there first, then replace each copy with a reference.

  Keep: an empty result is valid; never decide a contradiction silently; no consolidation across a trust boundary without confirmation; code moves use language-aware tools. "Not for": docs-audit, `agent-instructions`.
- **v0-rewrite** (`re0`). Read the target end to end. Check nearby artifacts that must stay aligned. Remove residue, stale deltas and history, fold lessons into the place they belong, rewrite instead of appending, then re-read and cut again.
  - Keep: a pass that finds nothing changes nothing; "what changed" becomes "what is true now"; no old/new traces unless it is a changelog; repair from the source of truth; surface judgment calls; no new files.
  - "Not for": changelogs, ADRs and plans (an append-only history by design), debloat (density only) and docs-audit.
- **debloat** (manual). Note the load-bearing content per section. Cut padding, needless qualifiers, fused sentences, walls of enumeration and adjacent restatement. Re-read cold.
  - Keep: cut words, never a rule, fact or constraint; teaching prose earns its length; hand duplication to ssot-consolidate and drift to v0-rewrite instead of force-compressing; nothing bloated means no change.
- **reorder** (manual). Name one principle a reader could guess. Cluster kin together, move items only, and keep mirrored copies in the same order.
  - Keep: never reword, add, remove, split or merge; finish a latent order rather than impose a new one; report a MISS for any item that isn't found.
  - Note: the root README catalog is generated (`plugins.py catalog`), so reorder must not edit it.
- **catchup** (`catchup` + `nba`). Read live state only: `git log` since the human's last touch, diffs, plan Status blocks, task lists and file mtimes. Never brief from conversation memory. Write in decision order: **Needs you**, **Changed while you were away** (outcomes, not process), **New words**. Gloss each coined term at first use, and fit it on one screen with drill-down offers.
  - Optional last line **Next move**: one action, why now, done when (from nba). It recommends and never executes, and it names a manual command for the user to run rather than invoking it.
  - Keep: every claim cites a file, commit or path; read-only; "done" means verified.
  - "Not for": handoff (brief for a new agent session) and necromancy (dead-session recovery).
- **leakage-audit** (`mandela`). Name the components (model, scorer, designer, dataset) and ask whether outside ground truth enters independently. Walk the 8 patterns (recall-not-reason, wrong null, shared hallucination, tautology, verifier=designer, shared-pool bias, frame injection, demand characteristics) and report only the ones that fire, each with an independence fix. Read-only.
  - Keep: you can blind the value and still leak the recipe; an optional N=1 fresh-context auditor for high stakes; the self-check (am I the tautology?).
  - "Not for": skill-evals (writing and running evals) and the-fool evidence audit.
- **macrothink** (manual). Name the current direction. Strip the bait (the session's examples, its suggested answer, its naming) down to goal, constraints and facts. Spawn 2-5 fresh subagents (default 3) in one message. Classify each read as divergent-incompatible, divergent-compatible or convergent, cluster shared roots, and report divergence first.
  - Keep: no majority vote or averaging; same-model convergence is reassurance, never proof; advisory only.
  - Cross-model reads go through second-opinion.
- **prism** (manual). Read the artifact. Pick one lens per distinct failure mode (2-5, no default count). Each lens returns a pass/fail/unclear verdict with one load-bearing reason. Group the verdicts as agree, agree for different reasons, or disagree. The output is the one question that would resolve the disagreement.
  - Keep: lenses, not roles; never average; don't manufacture disagreement.
  - Lenses may run inline or as subagents. Inline is the default, because upstream doesn't require isolation.
- **Folds:**
  - **prove:** a "Both directions" rule; "a claim stated as fiction or a declared choice is not checked"; the metacognitive trigger as a note ("about to assert a checkable fact from a feeling").
  - **the-fool, red team:** the output ends with `Root:` (the objection whose failure makes the others moot) and `First nail:` (the cheapest check that could falsify it before the expensive work).
  - **the-fool, Socratic:** never supply the rationale before the user attempts one; on a shallow answer, narrow to the vague part instead of repeating; an honestly unexplained gap is a valid ending and gets flagged on the decision.
  - **session-retro:** a rule under its ranking step: cluster specific complaints into the class of failure before proposing a fix, and keep the specifics as evidence.

## Slices
Every slice uses the same checks and review.
- **Checks:** `python3 scripts/plugins.py check`, `claude plugin validate --strict plugins/<p>` and `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<p>/skills/<p>`.
- **Paperthin checks:** `grep -c '—' plugins/<p>/skills/<p>/SKILL.md` = 0, and a grep for each "Keep" rule.
- **Review:** a reviewer pass on the slice diff before commit, with acceptance being "every Keep rule present, no upstream coinage left (`re0`, `sip`, `nba`, `shower`, `ssotize`, `mandela`) outside NOTICE and the credit line".

### S0. Review docs and plan (coordinator)
Files:
- `docs/3rd-party/paperthin/README.md` (sections as in `docs/3rd-party/mattpocock/README.md`: Purpose, Layout, Counts, Themes, Install / use, Highlights, Quality notes, Relevance to adminhead, with the triage summarized and linked here)
- `docs/3rd-party/paperthin/catalog.md` (`python3 -I scripts/catalog-3rd-party.py 3rd-party/paperthin docs/3rd-party/paperthin/catalog.md`)
- a row in `docs/3rd-party/README.md`
- the ledger line in `docs/README.md`: `- **Stole the idea** · [LilMGenius/paperthin](https://github.com/LilMGenius/paperthin) · 2026-10-22 · 28 plain-Markdown hygiene skills; 10 ported as plugins and 4 folded, the rest repo-bound or covered. → [detail](plans/paperthin-ports.md#triage-all-28)`, sorted per the ledger contract
- this plan

Commits: `docs: index and review paperthin`, then `docs(plan): paperthin ports`. Scribe writes the overview, and the coordinator commits.

### S1. cold-read and ssot-consolidate (coder-high)
Commands:
- `python3 scripts/plugins.py new cold-read --kind skill --meta baseline --description "Cold-reads an artifact through a fresh subagent that sees only its contents and reports where a stranger would stall."`
- `python3 scripts/plugins.py new ssot-consolidate --kind skill --meta baseline --description "Finds every copy of one scattered fact, proposes a canonical home and a consolidation plan, and edits only after approval."`

Run `plugins.py check` right after the first `new`, before writing the second, to catch frontmatter issues early.

Files: SKILL.md, LICENSE and NOTICE per plugin, plus `evals/` per plugin in the `plugins/vet/evals/` format:
- cold-read: 2 positives ("before I publish this README, would someone new follow it?"); hard negatives "adversarially review my decision to drop Redis" (doubt-review) and "check the README against the code" (docs-audit).
- ssot-consolidate: 2 positives ("the timeout is in four docs and they disagree"); hard negatives "audit the docs for drift from the CLI" (docs-audit) and "dedupe these imports" (code).

Commits: `feat(cold-read): add context-free comprehension check` and `feat(ssot-consolidate): add scattered-fact consolidation`.

### S2. v0-rewrite, debloat and reorder (coder)
Uses `plugins.py new` for each, all with `--meta baseline`; debloat and reorder set `disable-model-invocation: true`.

v0-rewrite evals:
- positive: "clean up this design doc after the last five edits"
- hard negatives: "tighten this paragraph, it's wordy" (debloat, manual, so expect no skill), "add a changelog entry", and "fix the drift between README and code" (docs-audit)

Commits: one `feat(<p>): ...` per plugin.

### S3. catchup and leakage-audit (coder-high)
- catchup: `--meta baseline`.
  - Evals: positives "I've been away two days, what happened here?" and "what does 'carve' mean in this plan?"
  - Hard negatives: "write a handoff so a fresh session can continue" (handoff, manual) and "recover the session that crashed" (necromancy).
- leakage-audit: `--meta programming-core`.
  - Evals: positives "is this A/B design actually measuring anything?" and "our eval grader was written by the same model, is that a problem?"
  - Hard negatives: "write trigger evals for the vet plugin" (skill-evals) and "run a pre-mortem on the launch" (the-fool).

### S4. macrothink and prism (coder)
Both use `--meta baseline` and are manual, with no evals. Smoke check: `claude --plugin-dir plugins/<p>` and the slash command appears.

### S4b. v0-restart (coder)
Run `python3 scripts/plugins.py new v0-restart --kind skill --meta baseline --description "Manual command that plans a restart from v0, keeping only the contracts, gates, vocabulary, tests and failure notes the previous attempt proved, and dropping its accidental architecture."` and set `disable-model-invocation: true`.

Workflow:
1. Read the plan, retro or session-retro notes, QA evidence and the complaint that triggered the restart.
2. Make the keep/drop split explicit, with evidence for each item.
3. Name the first quality gate before any code.
4. Write a v0 plan with one complete vertical loop. If the work is multi-slice, the plan goes to `docs/plans/` through the planning skill.
5. Build only that loop until it clears the gate.

Keep: no copy-forward unless the artifact earned it; one vertical loop beats many shallow surfaces; turn a vague lesson into a gate or leave it out; archive failed paths, never delete them (move them to a branch or a `docs/` note); name the contract that proves a surviving module survives.

"Not for": experiment-loop (metric-driven iteration) and git-history (rewriting commits). There are no evals, because it is manual.

Commit: `feat(v0-restart): add evidence-based restart planning`.

### S5. Folds into prove, the-fool and session-retro (coder)
Edits as in "Folds" above, plus the NOTICE/LICENSE additions and minor bumps (0.1.0 → 0.2.0 for prove, the-fool and session-retro, in both `plugin.json` and the marketplace entry). No description change.

Acceptance: a grep per folded rule, `plugins.py check`, and `claude plugin validate --strict` for each. Commits: `feat(prove): check claims in both directions` and similar.

### S6. Integration and release (coordinator)
1. Bump baseline (0.2.0 → 0.3.0) and programming-core (minor).
2. Run `python3 scripts/plugins.py catalog && python3 scripts/plugins.py check` and `claude plugin validate --strict .`.
3. Add the root README Acknowledgements row.
4. Commit `chore(release): bump baseline and programming-core for paperthin ports`.
5. Run `claude plugin eval plugins/<p> --trust-plugin` for the five model-invoked plugins (user-approved 2026-10-23). Record the result in `docs/research/evals-2026-10-22.md` and list it in `docs/README.md`. Fix any description that misfires (at most one rewrite round per plugin), and re-run only that plugin.
6. Run `ship-plugin` for each new plugin, the three folded plugins, baseline and programming-core. The marketplace installs from GitHub, so the first run asks to push (Open question 1). A baseline update doesn't install new dependencies, so install the ten new plugins at user scope by hand, as was done for prove and necromancy.

## Rejected alternatives
- **Install paperthin as-is** (`npx skills add` or the clone as a plugin): it brings 28 skills, 16 model-invoked, with upstream names and the `re0-upgrade` hook writer. That is listing cost and overlap we already pay for elsewhere.
- **One `paperthin` plugin holding all ported skills:** the repo rule is one component per plugin (`MULTI_COMPONENT` is for code-bound exceptions only).
- **A `hygiene-core` bundle** instead of baseline: no meta besides baseline wants doc hygiene, and a bundle with a single consumer adds a layer for nothing. Revisit if a project-scope meta needs these.
- **Verbatim vendoring:** it imports em-dash-heavy prose, sibling cross-references to unported skills and Python-script edit-safety advice. Rewriting with listed Keep rules preserves the substance.
- **Porting `readchk`/`aim`/`modelchk` as model-invoked reflexes:** they restate the system prompt or the router, in every session's listing.
- **`hate` and `feynman` as their own manual plugins:** they would be a sixth and seventh challenge command next to the-fool's five modes and doubt-review. Folding gives the-fool the sharper output contract without another name.
- **`sip`:** an every-change orchestrator. Its triggers are covered by docs-sync (Stop), review-loop and `ship-plugin`'s checks.

## Risks and rollback
- **Mis-triggering:** five model-invoked skills, and four of them sit near doubt-review, docs-audit, handoff or skill-evals. Counter: hard-negative evals per plugin and "Not for" lines that name the neighbour. Fallback: flip the plugin to manual.
- **Listing cost in every session:** four model-invoked descriptions are added to baseline. Counter: 60-word cap, and S6 compares the listing size before and after (`claude -p "/context"` skill section).
- **Rewrite loses a rule:** counter: the Keep greps plus a reviewer check against the upstream file side by side.
- **Folds change the-fool's output:** existing the-fool users get a Root/First nail tail in red team. It is additive, and no description change means no routing change.
- **Upstream drift:** `python3 scripts/plugins.py upstream <p>` against `3rd-party/paperthin` reports changes after a pull.
- **Rollback:** one commit per plugin. Revert it, then re-run `plugins.py catalog` and `check`.

## Critique log
1. Advisor review (in-session): add the 3rd-party index and ledger (adopted as S0); check the mattpocock license chain (done, zero hits); default most reflexes to manual (partly adopted: model-invoked only where autonomous firing is the point, with evals); flag `autobahn` rather than decide it (adopted as Open question 1).
2. Self-check: `ssot-consolidate` in baseline vs programming-core. Doc scatter is not code-specific, so baseline was kept.
3. Self-check: `nba` as a separate plugin. Folded into catchup because both read the same state, and upstream calls them a pair.
4. Cross-model critique: not run. `mcp__consult__consult` refused because the codex app server isn't locked (`web_search` is null, `features.plugins` is missing; see the consult README, "Run the codex app server"). Re-run it before S1 if wanted. The fix is planned in `docs/plans/consult-flexible-server.md`, whose S4 step 4 runs this critique.

## User decisions (2026-10-23)
1. **autobahn: rejected.** It is not ported, in whole or in part.
2. **Names: descriptive.** `cold-read`, `v0-rewrite`, `ssot-consolidate`, `leakage-audit` and `v0-restart`. Plain words stay.
3. **Coil suite: catchup plus re0-work.** `re0-work` is ported as `v0-restart` (slice S4b). re0-loop is still skipped, and re0-memo stays a fold into session-retro.
4. **Evals: run them** in S6 for the five model-invoked plugins.

## Open questions
1. **Push:** push to origin when `ship-plugin` asks in S6? This is asked at that point, not before.

## Status
- Done (2026-10-23): S0-S6.
  - The review passed, with the fixes in 0e5a726.
  - Evals: 21/21 with the plugin (`docs/research/evals-2026-10-23.md`).
  - Pushed to origin.
  - Installed and updated:
    - baseline 0.3.0 and prove 0.2.0 at user scope;
    - the nine new baseline plugins installed at user scope;
    - programming-core 0.4.0 and leakage-audit 0.1.0 in all nine project and local scopes where programming-core was installed.
  - the-fool and session-retro were not installed anywhere, so they were only published.
- Note: the project-scope installs edited `.claude/settings.json` in voidrot/isktel, voidrot/orbital-runtime, eve-online/portal and eve-online/platform. Those edits are left uncommitted there.
- Left: none.
