# efficient-split — spec and plan

Status: planned, 2026-10-03. Decisions D1–D17 settled 2026-10-03. Slices 1–4 in progress. Pre-split SHA: `a1efff3` (main, in sync with `origin/main`).

## Goal

Split `efficient` (0.2.1, 31 skills) into `efficient-core` plus language and domain plugins. Dissolve `quality` (12 skills) into the plugins that own its topics. Move the testing skills from `efficient` and `quality` into a new `efficient-testing` plugin. Move six situational plugins from user scope to per-project local scope. A project then enables only the plugins it uses.

## Done when

- The marketplace lists 11 `efficient-*` plugins, no `efficient`, and no `quality`.
- `claude plugin validate --strict` passes for the marketplace and for every new or changed plugin.
- No old name survives outside the records. Both of these return nothing:
  - `rg -n 'efficient:[a-z]' plugins docs/plugins README.md --glob '!**/evals/results/**'`
  - `rg -n 'quality:[a-z]' plugins docs/plugins README.md --glob '!**/evals/results/**'`
- Every moved eval case loads its plugin, meaning no `plugin_errors` in the trace init. No positive grader that fired in its last recorded run stops firing. A case that flips gets re-run with `--runs 3` before anyone draws a conclusion.
- The script tests pass from their new paths.
- After cutover, `claude plugin details <name>` for each installed plugin lands within ±10% of the plugin-map estimate. A fresh session lists the new names and no `efficient:*` or `quality:*`. `architect`, `coder`, `coder-max`, `review`, and `quick-review` load their preloaded skills.
- The `/context` Skills row per profile is recorded as a measurement, not a pass/fail gate. Key reordering was declined (D14), so descriptions may still drop while the listing is saturated.

## Findings that shape the plan

1. **`quality` has never loaded in any eval run.** `plugins/quality/.claude-plugin/plugin.json` declares `"dependencies": ["efficient"]`, and the eval sandbox loads only the plugin under test.
   - One run of `trigger-test-gap-audit-1` showed `plugin_errors: [{"plugin":"quality@inline","type":"dependency-unsatisfied", …}]` in the trace init, and no `quality:*` skills in the skill list.
   - Across every stored result, `quality`'s positive graders fired 0 of 81 times. Plugins without dependencies all fire (efficient 126, git 60, authoring 48, api 28).
   - The two open items in `adoption-followups.md` (`quality:test-gap-audit` and `quality:agent-config-audit` not loading from short prompts) were never measured. The reverted description tuning was tested against a plugin that wasn't loaded.
2. **Plugin skills ignore `skillOverrides`.** Plugin boundaries are the only per-project switch.
3. **Only two skill bodies hard-load a skill in another plugin.**
   - `quality/skills/test-harness/SKILL.md:25`: "Load `efficient:testing` and follow it".
   - `quality/skills/audit/SKILL.md:48`: "Auth fixes: load `efficient:auth` and follow it".
   - Every other reference is a "Not for (x)" routing pointer.
4. **The live marketplace is this checkout.** `adminhead` is a directory marketplace at this repo. Whatever main holds is what new sessions load.
5. **Eval cases can't span plugins.** A case's `plugins:` paths can't leave the plugin (skills-to-plugins Slice 6). A routing negative across two plugins can't fail.
6. **Reference counts.**
   - In the repo: 320 `efficient:` and 81 `quality:` occurrences in `plugins/`, `docs/plugins/`, and `README.md` (results, plans, research excluded). 59 name core skills. About 23 `quality:` references sit outside the quality plugin (skills, evals, `docs/plugins/{authoring,efficient}.md`, `README.md`); re-derive with `rg -n 'quality:[a-z]'` in Slice 2.
   - Outside the repo, `~/.claude/agents/{architect,coder,coder-max}.md` preload `efficient:planning`, `efficient:coding`, `efficient:problem-solving`. `architect.md` (lines 3, 9, 21), `review.md` (3, 8, 16), and `quick-review.md` (8, 16) reference `quality:second-opinion`.
   - `~/Projects/rovitracker/platform/.claude/settings.local.json` enables `efficient@adminhead` and `quality@adminhead`.
