# Plugin review plan, 2026-11-14

Status (2026-11-14): Phase 0 done on `fix/plugin-review-phase-0`. On `feat/plugin-retire-tooling`: new check rules, `deprecate` and `archive` commands, installer `--prune`, and the value-eval pilot. Deprecated so far: `tanstack`, `accessibility-review`, `privacy-review`, `research` (see `scripts/retired.json`); the other 16 on the list are not yet tested or marked. D1, D2, D3 and D6 decided; D4, D5, D7 and D8 open.

Before archiving the four: sibling skills still point at them in prose and need rewording (`design-critique`, `design-system`, `screen-reader-testing`, `web-design`, `react`, `vue`, `vite`, `web-development`, `threat-model`, `vet`, and any others `grep` finds). `check` does not catch prose pointers.

Source: `docs/research/plugin-review-2026-11-14/` (the brief, eleven family reports G1 to G10, and `plugin-data.tsv`). This plan covers all 273 plugins: the fixes and enhancements to make, and the plugins to deprecate or merge because they do not help Haiku 5.5, Sonnet 5.5 or Opus 5.5 do better work. It replaces the open parts of `docs/plans/plugin-review-fixes.md` (2026-10-23), most of which has landed.

## How the review was done

- Eleven parallel read-only reviewers, one per family, each re-checked the 2026-10-23 findings for its plugins against current code and gave every plugin a verdict against one rubric (`BRIEF.md`).
- Usage evidence: four weeks of `usage-log` data from the owner's machine (733 sessions, 282 interactive, 2026-10-18 to 2026-11-14), joined per plugin in `plugin-data.tsv`.
- Eval evidence: the latest local `claude plugin eval` result for every case that grades an outcome, with and without the plugin.
- The lead re-verified these findings directly against the files: ansible `--check`, the terraform safety list, plan-ledger `verifyChecks: auto`, readonly-agent-gate not installed, the `coding` preload conflict, programming-core membership, the plan-ledger-usage version bump, and the architect model. One reviewer claim was rejected (see "Rejected findings").

### Limits of the evidence

- Usage is one machine. Its daily stack is infrastructure, Forgejo, TypeScript and the orchestration agents. Zero usage for Godot, .NET, JVM and Android means the owner rarely works there, so those families were judged on content.
- Only 23 plugins have an eval that grades results, all on Sonnet 5.5, most at one run. Nothing measures Haiku or Opus. Verdicts marked low confidence below should be settled by the value evals in Phase 2 before anything is archived.
- Depth: every SKILL.md, agent file and script was read. Reference files were read in full for G3a, G5 (second pass, with the exceptions listed in its report) and G9, and sampled for G4, G6 and G8.
- Version and date claims that no primary source settled are collected under "Needs source check" in each family report. They are not in this plan as facts.

## What the evidence says

- 41 of 209 skill plugins were called by a model at least once in four weeks. 132 were visible in at least one session.
- Skills visible in 564 sessions and loaded zero times: cold-read, ssot-consolidate, v0-rewrite. catchup: 564 sessions, one call. These four are leftovers from baseline 0.4.0 and cost about 486 listing tokens in 88% of sessions.
- Manual-only skills never typed in four weeks: debloat, handoff, session-retro (all in baseline), fact-check, lens-review, tunnel-check, session-recover, v0-restart, reorder.
- Agents carry the load: coder 891 calls, reviewer 706, scribe 166, forgejo-shipper 151, architect 133, devops 82.
- Skills that do get called: ansible 46, second-opinion 41, terraform 28, forgejo-actions 16, forgejo-cli 10.
- Outcome evals: of 24 results in 19 plugins, 13 show lift and 9 score the same with and without the plugin (java-testing, kotlin-testing, maven, play-framework, scala, spring-boot, spring-boot-testing, android-device, one ui-direction case). Every lift outside ui-direction is a single run. ui-direction's lift is partly circular, because the judge rubric restates the skill's own rules.
- The listing budget is not the constraint on this machine (median 31 skills per session, 27 of 638 sessions over 75). The cost of a dead skill is its listing tokens and the routing noise, not truncation. Metas near the limit for other users: godot-meta, android-meta, web-meta, java-meta.

## Result in numbers

