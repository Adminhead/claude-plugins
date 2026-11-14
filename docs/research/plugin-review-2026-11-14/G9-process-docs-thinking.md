# G9 thinking, planning, coding process, docs and session skills, 2026-11-14

Scope (33 plugins + 2 bundles): coding, problem-solving, planning, implement-plan, prototype, research, experiment-loop, review-loop, second-opinion, doubt-review, devils-advocate, fact-check, lens-review, tunnel-check, mistake-proof, vet, cold-read, v0-rewrite, v0-restart, ssot-consolidate, reorder, debloat, docs-audit, adr-writing, handoff, catchup, session-recover, session-retro, leakage-audit, modernize, deprecation-migration, codebase-design, domain-modeling; docs-meta and session-meta as they affect these.

Checks run (all read-only):
- `uv run --with pyyaml python3 scripts/plugins.py check`: `ok`.
- `uv run --with pytest --with pyyaml pytest -q plugins/adr-writing/skills/adr-writing/tests plugins/docs-audit/skills/docs-audit/tests plugins/session-recover/skills/session-recover/scripts/tests`: 77 passed, 11 subtests passed.
- PyYAML `safe_load` over the frontmatter of all 33 SKILL.md files: all parse. The `vet` description is 660 characters. Every other description is under 500.
- Every SKILL.md, reference, plugin.json and eval in scope was read. For scripts (`new_adr.py`, `docs_drift.py`, `session_recover.py`) I read the interfaces and ran the tests, and did not read every line.

Renames since 2026-10-23, all on 2026-11-06: the-fool became devils-advocate, necromancy became session-recover, prove became fact-check, prism became lens-review, macrothink became tunnel-check, and poka-yoke became mistake-proof (`git log`: 59dca43d). The TSV marks mistake-proof NEW, but it is poka-yoke renamed. On the same day cold-read, v0-rewrite, ssot-consolidate and catchup left `baseline` for the new `docs-meta` and `session-meta` (895ee0f0, 5639fdb8). The 564-session listings come from their time in baseline.

## Summary

- **Verdicts:** KEEP 7, KEEP-FIX 6, SLIM 4, MERGE 11, DEPRECATE 5. session-meta should be dissolved once the merges land. The proposed shape takes 33 plugins down to 18 and removes about 10 model-invocable listings (about 1.2k listing tokens in every session where they are installed).
- **The evidence supports consolidation.** Of the 21 skills that are paperthin or harness-toolbox ports or small process skills, the one with real usage is second-opinion (41 calls in 24 sessions). vet and adr-writing are the only others with any. The four paperthin model-invocable ports (cold-read, v0-rewrite, ssot-consolidate, catchup) had 2,256 session-listings between them and 1 call. Current models do the core task of these skills unprompted when asked ("clean up this doc", "what happened while I was away"). The decision-changing content of each is 5 to 15 lines, so it fits as a mode of a shared skill.
- **The three preloads are the real cost center.** coding (10.3 KB) loaded 678 times into coder, planning 64 times into architect, problem-solving 11 times into debugger. In each case the agent body already restates or overrides much of the skill:
  - `architect.md:73` switches off planning's question round, review rounds, delegation, task creation and save location, and overrides its template.
  - `debugger.md:14` says "this body wins" but does not name what it disables. problem-solving's steps 8 and 9 tell the read-only debugger to implement the fix, write a regression test and write the commit message.
  - `coding:21` tells the coder to use AskUserQuestion. The coder has no such tool (`coder.md:6`) and is told to put questions in its report instead (`coder.md:19`).

  All three should be slimmed to the parts the agent body lacks.
- **There is a natural experiment nobody has read.** The agents ran without their preload in about a quarter to three-quarters of spawns: coder 891 spawns vs 678 coding loads, architect 133 vs 64 planning loads, debugger 47 vs 11 problem-solving loads. Those are the projects where programming-core was not installed. Comparing outcomes in the usage log would settle whether the preloads help (UNVERIFIED that the log holds enough outcome signal).
- **[high] 8 eval cases cannot fail.** fact-check, lens-review, tunnel-check and session-recover are `disable-model-invocation: true`, and each has 2 `max: 0` Skill graders asserting the model does not invoke it. The model never can. This is the same class as the deleted sibling graders.
- **[high] leakage-audit sits in programming-core**, so every language and web meta lists it. 47 sessions listed it and none called it. It is an eval-design taxonomy, not a programming aid.
- **Prior findings:** of 31 re-checked, 5 FIXED, 4 PARTLY, 20 STILL OPEN, 2 UNVERIFIED. The V30 collision is still partly open at `v0-rewrite/SKILL.md:3`, and follow-up F1 (paired root suites for thinking/docs) has not started (no `evals/thinking` or `evals/docs`).

## Prior findings re-checked