7. **Checks available.** No CI. Checks are `validate --strict`, `claude plugin eval`, the pytest suites in `quality/skills/{test,test-gap-audit,audit}/tests` (the `audit` suite has 36 passing tests), `quality/skills/test-harness/tests/check.sh`, and `quality/skills/second-opinion/tests/check.sh` (offline, stubs codex and agy). All resolve paths relative to their skill dir. System Python lacks pytest, so run pytest with `uvx pytest -p no:cacheprovider`.
8. **`claude plugin details` takes only an installed plugin name.** Token cost can be measured only after install.
9. **Description headroom.** Longest is `react` at 781 characters, against a 1024 limit.
10. **The skill listing overflows its cap today.** `skillListingBudgetFraction` defaults to 0.01, about 9.9k tokens on Opus 1M and about 2k on 200k-context models. Demand from enabled skills is about 24k. Over the cap, Claude Code keeps every name and drops descriptions, least-used skills first.
    - With usage tied (all adminhead skills at 0×), `enabledPlugins` key order breaks the tie, and local-scope plugins list last. In a fresh session every `quality:*` and `efficient:*` entry is a bare name.
    - Per-project install therefore decides which descriptions stay visible. It lowers per-turn tokens only once demand drops below the cap.
    - Eval sandboxes load one plugin, so stored fire rates don't reflect saturated sessions.
    - UNCONFIRMED: whether agent preloads count as uses. Renamed skills likely start with no history. Settle with `/skill-doctor` a day after cutover.
11. **Manual-only skills cost nothing in the listing.** `audit` lists at 0, not ~130. `efficient-testing:run` and `:harness` likewise, so `efficient-testing` lists at 560, not 690, and `efficient-security` lists at ~460, not ~590.
12. **Negatives aimed at manual-only skills can't fail.** `trigger-agent-config-audit-1/2` negate `quality:audit`; `test-gap-audit-routing` and `trigger-test-gap-audit-1/2` negate `quality:test-harness`. The test-gap negatives point at `efficient-testing:unit` after the move. The agent-config-audit negatives become `not-config-audit`.
13. **A missing preload fails silently.** `architect`, `review`, and `quick-review` preload `quality:second-opinion`. The skill must stay model-invocable and live in a user-scope plugin, so it goes to `efficient-core` (D9).
14. **`quality` is not a routing cluster.** Only `privacy-review` → `threat-model` and `poka-yoke` → `second-opinion` make fail-able negatives inside it. The real competitors cross plugins today: `agent-config-audit` ↔ `authoring:config-audit`, `click-path-audit` ↔ `efficient:react`, `production-readiness` ↔ `infra:rollout`, `efficient:problem-solving` → `poka-yoke`. After the split, the first three pairs are same-plugin and become evaluable.
15. **Two more test suites.** `quality/skills/audit/tests` and `quality/skills/second-opinion/tests/check.sh` were missing from the earlier check list. Both move and run in Slice 4.

## Decisions

| Topic | Decision |
| --- | --- |
| Grouping rule | Core holds process skills. A language plugin holds a language with its tooling and frameworks. A domain plugin holds cross-language domain skills. Dense routing clusters stay in one plugin so their evals stay live |
| Dependencies | None anywhere. Cross-plugin references say "if installed". `audit`'s auth step becomes "load `efficient-auth:auth`, if installed, and follow it" |
| `efficient-testing` contents | `efficient:testing`, `efficient:e2e-testing`, `quality:test`, `quality:test-harness`, `quality:test-gap-audit`. The only hard cross-plugin edge becomes internal |
| `efficient-shell` scope | `bash` today. Home for future zsh and shell-specific test framework skills (e.g. bats) |
| `quality` | Removed entirely. Its 12 skills go to `efficient-testing`, `efficient-core`, `efficient-security`, `authoring`, `efficient-js`, and `infra` |
| Versions | New plugins start at 0.1.0 (`efficient-security` included). `authoring` 0.2.1 → 0.3.0, `infra` 0.1.0 → 0.2.0, `aws` 0.1.0 → 0.1.1 (reference edit). `accessibility`, `api`, `github`, `playwright-cli` get a patch bump for reference-only edits. Bump `plugin.json` and the marketplace entry together |
| Records | `docs/plans/**` and `docs/research/**` keep the old names |
| Docs | `docs/plugins/efficient.md` becomes one family page for all `efficient-*` plugins with the old-to-new table and per-profile install table. Delete `quality.md`. Update `authoring.md`, `infra.md`, `api.md`, `playwright-cli.md`, and the README (20 → 29 plugins) |
| Work location | Branch `efficient-split` in a worktree under `.claude/worktrees/`. Main stays untouched until cutover. Coders get absolute worktree paths |
| Moves | `git mv` only |