| | Count |
|---|---|
| Plugins today | 273 |
| Deprecate (archive) | 20 |
| Removed by merging into a sibling | 34 |
| Slim (keep, cut the generic bulk) | 28 |
| Keep with fixes | about 95 |
| Plugins after the plan | about 219 |

## Deprecation list

Reason codes: Generic (current models already do this), Duplicate (a built-in, an official plugin or a sibling covers it), Unused (visible often, never chosen, nothing private in it). "Lost" says what goes away and for which tier, so each call can be overruled.

### Deprecate

| Plugin | Reason | Confidence | Evidence | Lost |
|---|---|---|---|---|
| javascript | Generic | medium | 52 sessions listed, 0 calls, no evals | Nothing for Sonnet or Opus. Move the `require(esm)` and runtime-detection lines to typescript first |
| web-development | Generic | medium | 40 sessions, 0 calls; overlaps api-rest-design, react, e2e-testing | Structure for Haiku |
| tanstack | Generic | low | 21 sessions, 0 calls; the skill itself says to look the API up | Little |
| design-critique | Generic, Duplicate | medium | upstream port; 1 session, 0 calls | Nothing; Anthropic's design plugin covers it |
| design-handoff | Generic, Duplicate | medium | upstream port | Same |
| design-system | Generic, Duplicate | medium | upstream port | Same |
| ux-copy | Generic | medium | 41 sessions, 0 calls; ui-direction carries its CTA and error rules | Nothing |
| file-conversion | Generic | medium | no scripts, no evals, in no meta | Nothing |
| accessibility-review | Generic | low | 41 sessions, 0 calls; uiux-lookup holds the rules | A WCAG checklist for Haiku. Run a value eval first |
| privacy-review | Generic | low | 2 sessions, 0 calls | A PII inventory procedure for Haiku. Run a value eval first |
| game-genres | Duplicate | medium | 891 lines that repeat game-feel, godot-physics, game-architecture, game-design | Move `dialogue.md` and `SKILL.md:29-37` into game-craft |
| agent-router | Duplicate | medium | the engine already lists every agent with its full description; this adds a truncated second copy to every Agent tool description | Nothing. Remove from orchestration-meta |
| implement-plan | Duplicate | medium | orchestration plus plan-ledger do this; 1 call | Nothing for orchestration users |
| review-loop | Duplicate | medium | `/code-review --fix` and second-opinion's dual review | Nothing |
| devils-advocate | Generic | medium | never listed or loaded; 35 KB of textbook behind a forced mode menu | Nothing |
| fact-check | Generic | medium | manual, 0 loads; its evals cannot fail | Nothing |
| research | Generic | medium-low | never listed; built-in web search covers it | A source-quality checklist for Haiku |
| aws-knowledge | Duplicate | medium | its tools are a strict subset of aws-mcp's; 0 calls | Nothing |
| docs-meta | Unused | medium | members listed 564 times, 0 to 1 calls; survivors become manual | A one-step install for doc skills. See D4 |
| session-meta | Unused | medium | members are manual and never typed; they merge into handoff and fresh-eyes | Nothing after the merges |

### Merge (the left-hand plugin disappears)