| Prior finding (source) | Status | Evidence |
|---|---|---|
| [high] Cross-plugin `not-<sibling>` graders can never fail (experiment-loop, prototype, research, problem-solving, coding, implement-plan, review-loop) (G9 10-23, V26) | FIXED | Each of those evals dirs now holds only its `fires-*.md` grader, for example `plugins/problem-solving/evals/*/graders/` |
| [high] Most-named neighbours have zero evals: docs-audit, planning, modernize, codebase-design, poka-yoke, domain-modeling, second-opinion (G9, V32) | PARTLY | mistake-proof now has 4 cases. docs-audit, planning, modernize, codebase-design, domain-modeling and second-opinion still have `eval_cases` 0 (TSV) |
| [high] Three-way collision on "copies of a fact disagree" (G9, V30) | PARTLY | ssot-consolidate now sends docs-only duplication to docs-audit (`ssot-consolidate/SKILL.md:12`). `v0-rewrite/SKILL.md:3` still says "or when related docs have drifted apart". `docs-audit/SKILL.md:12` still claims "assigning doc roles so each fact has one owner" with no pointer back to ssot-consolidate. No eval pins the boundary |
| F1 paired root suites (thinking, docs) (fixes plan :472) | STILL OPEN | `ls evals/` shows android, forges, godot-meta, jvm, orchestration, orchestration-ab, specialists only |
| [med] modernize vs deprecation-migration collision | STILL OPEN | `modernize/SKILL.md:10` Not-for omits deprecation-migration. `deprecation-migration/SKILL.md:3,10` never names modernize |
| [med] poka-yoke vs codebase-design interface overlap | STILL OPEN | `mistake-proof/SKILL.md:8` and `codebase-design/SKILL.md:10` do not name each other |
| [med] catchup vs domain-modeling on "what does this term mean" | STILL OPEN | `catchup/SKILL.md:3` has no domain-modeling exclusion. `domain-modeling/SKILL.md:10` does not name catchup |
| [med] planning "grill me" vs the-fool | STILL OPEN | `planning/references/stress-test.md:3` still says "a plan, design, or idea", while `devils-advocate/SKILL.md:12-13` sends ideas to itself and plans to planning |
| [med] doubt-review description has no Not-for (the-fool, second-opinion) | STILL OPEN | `doubt-review/SKILL.md:3`. Boundaries exist only in the body at `:12-14` |
| [med] Manual-skill shadowing needs quiet cases on model-invocable siblings | PARTLY | `v0-rewrite-quiet-debloat` and catchup's handoff and session-recover negatives exist. Nothing guards "/v0-restart", "/reorder" or "/session-retro" phrasing |
| [med] No outcome evals in the group | PARTLY | One exists, `catchup-next` (1/0), but its grader is presentation-only (`catchup/evals/catchup-next/graders/next-move.md`: regex `next move`). See catchup |
| [med] vet and second-opinion evals blocked by `dependencies` | STILL OPEN | No deps-stripping helper in `scripts/plugins.py`. second-opinion has 0 cases. vet's last run (2026-10-21, v0.1.0) scored `vet-links` 0 |
| [low] `runs: 1` in every case | STILL OPEN | All G9 cases, for example `plugins/vet/evals/vet-links/prompt.md:5` |
| [low] `adr-trigger` and `problem-solving-flaky` have no model pin | STILL OPEN | `adr-writing/evals/adr-trigger/prompt.md:1-8`, `problem-solving/evals/problem-solving-flaky/prompt.md:1-8`, and also `coding/evals/coding-feature/prompt.md:1-8` |
| [low] Mixed `[trigger]`/`[routing]` tags on positives | STILL OPEN | `doubt-review/evals/doubt-fresh-context/prompt.md:4`, `devils-advocate/evals/*/prompt.md:4`, `deprecation-migration/evals/depr-*/prompt.md:4`, `problem-solving/evals/trigger-*/prompt.md:4` |
| [low] Trivial negatives (`doubt-quiet-prettier`, `fool-quiet-format`, `depr-quiet-darkmode`) | STILL OPEN | Same files, `devils-advocate-quiet-format` renamed |
| [low] Strict-YAML failures (catchup, deprecation-migration, the-fool, necromancy) | FIXED | All 33 parse under PyYAML. `scripts/plugins.py:348` now parses every SKILL.md |
| [low] adr-writing pytest cannot run | FIXED | CLAUDE.md documents `uv run --with pytest`. The tests pass |
| [low] domain-modeling writes ADRs with its own fallback | STILL OPEN | `domain-modeling/SKILL.md:18` |
| [med] codebase-design: no Not-for poka-yoke/coding/unit-testing | STILL OPEN | `codebase-design/SKILL.md:10` |
| [low] codebase-design: no fallback without codebase-memory | FIXED | `references/architecture-review.md:25` "Without codebase-memory, read the scoped files directly" |
| [low] debloat names avoid-ai-writing without "if installed" | STILL OPEN | `debloat/SKILL.md:15` |
| [med] docs-audit: no reverse pointer to ssot-consolidate/v0-rewrite | STILL OPEN | `docs-audit/SKILL.md:12` |
| [low] docs-audit: "or to restructure docs" invites v0-rewrite/reorder | STILL OPEN | `docs-audit/SKILL.md:3` |
| [low] leakage-audit: "Writing or running evals: not this skill" names no owner | STILL OPEN | `leakage-audit/SKILL.md:12` |
| [low] necromancy (session-recover): "Use for" triggers in a manual description | STILL OPEN | `session-recover/SKILL.md:3` |
| planning saves to `.agents/plans/` (fixes plan :495) | FIXED | `planning/references/closing-review.md:29` now says `.claude/plans/<slug>.md` |
| [med] prove (fact-check): "The trigger is a feeling" in a manual skill | STILL OPEN | `fact-check/SKILL.md:14` vs `:5` |
| [low] session-retro "Use when..." in a manual description | STILL OPEN | `session-retro/SKILL.md:3-4` |
| [low] vet: automate the deps-stripped copy | UNVERIFIED | No helper found. The vet eval results are from 2026-10-21 only |
| [low] second-opinion model matrix self-dated | UNVERIFIED | `second-opinion/SKILL.md:36` still says "as of October 2026". Source check needed |

## Per-plugin

For each plugin, "Unprompted" is what Opus 5.5 / Sonnet 5.5 do on the core task without the skill. "Delta" is what the skill changes.

### coding — SLIM (medium)
- **Value:** K-decision, plus the coder preload.
  - Unprompted: Sonnet makes the change, often adds an unrequested helper or option, sometimes writes a second copy of an existing helper, and runs the tests.
  - Delta:
    - a reuse ladder that stops at the first fit (`SKILL.md:23-29`);
    - "name the exemplar and copy its shape" (`:31-33`);
    - a stop rule against copying more than about 20% of a file or starting a parallel implementation (`:39`);
    - the `shortcut:` comment form (`:45`);
    - "classify a failing check before editing again" (`:55`).

  These target known over-engineering and duplication failures and are worth keeping. The rest restates the coder body or is generic.