### Settled decisions

| # | Question | Decision |
| --- | --- | --- |
| D1 | Core plugin name | `efficient-core` |
| D2 | react, vue, vite, tanstack | `efficient-js` |
| D3 | Skill names | Prefix-only change, except inside `efficient-testing`: `unit`, `e2e`, `run`, `harness`, `gap-audit` |
| D4 | Testing plugin | `efficient-testing`, holding all 5 testing skills |
| D5 | Bash | Own plugin, `efficient-shell` |
| D6 | auth, better-auth | Own plugin, `efficient-auth` |
| D7 | `efficient` after the split | Remove it |
| D8 | Install scopes | `efficient-core`, `efficient-testing`, and `authoring` at user scope; language and domain plugins with `--scope local` per project |
| D9 | second-opinion, anti-slop, poka-yoke | `efficient-core`. second-opinion is preloaded by three agents and needs a user-scope home; the other two are used in every project |
| D10 | audit | `efficient-security`, manual-only, so the command becomes `/efficient-security:audit`. The user chose this over the recommended `efficient-core`. Every reference from another plugin says "if installed" |
| D11 | production-readiness | `infra`. Its competitor `infra:rollout` becomes a same-plugin eval pair |
| D12 | agent-config-audit | `authoring`. Its competitor `authoring:config-audit` becomes a same-plugin eval pair. `authoring` stays at user scope |
| D13 | click-path-audit | `efficient-js`. Its competitor `react` becomes a same-plugin eval pair |
| D14 | Listing budget | Of the levers, only move situational plugins to local scope. `api`, `aws`, `infra`, `observability`, `sentry`, and `tooling` move from user scope to per-project `--scope local`. `github` stays at user scope. Declined levers are under Rejected alternatives |
| D15 | Other installers of the GitHub remote | None; only the user installs. No `efficient` bundle alias |
| D16 | Paid evals | Approved within a $5 total cap for Slices 4 and 6, with `--trust-plugin` for new adminhead plugin dirs |
| D17 | Plan commit | First commit on branch `efficient-split`; main untouched until cutover |

## Plugin map

Token figures are always-on estimates summed from today's per-skill `claude plugin details` figures. Figures marked `~` are derived, not measured.

| Plugin | Skills | ~tok (details) | ~tok (listing) |
| --- | --- | --- | --- |
| `efficient-core` | coding, planning, problem-solving, research, prototype, experiment-loop, modernize, second-opinion, anti-slop, poka-yoke | ~2,100 (1,530 + 170 + 160 + 240) | ~2,100 |
| `efficient-shell` | bash | 210 | 210 |
| `efficient-go` | golang, golang-cli, golang-performance | 680 | 680 |
| `efficient-python` | python, python-packaging, fastapi | 520 | 520 |
| `efficient-js` | javascript, typescript, react, vue, vite, tanstack, click-path-audit | ~1,440 | ~1,440 |
| `efficient-rust` | rust | 150 | 150 |
| `efficient-web` | web-development, web-design | 350 | 350 |
| `efficient-auth` | auth, better-auth | 460 | 460 |
| `efficient-db` | database-design, postgres, mysql, redis | 810 | 810 |
| `efficient-testing` | unit, e2e, run, harness, gap-audit | 690 | 560 |
| `efficient-security` | threat-model, privacy-review, audit | ~590 (230 + 230 + ~130) | ~460 (audit lists at 0) |
| `authoring` 0.3.0 | 8 existing + agent-config-audit | ~1,873 | ~1,770 |
| `infra` 0.2.0 | 7 existing + production-readiness | ~1,741 | ~1,740 |

Today every project pays about 8,445 tokens (efficient 6,349 + quality 2,096). The user-scope baseline after the split is `efficient-core` + `efficient-testing` + `authoring`, about 4,660 by details. `git` (710), `ripgrep` (90), and `github` are already at user scope and are not recomputed here. The profiles below add local plugins to the baseline and leave out those three and the D14 plugins unless named.