| Plugin | Into | What moves |
|---|---|---|
| dotnet-performance | dotnet-diagnostics | the measurement gate and BenchmarkDotNet rules; drop the anti-pattern catalog |
| dotnet-template-authoring | nuget | the template checklist as one reference |
| aws-cli | aws | about 25 lines of CLI quirks |
| flag-hygiene | feature-flags | becomes one reference |
| goff-flags, goff-relay-proxy, goff-sdk | one `goff` | all three as references. Deprecate instead if GO Feature Flag is not in use (D6) |
| hubflow, trunk-based | git-flow | hubflow as a reference; about 15 lines of trunk-based. `detection.md` is byte-identical in all three |
| gh-readme, forgejo-readme | one `readme` | one SKILL.md and audit script, one rendering reference per forge |
| forgejo-pr-comments | pr-comments | a Forgejo fetch step; the triage rubric is already a copy |
| forgejo-issues | forgejo-cli | the issue command table (0 calls in 58 sessions while forgejo-cli gets the calls) |
| api-keys | api-oauth-provider | the keys-versus-OAuth gate and the SHA-256 rationale, about 30 lines |
| game-design, game-feel, game-ui, game-audio, game-playtest, game-ai, game-architecture, game-assets, game-prototype, level-design, game-performance | one `game-craft` | 4,079 lines down to about 900 to 1,100. Keep whole: game-ui `accessibility.md`, game-audio loudness targets, level-design `procgen.md`. game-publish stays separate |
| web-perf-auditor (agent) | reviewer or web-development's successor | about 15 lines on not inventing metrics; 0 calls |
| cold-read, lens-review, tunnel-check | doubt-review, renamed `fresh-eyes` (manual) | the "give the reviewer the artifact, never the claim" and "strip the session's framing" rules |
| reorder, debloat | v0-rewrite, renamed `doc-tidy` (manual) | modes of one command |
| catchup, session-recover | handoff | `--catchup` and `--recover` modes; the session-recover script and tests move whole |
| ssot-consolidate | docs-audit | gives "copies of a fact disagree" one owner (closes V30) |
| deprecation-migration | modernize | expand/contract, which four other plugins repeat |
| v0-restart | planning | about 10 lines |
| leakage-audit | the `skill-evals` project skill | it audits evals, it is not a programming aid |

### Slim (keep the private or decision-changing core)

Target is roughly 35 to 60 lines of SKILL.md unless noted. Each family report lists what stays.

- Languages and web: python, rust, typescript, react, fastapi, e2e-testing.
- JVM and Android: java (about 110 lines; drop `review.md`, which duplicates `/code-review`), java-testing, maven, gradle (drop the authoring and caching sections that duplicate gradle-skills), kotlin, kotlin-testing, android, android-device.
- .NET: csharp (about 40 of 83 lines), blazor (about 550 of 1,056 lines with references).
- Infra: promql, grafana-dashboards.
- Forges: gh-issues, gh-repo-setup.
- API and design: api-graphql, api-rest-design, web-design.
- Process: coding (10 KB to about 5 KB), problem-solving, planning, codebase-design.
- Metas: programming-core, web-meta, design-core (see Phase 4).

## Fixes

Severity is the reviewer's, re-checked by the lead where marked (verified).

### Phase 0: do first (correctness and safety)