- **Evidence:** 68 sessions listed, 678 loads, 1 model call. One routing case and no outcome case. That is about 2.6k tokens per coder spawn (UNVERIFIED how much of it is cached across spawns).
- **Fixes:**
  - [med] `SKILL.md:21` tells the coder to "ask … (AskUserQuestion)". The coder has no AskUserQuestion (`coder.md:6`) and must report the question instead (`coder.md:19`). Change to "or stop and report the question", or drop the line.
  - [med] Duplicated with the coder body: the label-rename exception (`SKILL.md:53` vs `coder.md:29`, nearly verbatim), the "real check" rule (`:54` vs `coder.md:29`) and "list extras, don't do them" (`:57` vs `coder.md:30`). Keep each in one place, the skill, so main-session users also get them.
  - [low] `references/design-seams.md:25-32` repeats `codebase-design/references/deepening.md:5-25` (dependency categories, the "one adapter = hypothetical seam" rule). Keep one copy, or mark one as derived.
  - [med] Evals: turn `coding-feature` into an outcome case. Graders: no new module file, existing return value unchanged, a test added. Run it with/without on haiku and sonnet. That is the only way to show the preload helps.
- **What stays (about 35 lines, about 5 KB):** Never cut, the reuse ladder, local shape, direct design with the deletion test and the 20% rule, verify (trace each line, classify failures), and finish. **What goes:** step 5's error and retry bullets (generic, and covered by api-idempotency), step 6's optimization paragraph (generic, and experiment-loop owns it), and the duplicated lines. Lost for Haiku: nothing it would not get from the coder body.

### problem-solving — SLIM (medium)
- **Value:** K-decision.
  - Unprompted: Sonnet on "why is this flaky" reads code and proposes 2 or 3 hypotheses quickly, often before it has a reproduction.
  - Delta: the red-capable gate with its 4-box checklist (`SKILL.md:20-26`), "minimize until every element is load-bearing" (`:28`), prediction/probe columns per hypothesis (`:32-36`), and `[DEBUG-xxxx]` tagged instrumentation with cleanup (`:38`, `:51`). The gate is the one rule that changes behavior. The references (`hypotheses.md`, `performance.md`, `closeout.md`) are textbook.
- **Evidence:** 62 sessions listed, 11 loads (all debugger preloads), 0 model calls. 3 routing cases, no outcome case. Main sessions never choose it, so its only real user is the debugger.
- **Fixes:**
  - [med] Preload conflict. The debugger is read-only and never fixes (`debugger.md:14`). But steps 7-9 (`SKILL.md:43-54`) tell it to implement, write the regression test, watch it fail, clean up and write the commit message. `feedback-loops.md:18` asks the user to run a HITL script, and a subagent has no user. `debugger.md:14` only says "this body wins". Name the skipped parts the way `architect.md:73` does: "skip steps 8-9, the HITL loop and closeout; stop at step 7".
  - [low] `${CLAUDE_SKILL_DIR}` in `SKILL.md:24` when preloaded into an agent: UNVERIFIED that it resolves.
  - [med] Evals: add one outcome case with `tool_order` showing a Bash repro before any hypothesis text or Read sweep (the prior `ps-signal-first` proposal).
- **What stays (about 45 lines):** Redact first, steps 1-7 condensed, the algorithm-choice section and escalation. Fold `hypotheses.md` and `performance.md` into 6 lines and keep `feedback-loops.md` (the 10 loop types are useful vocabulary). Keep the plugin itself, because 12 sibling skills route to it by name.

### planning — SLIM (medium)
- **Value:** K-decision (verification proportionality), plus the architect preload.
  - Unprompted: Opus plans well. It tends toward "run the full suite after every slice" and rarely separates requirements from suggestions.
  - Delta: "make expensive checks earn their place" and "rerun by impact" (`SKILL.md:20-21`), "baseline failures recorded separately" (`:72`), the multi-agent lane rules where one lane owns hot shared files (`references/multi-agent-plans.md:27-33`), and EARS criteria (`acceptance-criteria.md`). Everything else overlaps plan mode, the Plan agent and the architect body.
- **Evidence:** 63 sessions listed, 64 loads (architect preload), 1 model call. 0 eval cases. The architect body disables the question round, review rounds, delegation, TaskCreate and the save locations, and replaces the output template (`architect.md:73`). So in its main use about half of the skill is loaded only to be switched off.
- **Fixes:**
  - [med] Drop or condense the plan output template (`SKILL.md:39-64`). It competes with the architect's report shape and with the main-session Plan agent.
  - [med] `references/stress-test.md:3`: narrow to "plan or design". An idea or strategy goes to devils-advocate, or to the merged fresh-eyes if adopted.
  - [low] Evals: one positive (multi-slice) and one quiet vs implement-plan.
- **What stays (about 40 lines):** workflow steps 2-9 condensed, "What a plan must require", and the references (multi-agent and acceptance criteria). Receives v0-restart as `references/restart.md` (see below).

### implement-plan — DEPRECATE (Duplicate, medium)
- **Value:** none private.
  - Unprompted: the orchestration agent executes saved plans slice by slice with plan-ledger, verify and per-slice agents (`orchestration.md:31,106`), which is the owner's daily stack.
  - Delta: a second, competing execution protocol (a TaskCreate mirror plus a `## Status` block, `SKILL.md:17,23`) that never consults plan-ledger.
- **Evidence:** 2 sessions listed, 1 load, 1 call. One routing case.
- **Lost:** a session without orchestration-meta that says "implement this plan" loses the worktree merge order and the "commit before spawning worktree agents" rule (`SKILL.md:18`). Move that rule to `planning/references/multi-agent-plans.md` (2 lines). Update the references in modernize, planning and review-loop.

### prototype — KEEP (low)
- **Value:** K-decision.
  - Unprompted: asked for "three layouts", Sonnet produces three near-identical card grids on a new route.
  - Delta: variants must differ structurally (`references/ui.md:18`), data fetching stays above the switch (`:11,20`), a `?variant=` switcher hidden in prod (`:35-39`), and a DOM-free logic module that can be lifted out (`references/logic.md:11-17`). This is the most concrete "current models get this wrong" content in the family.