| Profile | Plugins | After (details) |
| --- | --- | --- |
| Rust CLI | baseline, rust | ~4,810 |
| Go service with Postgres | baseline, go, db | ~6,150 |
| FastAPI with Postgres and auth | baseline, python, web, auth, db | ~6,800 |
| rovitracker (Go + TS, UI, Postgres, auth, scripts, infra) | baseline, go, js, web, auth, db, shell, security, infra | ~10,940 |

### Where each quality skill went

| Skill | Listing tok | Kind | Home | Reason |
| --- | --- | --- | --- | --- |
| second-opinion | 170 | model | `efficient-core` | Preloaded by architect, review, quick-review; needed in every project |
| anti-slop | 160 | model | `efficient-core` | Used in every project |
| poka-yoke | 240 | model | `efficient-core` | Used in every project; `problem-solving` SKILL.md:37 points at it |
| audit | 0 | manual | `efficient-security` | Security scan; D10 |
| threat-model | 230 | model | `efficient-security` | Same-plugin neighbour of `audit` and `privacy-review` |
| privacy-review | 230 | model | `efficient-security` | Same-plugin neighbour of `threat-model` |
| agent-config-audit | 220 | model | `authoring` | Neighbour `config-audit` becomes same-plugin |
| click-path-audit | 180 | model | `efficient-js` | Neighbour `react` becomes same-plugin |
| production-readiness | 220 | model | `infra` | Neighbour `rollout` becomes same-plugin; `aws:architecture-review` points at it |

## Mapping: skill → new plugin → new name

| Old | New plugin | New name |
| --- | --- | --- |
| `efficient:coding` | `efficient-core` | `efficient-core:coding` |
| `efficient:planning` | `efficient-core` | `efficient-core:planning` |
| `efficient:problem-solving` | `efficient-core` | `efficient-core:problem-solving` |
| `efficient:research` | `efficient-core` | `efficient-core:research` |
| `efficient:prototype` | `efficient-core` | `efficient-core:prototype` |
| `efficient:experiment-loop` | `efficient-core` | `efficient-core:experiment-loop` |
| `efficient:modernize` | `efficient-core` | `efficient-core:modernize` |
| `efficient:bash` | `efficient-shell` | `efficient-shell:bash` |
| `efficient:golang` | `efficient-go` | `efficient-go:golang` |
| `efficient:golang-cli` | `efficient-go` | `efficient-go:golang-cli` |
| `efficient:golang-performance` | `efficient-go` | `efficient-go:golang-performance` |
| `efficient:python` | `efficient-python` | `efficient-python:python` |
| `efficient:python-packaging` | `efficient-python` | `efficient-python:python-packaging` |
| `efficient:fastapi` | `efficient-python` | `efficient-python:fastapi` |
| `efficient:javascript` | `efficient-js` | `efficient-js:javascript` |
| `efficient:typescript` | `efficient-js` | `efficient-js:typescript` |
| `efficient:react` | `efficient-js` | `efficient-js:react` |
| `efficient:vue` | `efficient-js` | `efficient-js:vue` |
| `efficient:vite` | `efficient-js` | `efficient-js:vite` |
| `efficient:tanstack` | `efficient-js` | `efficient-js:tanstack` |
| `efficient:rust` | `efficient-rust` | `efficient-rust:rust` |
| `efficient:web-development` | `efficient-web` | `efficient-web:web-development` |
| `efficient:web-design` | `efficient-web` | `efficient-web:web-design` |
| `efficient:auth` | `efficient-auth` | `efficient-auth:auth` |
| `efficient:better-auth` | `efficient-auth` | `efficient-auth:better-auth` |
| `efficient:database-design` | `efficient-db` | `efficient-db:database-design` |
| `efficient:postgres` | `efficient-db` | `efficient-db:postgres` |
| `efficient:mysql` | `efficient-db` | `efficient-db:mysql` |
| `efficient:redis` | `efficient-db` | `efficient-db:redis` |
| `efficient:testing` | `efficient-testing` | `efficient-testing:unit` |
| `efficient:e2e-testing` | `efficient-testing` | `efficient-testing:e2e` |
| `quality:test` | `efficient-testing` | `efficient-testing:run` (`/efficient-testing:run`) |
| `quality:test-harness` | `efficient-testing` | `efficient-testing:harness` (`/efficient-testing:harness`) |
| `quality:test-gap-audit` | `efficient-testing` | `efficient-testing:gap-audit` |
| `quality:second-opinion` | `efficient-core` | `efficient-core:second-opinion` |
| `quality:anti-slop` | `efficient-core` | `efficient-core:anti-slop` |
| `quality:poka-yoke` | `efficient-core` | `efficient-core:poka-yoke` |
| `quality:audit` | `efficient-security` | `efficient-security:audit` (`/efficient-security:audit`) |
| `quality:threat-model` | `efficient-security` | `efficient-security:threat-model` |
| `quality:privacy-review` | `efficient-security` | `efficient-security:privacy-review` |
| `quality:agent-config-audit` | `authoring` | `authoring:agent-config-audit` |
| `quality:click-path-audit` | `efficient-js` | `efficient-js:click-path-audit` |
| `quality:production-readiness` | `infra` | `infra:production-readiness` |