1. **ansible: `--check` is not safe to run freely** (verified). `plugins/ansible/skills/ansible/SKILL.md:14` lists `ansible-playbook --check --diff --limit <host>` under "Run freely", while `:86` recommends `check_mode: false`, which runs a task for real in check mode, as do `shell` and `command` tasks. Change: before a check run, grep the play and its roles for `check_mode: false`, `shell:`, `command:` and `raw:`; if any are present, say so and ask. This is the most-called skill in the marketplace (46 calls).
2. **terraform: safety contract gaps** (verified). `plugins/terraform/skills/terraform/SKILL.md:14` omits `state push`, `apply -refresh-only`, `taint`, `untaint` and `workspace delete`. It also says to run `init` and `plan` freely, while cloud-ops-guard stopped auto-approving those in 0.3.0 because they execute `data "external"` programs and repo-defined wrappers. Make the skill match the guard: `init` and `plan` are fine in a repo the user owns, and need a look at `external` data sources and the wrapper first in an unfamiliar one.
3. **plan-ledger `verifyChecks: auto`** (verified; decision D1). The default runs recorded check commands without asking, refusing only on an explicit `deny` rule (`plugins/plan-ledger/hooks/register.tsx:686-703`). They run through `$.process.run`, which no Bash guard sees, and an `ask` rule does not stop them. This is the documented design from commit `6b5ada0e`. Recommended change: one approval of a plan's checks at `activate`, keyed by a hash of the checks, asked again only when an amend changes them. Kept as is by D1. Open check: `commandFor` (`hooks/plan/verify.ts:46-48`) single-quotes every argv word before `$.tool.check`, by design (`tests/verify.spec.ts:210`). Under `auto` a deny rule is the only stop, so confirm with one live probe that a `Bash(git push:*)` deny rule still matches `'git' 'push'`. Not changed in Phase 0.
4. **readonly-agent-gate is not installed anywhere by default** (verified). No meta depends on it, and it is absent from this machine, so reviewer, debugger, architect and security-auditor are read-only by instruction only. architect has Write and Edit. Change: add it to orchestration-meta (decision D2).
5. **Agents preload skills from plugins they do not depend on** (G2 high). Spawns against loads: coder 891 versus `coding` 678, architect 133 versus `planning` 64, debugger 47 versus `problem-solving` 11. Change: declare the dependencies in coder, architect, debugger, dba, devops, reviewer and scribe, and add a `check` rule that every `skills:` entry in `agents/*.md` resolves to a declared dependency. Do the preload experiment (Phase 2, item 5) before this lands, because after it the comparison is gone.
6. **orchestration-meta and iac-meta install plan-ledger-usage without plan-ledger**, the plugin that provides the tool. Add `plan-ledger` to orchestration-meta. Replace the 1.2k-token plan-ledger-usage preload in seven agents with about six inline lines that apply only when the brief carries a `plan-ref`.
7. **plan-ledger-usage needs a version bump** (verified): `check --since HEAD~1` fails on it today.
8. **Preload conflicts** (first one verified). `plugins/coding/skills/coding/SKILL.md:21` tells the coder to use AskUserQuestion, which is not in `plugins/coder/agents/coder.md:6`. `problem-solving` steps 7 to 9 (`:43-54`) tell the read-only debugger to fix and commit. Fix both skills, and make `debugger.md:14` name what it skips, as `architect.md:73` does.
9. **Wrong facts confirmed against a primary source:**
   - godot-physics `SKILL.md:89`: `get_global_transform_interpolated()` is Node3D only. Mark it 3D only and give a 2D path.
   - godot `references/version-notes.md:94` and `tool-scripts.md:110`: the `add_dock` deprecation of `add_control_to_dock` is 4.6, not 4.7. Gate the `EditorDock` sample at `tool-scripts.md:85-100`.
   - dotnet-upgrade-guide `SKILL.md:23-24` and six files under `references/net10-to-net11/`, csharp `SKILL.md:16,83`: .NET 11 went GA on 2026-11-10, and .NET 8 and 9 left support the same day (Microsoft support policy, fetched 2026-11-14). Add the end-of-support note and NETSDK1138.
   - dotnet-upgrade-guide `references/test-frameworks/xunit-v3.md:52-53`, `vstest-to-mtp.md:64-79`: xunit.v3 4.x is released; align with `dotnet-testing/SKILL.md:102,105`.
   - prisma `SKILL.md:15-16`: Prisma 8 is `8.0.0-rc.33` on npm, not a release. Say so and give the pin command.
   - play-publishing `references/target-api.md:3-12`: the quoted 2026-08-31 and 2026-11-01 deadlines have passed. Replace the quote with an instruction to fetch the current requirement.
   - android-build `references/upgrades.md:3` hard-codes AGP 9.5.0 with its Gradle and JDK versions, against the file's own rule at `:28`.
   - security-scan `references/vuln-categories.md:27,35,38,44`: OWASP 2025 IDs are wrong.
   - Do not apply the October review's Statsig claim (acquired by Amplitude, 2026-05-05). No source supports it.
10. **esp-idf `templates/scripts/flash.sh:4-5`** claims to check sdkconfig for secure-boot and flash-encryption keys and does not. Make it grep for them and require `ACK_EFUSE=1`.
11. **playwright-cli:** `pw.sh` rejects the dialog-accept and dialog-dismiss verbs that `SKILL.md:54` tells the model to run. Add them to the allowlist.

#### Phase 0 status, 2026-11-14

Done on branch `fix/plugin-review-phase-0` (uncommitted until the owner asks): items 1, 2, 7, 8, 9, 10 and 11, and the `plan-ledger` dependency from item 6. Seventeen plugins bumped and mirrored into `marketplace.json`; `check`, `check --since main`, `claude plugin validate --strict` on all seventeen, and the esp-idf, playwright-cli and security-scan tests pass.

Not done, by decision or on purpose:
- Item 3 (D1: keep `auto`) and item 4 (D2: stays opt-in).
- Item 5, agent skill dependencies: waits for the preload experiment.
- Item 6, second half: replacing the plan-ledger-usage preload in seven agents with inline lines.