- **Evidence:** never listed (in no meta), no loads. One routing case.
- **Fixes:**
  - [med] It is in no meta, so nobody can see it. Add it to web-meta (or design-core), or accept that it never runs.
  - [low] Evals: add `proto-quiet-design` (vs codebase-design-it-twice).

### research — DEPRECATE (Generic, medium-low)
- **Value:** Generic.
  - Unprompted: Opus and Sonnet with WebSearch/WebFetch pick primary docs, cite and caveat dates. Anthropic's `deep-research` covers long reports (named in `SKILL.md:12`).
  - Delta: 26 KB of research methodology (source hierarchy, ledger, triangulation, confidence wording). The only house-specific lines are "check the repo for prior research or ADRs first" (`SKILL.md:38`) and the tool picker (`:20-27`).
- **Evidence:** never listed (in no meta), no loads. One weak positive (SQLite STRICT, a one-fact question).
- **Lost:** Haiku's tendency to cite snippets or fabricate a citation (`references/source-evaluation.md:50-56`) loses a guard. Move the "snippets are leads, never support; never cite an unread URL" line into `vet` and `coding` where they point at research, and drop the pointers.

### experiment-loop — KEEP (medium)
- **Value:** K-decision, plus safety mechanics.
  - Unprompted: asked to "loop until bench < 400 ns", Sonnet edits and reruns. It may `git reset --hard` failures, edit the benchmark, or stop to ask after each run.
  - Delta: dedicated branch or worktree, a commit before measuring, `git revert "$pre"..HEAD` instead of a reset (`SKILL.md:51-61`), the judge outside the editable scope (`:36`), a noise floor from a repeated baseline (`:43`), and log files kept untracked via `info/exclude` (`:42`). These are concrete and correct.
- **Evidence:** never listed, no loads. One routing case.
- **Fixes:**
  - [low] Put it in a meta (programming-core in place of leakage-audit), or leave it user-installed.
  - [low] Evals: an outcome case grading `tool_used Bash input_match 'reset --hard' max 0` (prior proposal).
  - Would receive leakage-audit's pattern list if the owner prefers that home to skill-evals.

### review-loop — DEPRECATE (Duplicate, medium)
- **Value:**
  - Unprompted: `/code-review --fix` applies findings, and a second `/code-review` re-reviews. The reviewer agent already does conformance re-checks for orchestration.
  - Delta: stable finding IDs across rounds, a fresh re-reviewer per round and a 3-round cap (`SKILL.md:18-44`). second-opinion's `references/dual-review.md:27-28` already has "fresh reviewers each round, cap at three".
- **Evidence:** never listed, no loads. One routing case.
- **Fixes on removal:** inline the 5-line findings-file format into `second-opinion/references/dual-review.md:27`, which currently points at review-loop. Update `implement-plan` (also deprecated) and `second-opinion/SKILL.md:10`.
- **Lost:** an ID'd findings file across rounds on long review loops. Opus as orchestrator does this from one sentence in a brief.

### second-opinion — KEEP (high)
- **Value:** K-private and Tooling.
  - Unprompted: the model does not know the `consult` tool's inputs, timeouts, error codes, codex/agy tiers, the agy suffix rule or the opt-out file.
  - Delta: all of the above, checked against code. `DEFAULT_TIMEOUT_SEC = 480` (`consult/hooks/consult/consult.ts:11`), `MAX_TIMEOUT_SEC = 540` (`appserver.ts:7`), and every error token in the table (`SKILL.md:96-106`) exists in `appserver.ts`/`consult.ts`/`register.tsx`. The "form your position first" rule (`:16`) is decision-changing.
- **Evidence:** 569 sessions listed, 41 loads, 41 calls in 24 sessions. The family's one clear success. 0 eval cases.
- **Fixes:**
  - [med] Evals still blocked by `dependencies: ["consult"]` (`plugin.json:9`). Add the deps-stripping helper (one function in `scripts/plugins.py`) and two cases: one positive, and `so-quiet-codereview` ("find bugs in this diff").
  - [low] When review-loop goes, inline the findings-file format (`references/dual-review.md:27`).
  - [low] The model matrix (`SKILL.md:30-36`) needs a source check (see the list at the end).

### doubt-review — KEEP-FIX, as the survivor of a merged `fresh-eyes` skill (medium)
- **Value:** K-decision.
  - Unprompted: asked to "adversarially review my claim", Opus either self-reviews in context or spawns a subagent and hands it the claim and its reasoning, which biases it toward agreement.
  - Delta: "pass artifact and contract, never the claim" (`SKILL.md:94`), a verbatim adversarial prompt (`:78-91`), a reconcile order (`:100-105`) and a 3-cycle cap. cold-read, tunnel-check and lens-review apply the same core (a fresh subagent, stripped context, no averaging, convergence is not proof) to three other questions.
- **Evidence:** never listed (in no meta), no loads. 2 positives and 1 trivial negative.
- **Proposed merge:** rename the plugin to `fresh-eyes` and make it a manual command (`/fresh-eyes [disprove|cold|reframe|lenses] [target]`) in baseline. About 70 lines:
  - shared rules (about 15): pass contents not intent; same-model agreement is reassurance, not proof; report divergence first; 3 cycles.
  - one section per mode (10-15 lines each), taken from doubt-review steps 1-5, cold-read `:17-24`, tunnel-check `:21-31` and lens-review `:18-23`.
- **Fixes:**
  - [low] `SKILL.md:96`: replace the "external model CLI… pipe on stdin" paragraph with "use `second-opinion`/consult". The raw-CLI path predates the consult tool.
  - [med] Add "Not for another model family (second-opinion), or an idea or strategy (devils-advocate)" to the description (prior finding).

### devils-advocate — DEPRECATE (Generic, medium)
- **Value:** Generic.
  - Unprompted: "play devil's advocate on rewriting in Go" or "run a pre-mortem" gets a steelman, the strongest counter-arguments, failure narratives and a synthesis from both Opus and Sonnet.
  - Delta: a forced two-step AskUserQuestion mode menu before any critique (`SKILL.md:20,27-41`). That adds a round trip the user did not ask for. It also brings about 35 KB of textbook references (Hegelian dialectic, Popper, reductio tables; `references/dialectic-synthesis.md`, `evidence-audit.md`, `pre-mortem-analysis.md`). The paperthin folds (the `root/first_nail` contract, "the critic never supplies the rationale") are the only sharp parts.