### Cross-plugin references that need "if installed"

`audit` now lives in `efficient-security`, so these point at it conditionally.

- `authoring:agent-config-audit`
- `infra:production-readiness`
- `efficient-testing:gap-audit`
- `efficient-go` `golang/references/security.md`
- `github:code-security`

`threat-model` and `privacy-review` are same-plugin references. `audit`'s own body loads `efficient-auth:auth`, if installed. `aws:architecture-review` points at `infra:production-readiness`, if installed.

## Evals

Each case moves with its positive skill. Rewrite every grader to the exact new name. Prefix-agnostic negatives such as `(?:[\w-]+:)?testing` would pass vacuously against `efficient-testing:unit`.

| Destination | Cases |
| --- | --- |
| `efficient-core` | coding-feature, experiment-loop-vs-problem-solving, problem-solving-flaky, prototype-vs-planning, trigger-problem-solving-1/2 |
| `efficient-shell` | bash-vs-coding. Its `coding` negative now crosses plugins and can't fail |
| `efficient-go` | golang-cli-vs-golang, golang-performance-vs-golang, trigger-golang-1/2 |
| `efficient-db` | mysql-vs-postgres, redis-vs-postgres |
| `efficient-js` | vite-vs-javascript, stance-react-measure-first; new `click-path-audit-vs-react` |
| `efficient-testing` | testing-observable-behaviour, testing-vs-e2e-browser, testing-vs-e2e-unit, trigger-testing-1/2; from quality: test-gap-audit-routing, trigger-test-gap-audit-1/2. The test-gap-audit negatives on the manual-only `quality:test-harness` were vacuous; point them at `efficient-testing:unit` |
| `authoring` | From quality: agent-config-audit-routing, trigger-agent-config-audit-1/2. Positive → `authoring:agent-config-audit`. Replace the vacuous `not-audit` negative with `not-config-audit` (`authoring:config-audit`, max 0) |
| `infra` | New `production-readiness-vs-rollout` |
| `api` (stays) | route-keys-vs-auth, route-oauth-vs-auth, route-rest-vs-web. Point the `not-neighbour` regexes at `efficient-auth:auth` and `efficient-web:web-development`. These negatives already can't fail |

Prompts for the two new cases must not quote description phrases.

Apart from `bash-vs-coding`'s negative, no existing routing case spans two plugins. `agent-config-audit` has no firing baseline, because `quality` never loaded. Slice 4 records its first measurements.

`plugins/efficient/evals/results/` and `plugins/quality/evals/results/` are gitignored and stay in the main checkout. Read last fired indicators from them in Slice 4, and archive them to `~/.claude/skills.migrated/_eval-results/{efficient,quality}/` in Slice 6.

## Plan