Open after Phase 0:
- The ansible fix differs from the review's wording, after checking docs.ansible.com: `shell`, `command`, `raw` and `script` tasks are skipped in check mode, so only `check_mode: false` and legacy `always_run` force a question. The other four are named to the user, not asked about.
- terraform: that `plan` runs `data "external"` programs is inferred from the external provider docs, not stated on the `plan` page. OpenTofu behaviour for `taint`, `untaint`, `state replace-provider` and `workspace delete` rests on the Terraform docs.
- godot-physics: the docs give a manual camera recipe for 3D only. The skill now says to leave a `Camera2D` on automatic interpolation and test at 10 ticks per second; no source gives a 2D recipe.
- security-scan: `postMessage` without an origin check is mapped to A08 by judgement (OWASP maps the parent CWE-345 there, and CWE-346 nowhere). The IDs on lines 28 to 30, 32 to 34, 36, 37 and 40 to 43 were not each re-checked against their CWE.
- dotnet-testing `SKILL.md:102` still claims xunit.v3 4.x needs `xunit.v3.mtp-off` or the `global.json` runner on the .NET 10 SDK. xunit.net does not say so. Needs a source check.
- dotnet-upgrade-guide: the net10-to-net11 references are still the Preview 3 checklists, now labelled as such. They need a pass against the GA breaking-changes page.
- android-build `references/upgrades.md`: the version numbers were removed and replaced with a pointer; the pointed-to page was not fetched.
- ansible has no LICENSE file and no `license` field (`validate --strict` notes it, exit 0).
- `feedback-loops.md:18` in problem-solving has no fix-or-commit instruction; that part of the review finding did not hold.

### Phase 1: guards and mods (G1)

- check-bypass-guard: `flock`, `ionice`, `unshare`, `systemd-run`, `chrt`, `taskset` and `npx -y` wrappers hide `git commit --no-verify` (`scripts/git-bypass.ts:38-51`). NotebookEdit is not covered. Build the shared wrappers table that F7 asked for, in `scripts/shared/`, and use it in all three guards.
- cloud-ops-guard: `parallel` gets no verdict; AWS access-loosening commands are only partly covered. Fix `scripts/tests/check.sh:29-30`, which sets HOME to a temp directory and breaks the mise bun shim, so 824 of 829 cases fail on this host while the guard itself is fine.
- readonly-agent-gate: `zip`, `7z`, `xxd -r`, `gcc -o`, `cmake -B`, `vim -es` and `ed` still write outside scratch.
- bash-rules: the `kill` and `rsync` gaps, scan caching, and the two wall-clock timing tests.
- consult: restrict agy read paths; complete the secret-file list.
- usage-log: `promptText` logs prompt text by default. Make it opt-in or redact (decision D7).
- mcp-health: a hook deny is counted as a server failure.
- cache-clock: the default TTL suits API keys, not a subscription. turn-stats: the toast text does not match the description.
- The remaining F9 leftovers are listed in `G1-hooks-mods.md`.

### Phase 2: tooling, evals and the deprecation mechanism (G10)

This phase comes before any archive step, because no mechanism exists today and archiving a plugin that `examples/claude-settings/settings.global.json` enables aborts `scripts/install.mjs:243`.