- **Evidence:** never listed, no loads. 2 positives and 1 trivial negative.
- **Lost:** a mode menu and checklists, which a Haiku user might use. Move the two folded rules into the `fresh-eyes` disprove mode (3 lines). Update the pointers in doubt-review, leakage-audit, lens-review and tunnel-check.

### fact-check — DEPRECATE (Generic and Unused, medium)
- **Value:**
  - Unprompted: on "source? did you make that up?" both models re-check files and docs and correct themselves.
  - Delta: the Confirmed/Wrong/Unverified vocabulary, "memory may locate evidence but cannot confirm" and "check both directions" (`SKILL.md:19,25-31`).
- **Evidence:** manual, 0 loads in four weeks (session-meta, and baseline before 11-06). Both eval cases are inert (see Cross-plugin).
- **Fixes if kept:** [med] `SKILL.md:14` "The trigger is a feeling, not a request" contradicts `:5` `disable-model-invocation: true` (prior finding, still open).
- **Lost:** the fixed verdict words. If the owner wants them, add them as a 6-line "facts" mode in `fresh-eyes`.

### lens-review — MERGE into fresh-eyes (medium-low)
- **Value:**
  - Unprompted: Opus asked to "look at this through security, cost and readability" does three passes and summarizes, usually averaging them.
  - Delta: "one reason per lens, never average, output the one question that resolves the split" (`SKILL.md:20-31`). That is 6 lines of real content.
- **Evidence:** manual, 0 loads, 2 inert negatives.
- **Moves:** `:18-23` and `:29-33` into fresh-eyes as the `lenses` mode.

### tunnel-check — MERGE into fresh-eyes (medium)
- **Value:**
  - Unprompted: the model will not strip its own framing before fanning out. It passes its plan along.
  - Delta: "strip the session's examples, suggested answer and naming" (`SKILL.md:22`), divergent-incompatible first, and roots over instances (`:25-31`).
- **Evidence:** manual, 0 loads, 2 inert negatives.
- **Moves:** steps 1-8 into fresh-eyes as the `reframe` mode.

### mistake-proof — KEEP-FIX (medium)
- **Value:** K-decision.
  - Unprompted: asked to "make it impossible to swap from/to", Sonnet adds keyword args or a docstring and stops. It does not say which rung the fix reaches, or sweep for the same hazard elsewhere.
  - Delta: the Control/Warning/Detection/docs-only ladder (`SKILL.md:16-25`), "optional safety is docs-only in a costume" (`:90`), the incident split into defect, mistake and hazard plus the sweep (`:74-82`), and a 34-entry hazard catalog with greppable signals (`references/hazard-catalog.md`). Accurate and well curated, and problem-solving routes to it (`problem-solving/SKILL.md:45`).
- **Evidence:** never listed (in no meta), no loads. 4 cases (2 positive, 2 hard negative).
- **Fixes:**
  - [med] Add "Not for module depth or seam placement (`codebase-design`)" at `SKILL.md:8`, and the reverse in codebase-design (prior finding).
  - [low] Put it in a meta (programming-core) or nobody sees it.
  - [low] Add an outcome case: audit a 30-line fixture that has an empty-filter `DELETE` and a `float` price, with regex `Control|Warning` and `path:line`.

### vet — KEEP (high)
- **Value:** K-private and Enforcement-adjacent.
  - Unprompted: the model does not know the ledger location (`docs/README.md`), the five verdict words, the dedupe paths (including the warning about `.gitignore`-honoring grep, `SKILL.md:47-51`) or the routing to plugin-vetter.
  - Delta: a deterministic, dedupe-first workflow that produces a ledger line.
- **Evidence:** 27 sessions listed, 3 calls. 6 cases, the family's best suite, but the last recorded run (2026-10-21, v0.1.0) scored `vet-links` 0 and no run is recorded since.
- **Fixes:**
  - [low] The description is 660 characters (`SKILL.md:3-12`). Cut the "Not for" clause to the two nearest neighbours (research, plugin-vetter) to get under 500.
  - [med] Re-run its suite once the deps-stripping helper exists, and record the result.

### cold-read — MERGE into fresh-eyes (medium)
- **Value:**
  - Unprompted: asked "would a stranger follow this README?", Sonnet re-reads it in context and judges it, which is the failure the skill names.
  - Delta: "a fresh subagent, contents inline, never the path or the intent" (`SKILL.md:17-18`). That is about 8 lines of real content.
- **Evidence:** 564 sessions listed, 0 loads. 4 routing cases, which pass in evals but never fire in real sessions.
- **Moves:** workflow steps 1-5 into fresh-eyes as the `cold` mode.

### v0-rewrite — KEEP-FIX, as the survivor of a merged manual `doc-tidy` (medium)
- **Value:**
  - Unprompted: "clean up this doc after five edits" gets a clean rewrite from both models. Occasionally an "Updated:" note or a "previously X" survives.
  - Delta: "turn what changed into what is true now" and "no old/new traces" (`SKILL.md:33-35`), plus "edit per occurrence, report a MISS" (`:38`).
- **Evidence:** 564 sessions listed, 0 loads. 5 routing cases.
- **Proposed merge:** rename to `doc-tidy`, manual (`/doc-tidy [rewrite|tighten|reorder] <file>`), in baseline in place of debloat. About 45 lines: shared rules (edit per occurrence, MISS, a pass that finds nothing changes nothing) plus three short modes (v0 rewrite, debloat's "cut words never rules", reorder's "move only, one principle").
- **Fixes if kept as is:**
  - [med] `SKILL.md:3` "or when related docs have drifted apart" (V30). Delete it.
  - [low] Add the v0-quiet-ssot case.