| # | Work | Files | Done when | Cheapest check | Agent |
| --- | --- | --- | --- | --- | --- |
| 0 | Create the worktree and branch. Record the pre-split SHA | — | Branch exists | — | orchestrator |
| 1 | Create the 11 `plugin.json` files; `git mv` skill and eval dirs per the tables, including the 9 non-testing quality skills and their eval dirs; rename the 5 `efficient-testing` skill dirs and `name:` fields; delete `plugins/efficient` and `plugins/quality`. In `marketplace.json`, remove `efficient` and `quality`, add 11 entries, bump `authoring` to 0.3.0, `infra` to 0.2.0, `aws` to 0.1.1, and patch-bump `accessibility`, `api`, `github`, `playwright-cli` | `plugins/**`, `.claude-plugin/marketplace.json` | Skill counts: core 10, shell 1, go 3, python 3, js 7, rust 1, web 2, auth 2, db 4, testing 5, security 3, authoring 9, infra 8. `git diff -M --stat` shows renames | `claude plugin validate --strict .` and `--strict plugins/<p>` for each of the 11 new plugins plus `authoring` and `infra` | coder-light |
| 2 | Apply the old-to-new map across skills, references, graders, and descriptions in all plugins, including the collateral plugins (`aws` included) and their bumps. Add "if installed" to every cross-plugin reference, including those listed above. Change `harness`'s `allowed-tools` and line 50 to `${CLAUDE_PLUGIN_ROOT}/skills/run/scripts/run_tests.py`. Change `/quality:test*` to `/efficient-testing:*` and `/quality:audit` to `/efficient-security:audit`. Soften `audit:48`. Rewrite graders and add the two new eval cases per the Evals section. Update `plugin.json` descriptions | `plugins/**` | Both Done-when `rg` checks return nothing. Every grader's `plugin:skill` resolves to an existing `SKILL.md`. Every description ≤ 1024 characters | One-off script for grader-name existence and description length; `rg` for cross-plugin mentions without "if installed", reviewed by hand | coder |
| 3 | Docs, in parallel with 2 on disjoint files. Delete `docs/plugins/quality.md`, carrying second-opinion data-egress limits, scanner requirements, and script-permission rows to the efficient family page. Update `authoring.md` (agent-config-audit row and its `Read(~/.claude/**)` grant), `infra.md` (production-readiness), `api.md`, `playwright-cli.md`. README rows: add `efficient-security`; refresh `authoring`, `infra`, `efficient-core`, `efficient-js` | `docs/plugins/{efficient,quality,authoring,infra,api,playwright-cli}.md`, `README.md` | Every marketplace plugin has a README row (29 plugins). Old-to-new and per-profile install tables present. No old names remain | `rg` for old names, relative-link check | scribe |
| 4 | Verify in the worktree. Run `uvx pytest -p no:cacheprovider` for `efficient-testing/skills/{run,gap-audit}/tests` and `efficient-security/skills/audit/tests` (36 pass); `bash efficient-testing/skills/harness/tests/check.sh`; `bash efficient-core/skills/second-opinion/tests/check.sh`. Eval smoke on all moved and new cases, covering `authoring`, `infra`, and `efficient-js` too: `--tag routing --tag trigger --runs 1 --ablation none --no-publish --keep-temp --max-cost-usd 3`. Read `plugin_errors` from each kept `out/trace.jsonl`. Record first `agent-config-audit` measurements. Run `review` on the full diff against this plan | — | No `plugin_errors`. No previously firing positive stops firing; flips re-run with `--runs 3`. `review` findings fixed. Kept temp dirs removed | As listed, about $1–3 | orchestrator + `review` |
| 5 | Cutover (below) | `~/.claude/agents/*`, settings | Step 9 checks pass | As listed | orchestrator, after the user's go-ahead |
| 6 | Record results here. Append a dated note to `adoption-followups.md` that the two `quality` open items were never measured. Re-measure `authoring:agent-config-audit`, `efficient-testing:gap-audit`, and the two new cases with `--runs 3` (about $2). Record the `/context` Skills row per profile. Run `/skill-doctor` a day after cutover. Archive both `evals/results/` dirs | `docs/plans/*` | Progress section filled in | — | scribe |

### Cutover order

Run as one sequence, with no other Claude sessions open.

1. Inventory which projects use each of `api`, `aws`, `infra`, `observability`, `sentry`, and `tooling` (D14). rovitracker already enables `infra` locally.
2. Back up `~/.claude/agents/{architect,coder,coder-max,review,quick-review}.md`, `~/.claude/settings.json`, and rovitracker's `.claude/settings.local.json` to `~/.claude/skills.migrated/_agents/*.pre-split`.
3. While main still has the old plugins, uninstall them. Do `quality` before `efficient`, unconditionally.
   - `claude plugin uninstall quality@adminhead`, then `efficient@adminhead`, at user scope.
   - The same two in `~/Projects/rovitracker/platform` with `--scope local`.
   - `api`, `aws`, `infra`, `observability`, `sentry`, `tooling` at user scope. Step 6 reinstalls them locally.

   Do not reinstall `quality`.