1. **`plugins.py deprecate <plugin> [--into <plugin>]`:** adds the plugin to a `DEPRECATED` table, prefixes its description with "Deprecated", removes it from metas and example settings, and bumps the metas.
2. **`plugins.py archive <plugin>`**, one release later: moves the directory to `archive/plugins/`, drops the marketplace entry, regenerates the catalog. Add a `retired` list to the installer behind `--prune`, because `mergeSettings` never removes keys.
3. **New `check` rules** (done 2026-11-14 on `feat/plugin-retire-tooling`, 17 new tests; the one real defect they found, the sentry-mcp-self-hosted `.mcp.json` shape, is fixed)**:** example-settings plugin ids resolve; agent `skills:`, `model:` and `tools:` values are valid; no duplicate marketplace entry; `hooks.json` and `.mcp.json` parse against their shape; `references/` links in SKILL.md resolve; no live path points at a missing `archive/plugins/<x>`. Keep `archive/plugins/{coremods,git,api,coding-js,sentry-core}`: twelve live skill references and `CLAUDE.md` cite them.
4. **`plugins.py budget`:** sums description sizes per meta closure, warns on a closure near the listing budget and on descriptions over 500 characters (23 of 190 today; goff-sdk is 914). Calibrate the constant from usage-log `listing` lines where `included < total`.
5. **Preload experiment (free):** done 2026-11-14, see `docs/research/plugin-review-2026-11-14/preload-experiment.md`. Result: the existing logs cannot answer it. Whether an agent ran with its preload depended on install state, which tracks project, date and task type, and there is no outcome grade. What is solid is the cost: each preload adds a median of about 10k characters (coding), 7k (planning) or 9k (problem-solving) to every spawn. Consequences: Phase 0 item 5 (agent skill dependencies) stays on hold; slim the three preloaded skills as planned; a controlled test (15 to 20 bounded coder tasks run with the skill on and off, 40 to 60 runs) is a separate spend outside the D3 budget. usage-log should record `agentId` on `skill` records: only 44% of preload records could be joined to an agent.
6. **Value evals:** one "trap" outcome case per plugin whose verdict is low confidence or rests on K-decision value. Mostly `regex` and `file_exists` graders, at most one `llm` grader, 3 runs, model pinned, run per tier. Run the no-plugin arm first on Haiku and Sonnet: a 3 of 3 baseline pass is deprecation evidence without spending on the with-plugin arm. Estimated cost about $1.70 per plugin for three tiers, $100 to $150 for 111 plugins including authoring (the Haiku figure is an assumption). Start with the low-confidence rows in the deprecation table, the SLIM list, and the Godot family, which has 82 routing cases and no outcome case. Decision D3 sets the budget.
7. **Eval honesty:** delete the eight cases that cannot fail (fact-check, lens-review, tunnel-check, session-recover: `Skill max: 0` on manual-only skills) and agent-instructions' `not-skill-authoring.md`. Harden cases the baseline passes because the prompt leaks the answer (junit-clock, runtest-virtual-time, play-migrate-3). Replace ui-direction's `judged-page.md` rubric with criteria that do not restate the skill. Set `runs: 3` and pin a model on the 32 unpinned cases; fix `skill-evals/SKILL.md:49`.
8. **`usage-report.ts --plugins [--repo PATH]`:** emits the usage columns of `plugin-data.tsv`, so the next review needs no ad hoc script. About 150 lines plus a spec.
9. **CI:** add the other 15 spec directories (plan-ledger alone has 13 specs) to `.github/workflows/check.yml`. Add a local pre-push script for `claude plugin validate --strict`.
10. **Docs:** mark `plugin-review-fixes.md` rows V1 to V32 with their real status (it still shows 29 open); add a Status line to paperthin-ports, consult-flexible-server, context7-grep-app, android-meta, aws-meta and forgejo-meta; remove cloud-ops-guard from `docs/plans/aws-meta.md:140,179`. Remove the five hard-coded `/home/buck` paths in the mod-authoring references.

### Phase 3: per-family fixes

Each bullet is the family's medium findings. Low findings and the per-plugin detail are in the family report.