### v0-restart — MERGE into planning as `references/restart.md` (low)
- **Value:**
  - Unprompted: "start over, keep only the contracts" gets a sensible keep/drop list from both models.
  - Delta: the "negative corpus" rule and "turn a vague lesson into a gate or leave it out" (`SKILL.md:30-31`). That is about 10 lines.
- **Evidence:** manual, 0 loads, 0 evals.
- **Moves:** workflow plus rules (`:18-32`) into one planning reference, with a "restart from v0" mention in planning's optional modes (`planning/SKILL.md:29-33`).

### ssot-consolidate — MERGE into docs-audit (medium)
- **Value:**
  - Unprompted: asked to "get the timeout down to one source of truth", the model greps, picks a home and edits, usually without a second search method or an approval stop.
  - Delta: "search again by a second method" (`SKILL.md:24`), the exact copy/paraphrase/stale/contradictory classification (`:25`) and "report, then approval, then edit" (`:28-29`).
- **Evidence:** 564 sessions listed, 0 loads. 5 routing cases.
- **Moves:** a `references/one-fact.md` in docs-audit (about 20 lines from `:22-44`), with the docs-audit description extended to "a value repeated across code, config and docs". This settles the V30 collision by giving the whole "copies disagree" space one owner.

### reorder — MERGE into doc-tidy (medium)
- Manual, 0 loads, 0 evals. Moves: "move only; one nameable principle; mirrored copies in lockstep" (`SKILL.md:26-30`) and the catalog exception (`:14`).

### debloat — MERGE into doc-tidy (medium)
- Manual, in baseline, 0 loads in four weeks. Moves: `SKILL.md:20-29` (the bloat list, "cut words, never a rule"). Fix if kept: [low] `:15` "use `avoid-ai-writing`" needs "if installed".

### docs-audit — KEEP-FIX (medium)
- **Value:** Tooling and K-decision.
  - Unprompted: asked "are the docs stale?", Sonnet reads the README and spot-checks two or three commands.
  - Delta: `docs_drift.py` (npm/make targets inside code blocks, relative links, env vars in both directions, Fingerprint/Monitored staleness stamps; 6 tests pass), the "cite the line that contains the thing" rule (`SKILL.md:26`), the warning that `compileall` leaves `.pyc` files (`:21`), and P0-P3 severities.
- **Evidence:** 51 sessions listed, 0 loads. 0 eval cases. It is in no meta. That is odd, because docs-meta (the docs bundle) omits the one docs skill with a script.
- **Fixes:**
  - [med] Add docs-audit to docs-meta.
  - [med] Absorb ssot-consolidate (above). Then rewrite `SKILL.md:12` to own "one fact, one home" explicitly and drop "or to restructure docs" from `:3` (prior finding).
  - [med] Evals: `da-stale-readme` positive and `da-readonly` outcome (`tool_used Edit max 0`, `docs_drift.py min 1`) from the prior report. It has none.
  - [low] Consider preloading it into `scribe` (`scribe.md:8-10` preloads only codebase-memory and plan-ledger), whose job is "verifying every claim against the code". Most real docs work routes there.

### adr-writing — KEEP (high)
- **Value:** Tooling and K-private.
  - Unprompted: the model writes a reasonable Nygard ADR and picks the next number by `ls`. It misses a collision with a number taken on another branch, and it rewrites the superseded ADR.
  - Delta: `new_adr.py` (next number, cross-branch collision warning, supersede both records, index writer; tests pass), the 3-test "is an ADR warranted" gate (`SKILL.md:23-28`) and the `manage_adr` distinction (`:15`, owner-specific).
- **Evidence:** 38 sessions listed, 1 call. 1 routing case with no model pin.
- **Fixes:**
  - [low] Pin `model:` in `evals/adr-trigger/prompt.md`.
  - [low] Add the `adr-supersede` outcome case from the prior report.

### handoff — KEEP-FIX, as the survivor of a merged briefing command (medium)
- **Value:**
  - Unprompted: "write a handoff" gets a good summary from both models.
  - Delta: a temp-dir location, the `claude --bg --name … -- "$(cat file)"` launch recipe and the agent-management commands (`SKILL.md:35-45`). The recipe is K-private and needs a source check.
- **Evidence:** manual, in baseline, 0 loads in four weeks. 0 evals.
- **Proposed merge:** one manual `/handoff [--bg|--recover [id]|--catchup]`:
  - live brief (as today);
  - `--recover` runs `session_recover.py` (the script and its 77-test suite move as is; its brief shape at `session-recover/SKILL.md:23-29` duplicates `handoff/SKILL.md:22-27` already);
  - `--catchup` writes the human-facing brief in decision order.

  One plugin in baseline, and session-meta loses its reason to exist.
- **Fixes:** [low] Re-verify `--bg`/`--name`/`attach`/`logs`/`stop` against the current `claude --help` (last verified on 2.1.309).

### catchup — MERGE into handoff as `--catchup` (low-medium)
- **Value:**
  - Unprompted: "I've been away two days, what happened?" gets a git-log-driven summary, usually chronological and process-voiced.
  - Delta: decision order with Needs-you first, "from state not memory", New words with glosses, and one Next move (`SKILL.md:17-25`). This is a genuine shape change, but a taste rather than a capability.
- **Evidence:** 564 sessions listed, 1 call. The outcome case `catchup-next` scores 1/0 only on the regex `next move` (`evals/catchup-next/graders/next-move.md:3`). That measures the label, not the brief, so the "measured lift" is presentational.
- **Fixes if kept model-invocable:**
  - [med] Replace the label regex with an llm rubric ("the first section is a decision the human must make; every claim cites a path or commit").
  - [med] Add "Not for deciding what a term should mean (domain-modeling)" (prior finding).

### session-recover — MERGE into handoff as `--recover` (medium)
- **Value:** Tooling.
  - Unprompted: the model would `Read` the raw JSONL (megabytes) or give up.
  - Delta: `session_recover.py` lists and digests transcripts with masking, mode 0600 and exclusion of the running session. Tests pass. This part survives intact.