4. `git merge --ff-only efficient-split` on main.
5. `claude plugin marketplace update adminhead`.
6. Install.
   - At user scope, `efficient-core@adminhead` and `efficient-testing@adminhead`. `authoring` and `github` stay; update `authoring` to 0.3.0.
   - In rovitracker with `--scope local`, `efficient-go`, `efficient-js`, `efficient-web`, `efficient-db`, `efficient-security`, plus `efficient-auth` and `efficient-shell` if it needs them. `infra` is already enabled there.
   - In every other project from the step 1 inventory, reinstall each of the six situational plugins with `--scope local`.
7. Edit the agents.
   - Four preload lines (architect.md:8, coder.md:8, coder-max.md:8–9) to `efficient-core:planning`, `efficient-core:coding`, `efficient-core:problem-solving`.
   - Eight lines changing `quality:second-opinion` to `efficient-core:second-opinion`, in `architect.md` (3, 9, 21), `review.md` (3, 8, 16), and `quick-review.md` (8, 16).
8. Verify.
   - `claude plugin details <name>` per installed plugin is within ±10% of the map.
   - A fresh session lists the new names and no `efficient:` or `quality:`.
   - Spawned `architect`, `coder`, `coder-max`, `review`, and `quick-review` agents each quote the H1 of their preloaded skill. second-opinion's H1 is "Second Opinion".
   - `/efficient-testing:run` in a repo with tests runs with no permission prompt.
   - `/efficient-security:audit` runs `scan.py` with no permission prompt in a repo with `efficient-security` installed.
   - Record the `/context` Skills row per profile.
9. Push.

### Rollback

- **Before the merge.** Remove the worktree and delete the branch. If cutover step 3 already ran, reinstall as below.
- **After the merge, before the push.** `git reset --keep a1efff3`. Uninstall the new plugins. Reinstall `efficient` and `quality` at user scope and rovitracker's local scope. Reinstall `api`, `aws`, `infra`, `observability`, `sentry`, `tooling` at user scope. Restore all backups, including `review.md` and `quick-review.md`.
- **After the push.** `git revert a1efff3..HEAD` instead of the reset, then the same reinstalls and restores.

## Material unknowns

| Unknown | Assumption | Settling evidence | Trigger |
| --- | --- | --- | --- |
| Uninstall after the marketplace entry is gone | May fail (UNCONFIRMED) | Avoided by uninstalling before the merge | — |
| In-place vs cached loading | `installed_plugins.json` shows a cache path; docs and skills-to-plugins Slice 5 say in place | Cutover order covers either | — |
| First eval in a new plugin dir | May ask for trust | The prompt appears | Run interactively, or `--trust-plugin` with the user's OK |
| Trigger drift from `efficient-testing:*` renames | Small | Slice 4 smoke, then `--runs 3` on flips | Fall back to prefix-only names |
| Agent preloads count as skill uses | Unknown (UNCONFIRMED) | `/skill-doctor` a day after cutover | Revisit D14 if descriptions drop |
| Local-scope plugins list last and lose descriptions first | Likely, from enabledPlugins key order | `/context` Skills row per profile | Revisit the declined key-reorder lever |
| `scan.py` runs without a prompt after the move to `efficient-security` | Permission rows travel with the skill | Cutover step 9 | Fix `allowed-tools` paths |

## Risks

| Risk | Mitigation |
| --- | --- |
| Few-minute gap between uninstall and install; agent preloads break until step 7 | One scripted sequence, no sessions open |
| Trigger shifts from renames and longer "if installed" descriptions | Slice 4 smoke, `--runs 3` on flips |
| Cross-plugin boundaries (testing↔language, core↔language, core↔shell, js↔web, web↔auth) can't be evaluated | Accepted and documented. Only `bash-vs-coding`'s negative is affected |
| A project misses a plugin it needs | Per-profile install table in the docs. Dangling "if installed" pointers are harmless |
| Listing saturation. Local plugins list last and lose descriptions first; key reorder declined | Record `/context` per profile; `/skill-doctor` a day later; revisit levers if descriptions drop |
| Silent preload skip if `efficient-core` is missing | `efficient-core` stays at user scope; cutover step 9 verifies all five agents |
| `infra:production-readiness` unavailable without `infra` installed | Per-profile install table; `infra` is local in projects that ship |
| `authoring:agent-config-audit` depends on `authoring` staying at user scope | D12 records the constraint; move to `efficient-core` if `authoring` goes local |
| `/efficient-security:audit` unavailable in repos without `efficient-security` | Fall back to built-in `/security-review`; document in the family page |
| Muscle memory for `/quality:audit` | Old-to-new table in the family page |