- **Languages, web, testing (G3a).** Add the missing newer facts that justify the kept skills: Python 3.14, TypeScript 6 and 7, Rust edition and `#[expect]`, `require(esm)` and type stripping, Go's Green Tea GC. Resolve the unit-testing and test-gap-audit collision on "is this covered" (`SKILL.md:3` in both; unit-testing's description is 623 characters) and add a paired `evals/testing` suite. Escape `PACKAGES_ROOT` in ts-module-boundaries. Remove dated lines (golang-cli `:12`, termwright `:10`, `prisma-7.md:3,77`).
- **JVM and Android (G3b).** Shorten the seven descriptions over 500 characters (scala 759, spring-boot-testing 758, java 675, spring-boot 647, gradle 640, java-testing 602, maven 538) and add held-out cases, since the descriptions restate the paired-suite prompts. android-performance and play-publishing point at android-skills by name and dangle in a direct install: add "if installed". Surface the Metals install prerequisites before the first `.scala` edit. Reconcile the two gradle-skills pins (86e4ee5 and b26b149).
- **.NET (G4).** Add dotnet-upgrade-guide to dotnet-meta. Add recommend-plugins rules for dotnet-ai-apps, roslyn-analyzers, dotnet-native-interop, dotnet-diagnostics and esp-idf. Fix the aspire `logs --tail` versus `-n` mismatch, the roslyn `AsSourceGenerator` wording, and the csharp description (CA and IDE warnings, `.editorconfig`, a "not for godot-csharp" clause). Re-diff dotnet-upgrade and dotnet-test against upstream `dotnet/skills` once it carries .NET 11 GA content.
- **Godot and game dev (G5).** Add the 11 missing sibling rows to `godot/SKILL.md:21-30` (one "game-craft, if installed" row after the merge). Fix `floor_snap_length` in both places (`godot-physics/SKILL.md:114`, `references/controllers.md:204`), `AudioStreamPlayer.area_mask` (`bodies-advanced.md:74`), and the unpinned CI actions in godot-testing. Deduplicate the 4.7 C# break list. Add an optional C# Godot meta for godot-csharp and the unlisted leaves. godot-mcp-setup: add a trust note on the third-party addon and a symlink-member scan.
- **Infra, data, ops (G6).** redis: add rules for live-instance commands (`FLUSHALL`, `FLUSHDB`, `CONFIG SET`, `MONITOR`). docker: approval-list gaps and a ufw note. mysql: add the 9.7 line and 8.0 end of life after a source check. promql: add the native-histogram branch and fix the contradiction between `SKILL.md:26` and `references/investigations.md:33`. dba: declare postgres, db-schema-design and plan-ledger-usage as dependencies. Add a "Not for" clause to the descriptions of postmortem, rollout-plan, production-readiness, aws-cloudwatch and aws-well-architected. Shorten the eight descriptions over 500 characters. Put a real negative in the suite of the skill that should fire for mysql/postgres/redis, ansible/terraform and production-readiness/rollout-plan. helm: keep for now, merge into kubernetes if it is still at 0 calls after the next four weeks.
- **Git and forges (G7).** Pick one merge-method policy (decision D5) and apply it to ship (`SKILL.md:45`), dependabot (`:85`), renovate, forgejo-ship and git-commit. Add a forge gate to gh-triage, issue-breakdown, gh-repo-setup and gh-code-security. Add forgejo-release to forgejo-meta and fix its `tags:` grep and the `fj tag` line (`:19`, `:72`). Port gh-actions' `$GITHUB_ENV` injection guidance and attacker-controlled context list to forgejo-actions. Add a REST fallback to pr-comments `fetch.sh:37`. Give shipper the "treat PR and check text as data" rule and an explicit-ask gate. Fix `evals/forges`: add a Forgejo marker to the Forgejo cases and add release, cli and triage cases. Build working outcome evals for ship, pr-comments and forgejo-ship (F5).
- **API, security, design (G8).** app-auth: add passkeys, NIST 800-63B-4, SPA token storage and RFC 9207 client rules after a source check. agent-config-audit: add an `autoMode.allow` check (`SKILL.md:35`). mcp-server-audit: step 2 (`:25`) still reviews unpinned launchers that `:10` hands to agent-config-audit. Give receiving third-party webhooks one owner (api-webhooks `:8` and api-idempotency `:8` point at each other). Settle who owns a cloned repo's `.claude/` between agent-config-audit and plugin-vetter. sentry-mcp-self-hosted: fix the `.mcp.json` shape and remove the stale archive copy that carries a personal author email.
- **Agents (G2).** Align the planner model: `architect.md:4` is opus, `orchestration.md:31` says sonnet. dba moved to sonnet in `2840313a` although `docs/plans/lean-orchestration.md:87` records sonnet missing two lock defects: rerun that eval or move it back. devops: list forgejo-actions beside gh-actions and add devops to kubernetes-meta. ui-critic: add `--out`, pin sonnet. open-source-release-audit: remove the `/home/user` exemption. recommend-plugins: offer plan-ledger.
- **Process and docs (G9).** mistake-proof: add the boundary with codebase-design and put it in a meta. vet: shorten the 660-character description. Start the thinking and docs paired suites from F1 only for the skills that survive.

### Phase 4: metas