- **Evidence:** manual, 0 loads. 2 inert negatives.
- **Fixes:** [low] `SKILL.md:3` "Use for /session-recover, 'recover the dead session'…" cannot fire on a manual skill (prior finding, still open).

### session-retro — KEEP (medium)
- **Value:** K-private.
  - Unprompted: the model does not know the transcript layout, the dedupe-by-`message.id` rule for usage (`references/transcripts.md:24`), the usage-log report entry point and eval-run exclusion (`references/multi-session.md:5-9`), or the "check the proposal against current source" step. This is the owner's own measurement loop, and the same data this review uses.
- **Evidence:** manual, in baseline, 0 loads in four weeks. 0 evals.
- **Fixes:**
  - [low] `SKILL.md:3` "Use when the user asks for a retro…" is inert in a manual skill. Reword it as a command description.
  - [low] Re-date `references/transcripts.md:3` ("checked … on 2026-10-17") after the next check.

### leakage-audit — MERGE out of programming-core into skill-evals (or experiment-loop) (medium)
- **Value:**
  - Unprompted: "is a same-model grader a problem?" gets "yes, circular, use a held-out or human label" from both models.
  - Delta: names for 8 patterns (`SKILL.md:25-32`), "blinding the value does not blind the recipe" (`:36`) and the self-check (`:42`). These are useful when the owner designs plugin evals, and irrelevant to the Python, Go or web projects whose metas carry it.
- **Evidence:** 47 sessions listed, 0 loads. 4 routing cases.
- **Fixes:**
  - [high] Remove it from `programming-core/.claude-plugin/plugin.json:101`.
  - [low] Merge the 8 patterns into the repo-local `.claude/skills/skill-evals` as a reference (about 20 lines), where the eval-design work happens, or into experiment-loop's `references/loop-design.md`, which already covers "the judge is the same agent".
  - [low] `:12` "not this skill" should name skill-evals.

### modernize — KEEP-FIX (medium)
- **Value:** K-decision.
  - Unprompted: "plan how we get off AngularJS and Node 14" gets a sensible phased plan from Opus. It assumes the old stack runs and requires green tests before the stack can run.
  - Delta: a time-boxed feasibility spike in a scratch worktree (`SKILL.md:16-22`), a testability milestone per component (`:24`), a least-disruptive ladder (`:32-37`), and a hazard catalog with probes (H3 runtime pins and H5 stateful-store majors are the classic misses; `references/migration-hazards.md:38-73`).
- **Evidence:** never listed (in no meta), 0 evals.
- **Fixes:**
  - [med] Absorb deprecation-migration's decision tree and the churn rule (about 20 lines) as `references/sunset.md`, and add "moving consumers off an API or service; sunsetting" to the description.
  - [med] Evals: `mod-angularjs` positive and `mod-quiet-planning`.
  - [low] `:10` names the official `code-modernization` plugin as an alternative (Duplicate risk). Needs a source check that it still exists.

### deprecation-migration — MERGE into modernize (medium)
- **Value:** Generic.
  - Unprompted: "rename users.name without downtime" gets expand/contract from both models. Expand/contract is also in `db-schema-design/references/migrations.md`, `rollout-plan`, `feature-flags` and `mistake-proof/references/hazard-catalog.md:57`.
  - Delta: the sunset-or-keep questions and "advisory unless security or cost" (`SKILL.md:20-28`), "remove when measured usage is zero, not on a date" (`:35`) and zombie code (`:62`).
- **Evidence:** never listed, no loads. 2 positives and 1 trivial negative.
- **Moves:** `:12-35` and `:60-62` into modernize. Drop the expand/contract section and the patterns reference (duplicates).
- **Lost:** a single page on API sunsets for a user without modernize.

### codebase-design — SLIM (low)
- **Value:** K-decision and Tooling use.
  - Unprompted: "find refactor candidates" gets a reasonable list from greps.
  - Delta: an architecture review driven by codebase-memory `get_architecture` hotspots/cycles and `search_graph` degree filters (`references/architecture-review.md:16-25`), plus the deletion test. The vocabulary police (`SKILL.md:14`, `references/html-report.md:107-124`: "Never substitute component, service…") and 4 KB of HTML styling (`html-report.md`) are taste that costs tokens on each review.
- **Evidence:** 6 sessions listed, 0 loads, 0 evals.
- **Fixes:**
  - [med] Not-for mistake-proof, coding and unit-testing at `SKILL.md:10` (prior finding).
  - [low] Cut `html-report.md` to the scaffold plus the card fields (about 40 lines), or let `archify` (installed on this machine) render the report.
- **Keep:** glossary, principles, deepening, design-it-twice and the architecture review (about 60% of the bytes).

### domain-modeling — KEEP (low)
- **Value:** K-decision and House convention.
  - Unprompted: asked to settle "account", the model proposes definitions.
  - Delta: the GLOSSARY.md / GLOSSARY-MAP.md layout (`references/glossary-format.md`), which problem-solving (`SKILL.md:18`) and codebase-design (`architecture-review.md:14`) read. Also "write each term the moment it settles" and the `_Avoid_` lists. Small (3.6 KB).
- **Evidence:** 10 sessions listed, 0 loads, 0 evals.
- **Fixes:**
  - [med] Name catchup in Not-for (`SKILL.md:10`).
  - [low] Drop the ADR fallback (`:18`) in favour of "use adr-writing; otherwise skip the ADR".
  - [low] One positive and one quiet-vs-catchup case.

### docs-meta (bundle) — after consolidation
Today it holds cold-read, v0-rewrite, ssot-consolidate and reorder, and not docs-audit (`docs-meta/.claude-plugin/plugin.json:13-18`). Proposed: `docs-audit` (with ssot) and `adr-writing`. `doc-tidy` and `fresh-eyes` are manual and go to baseline.

### session-meta (bundle) — dissolve after consolidation
Today it holds session-recover, catchup, tunnel-check, lens-review, fact-check and v0-restart (`session-meta/.claude-plugin/plugin.json:13-20`). Every one is merged or deprecated above. Its replacements (handoff with --recover/--catchup, and fresh-eyes) are manual and belong in baseline. A meta with nothing left should go.