## Rejected alternatives

| Alternative | Why it lost |
| --- | --- |
| No split; per-project `skillOverrides` | Plugin skills ignore `skillOverrides` |
| Language plugins declare `dependencies: ["efficient-core"]` | `dependency-unsatisfied` would blind every language plugin's evals |
| Keep `dependencies` and vendor neighbour plugins into eval cases | Copies drift (skills-to-plugins Slice 6) |
| Deprecated `efficient` copy or bundle alias | Duplicate skills compete for routing; one user, so no alias needed (D7) |
| Per-framework plugins | react, vite, tanstack, vue cross-reference densely; `vite-vs-javascript` would go vacuous |
| Unit testing in core, e2e in web | `harness`'s hard load would cross plugins; unit/e2e/gap-audit/harness boundaries couldn't be evaluated |
| Frameworks in `efficient-web` | Go/Python web apps would pay for JS frameworks; `vite-vs-javascript` would go vacuous (D2) |
| `auth` in core | Adds 240 tokens to every project without auth work |
| Keep `quality` whole (9 skills, user scope) | Every-session listing cost 1,650 tokens, and no eval pairs gained |
| Three quality plugins (security, review, audits) | Every-session cost 1,190, no pairs gained, high churn |
| Slim `quality` (keeps second-opinion, anti-slop, poka-yoke, audit, agent-config-audit) | Gains one eval pair; still needs a user-scope plugin for five unrelated skills (D9, D12) |
| New `efficient-review` plugin for second-opinion, anti-slop, poka-yoke | One more plugin for three skills that fit core (D9) |
| `audit` in `efficient-core` | Recommended, but the user chose `efficient-security` (D10). Costs "if installed" on five references |
| `production-readiness` in `efficient-security` | `infra:rollout` is its real competitor (D11) |
| `agent-config-audit` in `efficient-core` | `authoring:config-audit` is its real competitor (D12). Fallback if `authoring` goes local |
| `click-path-audit` in `efficient-web` or `accessibility` | `react` is its real competitor (D13) |
| Reorder `enabledPlugins` keys | Declined (D14). Key order does set listing order, but the user chose not to manage it |
| Design skills name-only | Declined (D14) |
| Raise `skillListingBudgetFraction` | Declined (D14) |
| Cap description length | Declined (D14) |

## Critique log

Second opinion: agy gemini-3.1-pro-high, adversarial plan critique (run before D1–D8 were settled).

1. **Uninstall after the merge may fail.** Adopted; cutover uninstalls before the merge.
2. **rovitracker breaks during the merge window.** Adopted; its local `efficient` is uninstalled before the merge.
3. **Keep `quality`'s dependencies.** Rejected; the dependency failure disables the whole plugin in the sandbox.
4. **Bump collateral plugin versions.** Adopted.
5. **Fold bash and auth into bigger plugins.** Overridden by the user: D5 and D6 give each its own plugin.
6. **Drop stuttering names.** Rejected; `efficient-go:golang` follows the `ripgrep:ripgrep` form.
7. **Reset vs revert for rollback.** Adopted, modified: `reset --keep` before push, `revert` after.

Second opinion on breaking up `quality`: agy gemini-3.1-pro-high (run before D9–D14 were settled).

1. **Savings are illusory; cap descriptions instead.** The framing is adopted (Finding 10). The replacement is rejected, and the user declined the cap lever (D14).
2. **The reorder fallback is unverified.** Verified that `enabledPlugins` key order sets listing order. The user declined reordering (D14).
3. **Move `audit` to `efficient-security`.** Rejected by the architect, who recommended `efficient-core`. Adopted by the user (D10).
4. **Move `production-readiness` to `infra`.** Adopted (D11).
5. **Keep `agent-config-audit` out of `authoring`.** Rejected (D12).