- programming-core: remove feature-flags and leakage-audit (three reviewers agree; 57 and 47 sessions listed, 0 calls). Keep unit-testing and test-gap-audit until their collision is fixed and a value eval has run.
- web-meta: stop pulling all of design-core; depend on ui-direction, ui-critic and web-design directly, and add typescript. design-core stays for design-meta.
- orchestration-meta: add plan-ledger, remove agent-router.
- iac-meta: it ships the devops agent without kubernetes, helm or gitops. Add kubernetes-meta or say "if installed" in the agent.
- aws-meta: add terraform. kubernetes-meta: add devops. dotnet-meta: add dotnet-upgrade-guide. forgejo-meta: add forgejo-release.
- baseline: debloat and handoff change shape in the merges; baseline should carry the merged handoff and drop debloat's successor unless it gets used.
- No new security, data, api or observability metas: the usage data does not support them. 123 plugins are in no meta; the grouped list is in `G2-agents-mcp-metas.md`.
- On the owner's machine: uninstall cold-read, ssot-consolidate, v0-rewrite and catchup, which are baseline 0.4.0 leftovers. That saves more listing tokens than any meta change.

## Order of work

```
Phase 0 (fixes that prevent harm or wrong answers)
  -> Phase 2 items 1 to 5 (mechanism, check rules, budget, preload experiment)
  -> Phase 1 (guards) and Phase 3 (family fixes), in parallel by plugin tree
  -> Phase 2 items 6 to 8 (value evals on the low-confidence rows)
  -> merges and slims, one family per change set
  -> deprecate step for the Deprecate table, then Phase 4 metas
  -> archive step one release later
```

House rules for every change set: `python3 scripts/plugins.py check` and `check --since <ref>`, `claude plugin validate --strict` on touched plugins, version bumps in `plugin.json` mirrored into `marketplace.json`, `scripts/plugins.py catalog`, Conventional Commits with explicit paths. `marketplace.json` is edited by one integrator step per group, as in the October plan.

## Decisions for the owner

- **D1. plan-ledger checks.** Decided 2026-11-14: keep `auto` as it is. Phase 0 item 3 is reduced to checking the argv-quoting concern. Options were one approval per plan at `activate`, or default to `ask`.
- **D2. readonly-agent-gate.** Decided 2026-11-14: leave it opt-in. `plugins/orchestration/README.md:11` already says so; no change. Phase 0 item 4 and the Phase 4 line that adds it to orchestration-meta are dropped.
- **D3. Value-eval budget.** Decided 2026-11-14: (a), about $40. Scope is the low-confidence deprecations and the SLIM list, on Sonnet and Haiku. Stop and report if spend reaches $40. Options were (b) about $100 to $150 for all 111 trigger-only plugins on three tiers, and (c) none.
- **D4. docs-meta.** (a) Deprecate with session-meta (recommended; survivors are manual commands installed directly). (b) Rebuild it as docs-audit, doc-tidy and fresh-eyes.
- **D5. Merge-method policy.** (a) Follow the repo's default merge method everywhere (recommended; renovate and forgejo-ship already do). (b) Squash. (c) Rebase.
- **D6. GO Feature Flag.** Decided 2026-11-14: in use. Merge the three goff plugins into one `goff`.
- **D7. usage-log prompt text.** (a) Off by default (recommended). (b) On, redacted. (c) Leave as is.
- **D8. Game-craft.** (a) Merge 11 plugins into `game-craft` (recommended). (b) Deprecate game-genres, game-performance and game-design and keep the other nine separate.

## Rejected findings

- G3a claimed the react `stance-react-measure-first` and unit-testing `testing-observable-behaviour` lifts are inflated because their cases carry a "skill fired" grader that cannot pass without the plugin. The result files show eight cases with the same grader scoring 1.0 in the no-plugin arm, so that grader is not counted there. The lifts stand as measured, at one run each.
- G1 rated plan-ledger's `auto` mode as a defect. It is the documented design (`plugins/plan-ledger/README.md:93,111`). It is carried here as decision D1.

## Risks

- **Deprecating on thin data.** Usage is one machine and evals are one model. Mitigation: the two-step retire, value evals on every low-confidence row, and "Lost" stated per plugin.
- **Merges change skill names**, which breaks agent preloads, meta dependencies, eval graders and users' settings. Mitigation: the new `check` rules land first, and the installer gets a `retired` list.
- **Slimming removes a line a weaker model needed.** Mitigation: run the Haiku baseline arm on the skill's trap case before and after.
- **Guard fixes add prompts.** Each guard change ships with must-pass cases, as in the October plan.