## Proposed consolidated shape

| Survivor | Absorbs | Invocation | Home |
|---|---|---|---|
| coding (slim) | | model + coder preload | programming-core |
| problem-solving (slim) | | model + debugger preload | programming-core |
| planning (slim) | v0-restart, the implement-plan worktree rule | model + architect preload | programming-core |
| second-opinion | review-loop's findings-file format | model | user install |
| fresh-eyes (renamed doubt-review) | cold-read, tunnel-check, lens-review, two devils-advocate folds | manual | baseline |
| doc-tidy (renamed v0-rewrite) | debloat, reorder | manual | baseline |
| docs-audit | ssot-consolidate | model | docs-meta |
| handoff | session-recover (script), catchup | manual | baseline |
| modernize | deprecation-migration decision tree | model | user install |
| mistake-proof, codebase-design (slim), domain-modeling, adr-writing, vet, session-retro, experiment-loop, prototype | | as today | as today, plus meta placement fixes |
| deprecated | implement-plan, research, review-loop, devils-advocate, fact-check | | archive/plugins/ |
| leakage-audit | moves to `.claude/skills/skill-evals` (or experiment-loop) | | out of programming-core |

Pointer updates the merges need (from a scan of backtick names in `plugins/*/**/*.md`):
- research is named in coding, fact-check and vet;
- devils-advocate in doubt-review, leakage-audit, lens-review and tunnel-check;
- implement-plan in modernize, planning and review-loop;
- review-loop in implement-plan and second-opinion;
- handoff and session-recover in catchup;
- ssot-consolidate and v0-rewrite in debloat.

problem-solving (12 referrers) and planning (13) stay, so their pointers stay valid.

## Cross-plugin findings

- **[high] Inert negatives on manual skills.** `fact-check/evals/fact-check-quiet-{doubt,trivia}`, `lens-review/evals/lens-review-quiet-{devils,format}`, `tunnel-check/evals/tunnel-check-quiet-{devils,fix}` and `session-recover/evals/session-recover-quiet-{handoff,resume}` each grade `Skill … max: 0` for a skill with `disable-model-invocation: true`, which the Skill tool cannot invoke. That is 8 cases that pass every run and prove nothing, the same class as the V26 graders. Delete them, or turn each into a slash-prompt outcome case. `scripts/plugins.py check` could flag a `max: 0` own-skill grader on a manual skill.
- **[med] Preloads restate and contradict their agents.** The coder (`coding:21` vs `coder.md:6,19`), debugger (`problem-solving:43-54` vs `debugger.md:14`) and architect (`planning:23-25,39-64` vs `architect.md:73`) each carry instructions the agent body overrides. The architect body names what it overrides. The debugger and coder do not. Rule of thumb for the repo: a preloaded skill should hold only what the agent body lacks, and the body should list what it switches off.
- **[med] Two plan-execution systems.** implement-plan (TaskCreate plus a Status block) and orchestration (plan-ledger) do the same job. modernize (`SKILL.md:51`) and planning (`SKILL.md:10`) route to implement-plan, not to the orchestrator or plan-ledger.
- **[med] Default-installed skills that are never chosen.** cold-read, v0-rewrite, ssot-consolidate and catchup had 0 or 1 calls across 2,256 session-listings while in baseline. Their trigger evals pass (+1.00), which only shows that a prompt written to fire them fires them. Real phrasing ("clean up this doc", "what did I miss") is handled by the bare model. This is the strongest sign in the repo that ported process skills do not change behavior on current models unless they are preloaded or typed.
- **[med] Meta placement.**
  - docs-meta omits docs-audit, the docs skill with tooling.
  - programming-core carries leakage-audit (irrelevant) but not mistake-proof or experiment-loop, which problem-solving and coding route to (`problem-solving/SKILL.md:45`, `coding/SKILL.md:49`).
  - prototype, research, modernize, deprecation-migration, devils-advocate, doubt-review and review-loop are in no meta. They were never listed, so the TSV shows nothing either way.
- **[low] Duplicate vocabulary.** The dependency-category table and "one adapter means a hypothetical seam" appear in `coding/references/design-seams.md:19-32` and `codebase-design/references/deepening.md:5-30`. Expand/contract appears in deprecation-migration, db-schema-design, rollout-plan, feature-flags and mistake-proof.
- **[low] Built-in overlap, by plugin.** planning and implement-plan vs plan mode, the Plan agent and the orchestrator. review-loop vs `/code-review --fix`. handoff, session-recover and catchup vs `claude --resume` and compaction (session-recover names `--resume` correctly at `SKILL.md:12`). research vs WebSearch and `deep-research`. debloat vs `/simplify` does not overlap, because `/simplify` is code-only.

## Needs source check

- `second-opinion/SKILL.md:30-36`: the codex models `gpt-6-luna`, `gpt-6.1-sol` and `gpt-6-astra`, the agy models `gemini-3.8-flash-*`, `gemini-4-argon-high` and `gemini-4-hydrogen-xhigh`, "codex CLI 0.162, agy 1.4", and "no `-max` agy model exists". Run `codex debug models` and `agy models`.
- `handoff/SKILL.md:38-45`: `claude --bg`, `--name/-n`, `claude agents`, `attach`, `logs` and `stop` in the current Claude Code (last verified on 2.1.309, per the 10-23 report).
- `modernize/SKILL.md:10`: Anthropic's `code-modernization` plugin in claude-plugins-official.
- `research/SKILL.md:12`: Anthropic's `deep-research` skill availability (moot if research is deprecated).
- `session-retro/references/transcripts.md:7-10`: the transcript layout, `cleanupPeriodDays` default 30, and `CLAUDE_CODE_PROJECT_DIR_NAME` (checked 2026-10-17).
- `codebase-design/references/html-report.md:13,15`: the pinned CDN versions (Tailwind 3.4.17, Mermaid 11.4.1) still resolve.
- Whether a skill with `disable-model-invocation: true` can be preloaded through an agent's `skills:` list. This matters if any preloaded skill is made manual to save listing tokens.
