# G10 marketplace tooling, CI, eval infrastructure and repo docs, 2026-11-14

Read-only review. Probes live outside the repo in `/tmp/g10mut/` (`mut.py`, `m2.py` to `m4.py` inject defects into a copy at `/tmp/g10mut/r`, which excludes `.git`, `node_modules` and `3rd-party`; `stats.py`, `own.py` count evals; `budget.py` sums description sizes). `claude plugin eval` was not run.

## Summary

- Tests: `check` prints `ok`, `check --since 837b396` prints `ok`, `pytest scripts/test_plugins.py` 68 passed, `node --test scripts/install.spec.mjs` 14 passed. No failures.
- The prior review's biggest finding is fixed. Of 14 injected defects, the old `check` caught none. Today it catches all of them except `claude plugin eval` blindness items that are loader-only. The strict-YAML lint, grader schema, regex compile, Skill-target resolution, name/dir, description length, `autoCompactWindow`, category, root-suite closure and `--since` rules all exist (`scripts/plugins.py:155-233, 336-387, 433-811, 817`). The CI workflow exists (`.github/workflows/check.yml`).
- A second round of injected defects (34 in total, with a few no-ops that I discarded) shows what `check` still misses. [high] it never validates anything outside skills, agents and evals: `agents/*.md` `model:`, `tools:` and `skills:` values, `hooks.json` and `.mcp.json` content, a duplicate marketplace entry, `examples/claude-settings` plugin ids, and a SKILL.md over 500 lines or with dead `references/` links all pass.
- [high] The plan table in `docs/plans/plugin-review-fixes.md:41-53` still says OPEN for 29 rows although B1, B2, C1, C3 and E1 landed. The plan has no status line, so nobody can tell what is finished.
- [high] Eval coverage is mostly trigger-only. 24 outcome results across 19 plugins in plugin-data.tsv, and of those with a baseline, 9 pass equally with and without the plugin (no lift shown), 13 show lift, 0 are worse. 317 of 357 per-plugin cases are `runs: 1`, 32 are unpinned, and 57 skill plugin suites have no own-skill hard negative. Nothing measures value per model tier. Section "Eval design" proposes the cheapest design (about $1.7 per plugin across three tiers, about $80 to $100 for all 111 trigger-only plugins with staging).
- [med] No deprecation mechanism exists. The archive moves were hand `git mv` commits (`a168f589`, `84243074`). Section "Deprecation" proposes a `DEPRECATED` table plus an `archive` subcommand, and names three live places that `check` would not notice (`examples/claude-settings`, agent `skills:` preloads, `install.mjs`, which aborts when a listed plugin disappears).
- [med] A listing-budget check is cheap and the data is already in the repo. Largest meta closures by description characters: godot-meta 7468, android-meta 6782, web-meta 6337, java-meta 5518. 23 of 190 model-invocable skills have descriptions over 500 characters (max 914).
- [med] `usage-report.ts` can emit the plugin-data.tsv columns for six of the sixteen columns directly from the log; the rest come from the repo. About 150 lines plus a spec.

## Prior findings re-checked

Source rows are V19 to V29, slices B1, B2, C1, C2, C3, E1, follow-ups F1 to F4, and the G10 report's own list.

| Prior finding (source) | Status | Evidence |
|---|---|---|
| V19 `check` caught none of 14 defects (G10 high) | FIXED | `component_doc_errors` `scripts/plugins.py:347-387`, `eval_errors` `:654`, `regex_job_errors` `:763`, `category_errors` `:436`. Re-injected: nested quotes, unknown prompt key, bad regex, `(?i)`, nonexistent Skill target, negative weight, name/dir mismatch, 1100-char description, unquoted colon, `autoCompactWindow`, off-vocabulary category, version drift, meta dep on a ghost plugin, drifted shared copy, root-suite colon: all caught (mut.py). |
| V19 eval lint scanned only `plugins/*/evals` | FIXED | A root-suite `evals/orchestration/.../prompt.md` colon is caught. |
| V20 28 strict-YAML files | FIXED | `check` is `ok` with strict loader `scripts/plugins.py:263-283`. |
| V21 no version-bump guard | FIXED | `check --since` `scripts/plugins.py:817`; `--since 837b396` prints `ok`; CI runs it (`check.yml` "Version bumps"). |
| V22 category rule (aspnet-core, ef-core as meta) | FIXED | `category_errors` `:436`, and an off-vocabulary category is caught in mut.py. |
| V23 root-suite plugin lists drifted | FIXED | `ROOT_SUITES` `:456-467` covers forges, godot-meta, jvm and android; `evals/godot-meta/README.md` states the rule. Not covered: `evals/specialists` and `evals/orchestration` (by design). |
| V24 no CI | PARTLY | `.github/workflows/check.yml` runs check, `catalog --check`, `--since`, pytest, the installer spec, the guard specs. Missing: `claude plugin validate`, the free eval load, 15 other plugin test dirs, and any `.forgejo/` workflow although E1 listed both and the owner's stack is Forgejo. See CI below. |
| V25 CLAUDE.md names archived `coremods`/`crew` | FIXED | `CLAUDE.md:14` now lists live scopes; `:30` and `:32` say `archive/plugins/coremods` explicitly; live examples are named; a Tests section exists (`:17-20`). |
| V26 inert sibling graders (92) | FIXED | `check` has the inert rule and passes; C1 deleted them. |
| V27 manual-only routing cases | PARTLY | `plugins/ship/evals/` and `plugins/pr-comments/evals/` now hold only gitignored `results/`. The F5 slash-invoked case for pr-comments was dropped (plan line 477), so both skills have no evals. `plugins/pr-comments/evals/results/` still holds a 0.33/None run listed in plugin-data.tsv. |
| V28 `runs: 1` and unpinned cases | STILL OPEN | Today 317 of 357 per-plugin cases are `runs: 1`, 5 are `runs: 3`, 35 use the default; 32 have no `model`. Root suites are all `runs: 3` (android, forges, godot-meta, jvm, orchestration, specialists). `check` has no warning for either. `.claude/skills/skill-evals/SKILL.md:49` still commits `runs: 1` in the canonical example against `:122` and `:131`. |
| V29, F4 free `--max-cost-usd 0` load check | STILL OPEN | Not in `check` or CI. Not run here (rule: no eval invocations). |
| F1 paired root suites for testing, web, data, aws, dotnet, thinking, docs, auth-api, security, branching | STILL OPEN | `evals/` holds android, forges, godot-meta, jvm, orchestration, orchestration-ab, specialists only. The android suite was added after the plan (`4834c448`). |
| F2 own-skill hard negatives for suites without one | STILL OPEN | 57 skill plugins with a suite have no own-skill `max: 0` Skill grader (own.py). Includes terraform (5 cases), ansible, redis, react, golang. |
| F3 runs and pins, `runs: 1` contradiction | STILL OPEN | See V28. |
| F5 move forgejo-ship's cross-plugin cases | STILL OPEN | `plugins/forgejo-ship/evals/*/prompt.md:5` still has `plugins: ["../../../forgejo-ship", "../../../forgejo-shipper", ...]`, a path that escapes the per-plugin target (UNVERIFIED this round; prior review loaded it at $0). |
| B1 test coverage gaps: "dependency X is not in this marketplace" test | STILL OPEN | `scripts/test_plugins.py` has no test for that message (grep). The code path works (mut.py "meta dep nonexistent"). |
| `shared_copies` glob at depth 2 | STILL OPEN [low] | `scripts/plugins.py:873-878` `glob(f"*/*/{rel}")`. All current copies sit at depth 2, so no drift is hidden today. |
| `agent_rows` line-regex frontmatter | STILL OPEN [low] | `scripts/plugins.py:959-981` still `re.match(r"^([A-Za-z]+):\s*(.*)$")`; a folded `tools: >` would read as empty. `check` itself uses the YAML parser. |
| `mergeSettings` re-enables an example-enabled plugin the user set to false | STILL OPEN [low] | `scripts/install.mjs:38` the `keep` set holds only example-false ids. `install.spec.mjs` has no case for it. |
| `catalog-3rd-party.py` writes third-party descriptions unescaped | STILL OPEN [low] | `scripts/catalog-3rd-party.py:38-50` hand-parses frontmatter; `trunc()` escapes only `|`. Last touched 2026-10-17. |
| mod-authoring references hard-code `/home/buck/...` | STILL OPEN [low] | `.claude/skills/mod-authoring/references/testing.md:10-11`, `examples.md:8`, `sandbox.md:5,9`. |
| Marketplace category/meta mismatch on aspnet-core, ef-core | FIXED | See V22. |

## Findings by area

### `scripts/plugins.py check`: what a second round of injected defects still misses

Method: copy to `/tmp/g10mut/r`, apply one edit, run `uv run --with pyyaml python3 scripts/plugins.py check`, restore. A full `check` takes about 0.5 s. Results in `/tmp/g10mut/mut.py` through `m4.py`.

Missed (check printed `ok`):

| Injected defect | Where it should be caught | Impact |
|---|---|---|
| Agent `model: sonet` (after regenerating the catalog) | `component_doc_errors` `scripts/plugins.py:383` checks only `autoCompactWindow` for agents | The agent falls back or errors at spawn. [med] |
| Agent `tools: Read, Wirte` | same | A typo silently removes a tool or the grant. [med] |
| Agent `skills:` preload naming a nonexistent skill | `agent_spawn_errors` `:390` reads only `tools`/`disallowedTools` | The brief asks for "missing dependencies for skills an agent preloads". `plugins/coder/agents/coder.md:8-11` preloads `coding:coding`, `codebase-memory`, `plan-ledger-usage:plan-ledger`; nothing proves the plugin that ships each is a dependency or installed. [med] |
| Duplicate marketplace entry (same plugin twice) | `load_plugins` keys entries by name (`:111`), so the second overwrites the first | `check` ok; `claude plugin validate` UNVERIFIED. [med] |
| `hooks/hooks.json` with a dangling script path or a renamed `register.tsx` | no hook-file rule; only `components()` reads it | A plugin ships a hook that cannot run. `claude plugin validate`/`test` may catch it; UNVERIFIED. [med] |
| Invalid JSON in `hooks.json` | same | [low] |
| Invalid JSON in `plugin.json` | caught, but as a Python traceback (`scripts/plugins.py:1195`) | [low] message quality |
| `.mcp.json` with a changed command or path | none | [low] |
| `examples/claude-settings/settings.global.json` `enabledPlugins` naming `ghost@adminhead` | nothing reads the examples | The installer then fails (below). [high] for the archive workflow |
| SKILL.md over 500 lines, dead `references/...` link, unknown frontmatter key, `allowed-tools: Bash` | no body or key rule | `skill-authoring` forbids long bodies; nothing enforces it. [low] |
| `plugin.json` unknown key | none | [low] |

Caught that the first review marked missed (good): eval and skill rules listed in Prior findings.

Other `check` observations:
- [med] `check` has no warning for `runs: 1`, an unpinned `model`, or a missing own-skill hard negative (`scripts/plugins.py:654-811` has none of them). Proposal below: a `coverage` subcommand with a ratchet file, so existing violators do not fail.
- [low] `regex_check.mjs` compiles patterns with Node's V8 (`scripts/regex_check.mjs:15`). Which engine the eval runner uses is not stated in the repo (Claude Code ships on Bun/JavaScriptCore; UNVERIFIED), so a lookbehind or `v`-flag difference could pass `check` and fail at run time. Needs source check.
- [low] `ship-plugin` step 2 (`.claude/skills/ship-plugin/SKILL.md:18`) still tells the shipper to compare versions by hand with `git show origin/main:...`; `check --since origin/main` does it and CI uses it. Mention the flag.

### CI (`.github/workflows/check.yml`)

- Runs: `check`, `catalog --check`, `check --since` (skipped when no previous commit), `pytest`, `node --test scripts/install.spec.mjs`, `bun test` over `scripts/shared`, the three guard plugins and `plugins/usage-log/scripts`, and the two guard shell suites.
- [med] Not run in CI although they need no credentials: the spec or shell tests in `adr-writing`, `atlassian-docs`, `docs-audit`, `forgejo-mcp`, `mcp-server-audit`, `outline-docs`, `pr-comments`, `plan-ledger/tests` (13 `*.spec.ts`), `security-scan`, `session-recover`, `test-gap-audit`, `test-run`, `ui-critic`, `uiux-lookup`, `orchestration/tests` (found by `find plugins -name '*.spec.ts' -o -name 'check.sh' -o -name 'test_*.py'`). `plan-ledger` guards the ledger the owner's subagents rely on and is not in CI. Run them with `bun test plugins/<p>` per plugin, or one `bun test plugins/*/tests plugins/*/scripts` pass, keeping `*.test.tsx` mod tests out (house rule, `CLAUDE.md:20`).
- [med] No `claude` CLI step (no credentials): so no `claude plugin validate --strict` and no free eval load. Add `validate` and the load check as a local pre-push script (`scripts/preflight.sh`) or a `check --evals-load` that skips when `claude` is absent (F4).
- [low] No `.forgejo/workflows/check.yml` (E1 asked for both). The owner's daily stack is Forgejo; this repo's origin is GitHub (`scripts/install.mjs:16`), so GitHub-only may be a deliberate choice. State it.
- [low] Actions are pinned by major tag (`actions/checkout@v7`, `setup-python@v7`, `setup-node@v7`, `setup-bun@v2`), not commit SHA, and `pip install pyyaml pytest` is unpinned. Low risk because `permissions: contents: read`. Whether `@v7` exists for those actions: needs source check.

### scripts/install.mjs and install.spec.mjs

- [high] Archiving a plugin that `examples/claude-settings/settings.global.json` enables breaks the installer: `claude plugin install <id>` fails and `main()` throws (`scripts/install.mjs:243` "could not install or update"), so no user-scope plugin after it gets installed. Today all 11 example ids resolve (checked), but no `check` rule keeps them resolving. The two `<plugin>@adminhead` placeholders in `settings.project.json` and `settings.local.json` are intentional.
- [med] `mergeSettings` only adds or overwrites; it never removes a key, so a retired plugin id stays in users' `enabledPlugins` forever (`:32-56`). A `retired` list in the example, with `claude plugin uninstall` behind a prompt or `--prune`, would close it.
- [low] `:38` `keep` protects only example-false ids; a user who sets an example-enabled plugin to false gets it re-enabled on every run. No spec case.
- [low] Example scalars overwrite user values (including `model`) with a printed change list but no confirmation; `--dry-run` exists. Documented in the header (`:2-5`), acceptable.
- Specs pass under node (14 tests).

### scripts/shared and sync-shared

Works: 4 guard plugins carry walk/unbash, 2 carry usagelog, no drift, drift is caught (mut.py "shared drift"). Residual: the depth-2 glob (`scripts/plugins.py:873-878`) hides a copy placed deeper, and nothing fails when a plugin imports `./vendor/unbash` without a tracked copy. [low]

### scripts/catalog-3rd-party.py

[low] Still hand-parses frontmatter and writes third-party description text into `docs/3rd-party/*/catalog.md`, which Claude later reads. A link or instruction in an upstream description lands verbatim. Wrap in code spans or strip `[]<>`. Not touched since 2026-10-17.

### CLAUDE.md, README and project skills

- CLAUDE.md is accurate against the code: the MULTI_COMPONENT exceptions match `scripts/plugins.py:39-42` (orchestration, scala), the shared-file list matches `SHARED_FILES` (`:33`), the test commands match what I ran. One gap: it does not say that `check --since <ref>` exists. [low]
- `README.md:440`: "the clone under `docs/3rd-party/gradle-skills` is pinned only for evals". `docs/3rd-party/gradle-skills` holds only `catalog.md`; the clone is under the gitignored `3rd-party/` (`.gitignore:10`) and the pin SHAs (gradle-skills `b26b149`, android-skills `6daa53e`) are recorded only in `docs/research/evals-2026-11-01.md:17`. A reader cannot reproduce the pin from the repo. [low] Record the SHAs in `evals/jvm/README.md` and `evals/android/README.md`, or make `check` compare the checkout's HEAD to a `ROOT_SUITES` field.
- `README.md:411-420` "Rules" lists only structure rules. The new lint rules, `--since`, `catalog --check`, `upstream` and how to run the root suites are undocumented outside the skills. [low]
- `.claude/skills/skill-evals/SKILL.md:49` `runs: 1` in the canonical example vs `:122` and `:131`: this is why 317 cases are `runs: 1`. [med] Change the example to omit `runs`, as `:122` says.
- `.claude/skills/mod-authoring/references/{testing,examples,sandbox}.md`: 5 hard-coded `/home/buck/Projects/adminhead/claude-plugins/...` paths. [low]
- Live skills point into `archive/` (12 references): `mod-authoring/SKILL.md:99`, `mod-authoring/references/{examples,sandbox,testing}.md`, `skill-evals/references/examples.md:259-302` (git, api, coding-js, sentry-core evals), `hook-authoring/references/examples.md`, `skill-authoring/references/best-practices.md`, plus `CLAUDE.md:30,32` (coremods). All targets exist today. Anything in `archive/plugins/{coremods,git,api,coding-js,sentry-core}` is therefore not safe to delete. A purge would need those examples copied into the skills first. [med]
- The six repo skills have descriptions of 473 to 973 characters (mod-authoring 973, skill-evals 811, skill-authoring 792, hook-authoring 752). They are project-scoped, so the listing cost is paid only in this repo. [low] Trim mod-authoring below about 500.
- `ship-plugin` steps are consistent with `plugins.py` today except step 2's manual version compare (see above) and step 36 naming `git:commit`, while the installed skill id is `git-commit:git-commit` per the skill list. [low]

### Eval organization and statistics (today)

From `/tmp/g10mut/stats.py` and `own.py` over `plugins/*/evals` and plugin-data.tsv (273 plugins):

| Measure | Count |
|---|---|
| Plugins by kind | 208 skill, 25 meta, 16 hook, 15 agent, 7 mcp, 1 agents+hooks, 1 skills+lsp |
| Plugins with own evals | 132 (131 skill, 1 skills+lsp). Metas, hooks, agents and MCP plugins have none of their own (agents get root-suite routing from `evals/orchestration`). |
| Skill plugins with no evals at all | 77 (e.g. docker, kubernetes, helm, gitops, postgres, typescript, javascript, python, rust, planning, git-commit, handoff, threat-model, privacy-review, ux-copy) |
| Skill plugins with evals but no own-skill hard negative | 57 (`own.py`; includes forgejo-ship, pr-comments and ship, which have no routing case) |
| Skill plugins with no own-skill positive | 7: fact-check, forgejo-ship, lens-review, pr-comments, session-recover, ship, tunnel-check |
| Cases | 357 per-plugin, plus root suites android 18, forges 12, godot-meta 12, jvm 18, orchestration 16, specialists 2 |
| Per-plugin `runs` | 317 `runs: 1`, 5 `runs: 3`, 35 default. Root suites: all 3. |
| Per-plugin unpinned `model` | 32 of 357 (the rest `claude-sonnet-5-5`); 18 of 78 root cases (all of orchestration 16 and specialists 2) |
| Cases with an outcome-type grader (regex, file_exists, llm) | 29 across 23 plugins (matches the 23 in the brief) |
| Skill plugins with no outcome case | 186 of 208 |
| Grader types | tool_used 366, regex 50, llm 25, file_exists 6; no tool_order, no baseline |
| Outcome results in plugin-data.tsv | 24 entries, 19 plugins: 13 lift, 9 equal, 0 lower (2 with no baseline score) |

Reading the 9 "equal" results: `logcat-crash`, `junit-clock`, `runtest-virtual-time`, `maven-bom`, `play-migrate-3`, `scala-follow-style`, `slice-test`, `boot-config-props`, `outcome-conference-format`. Sonnet 5.5 already passes these at one run without the plugin. They were written to confirm the skill does no harm, not to find where it helps. The 13 lifts: `baseline-profile` 1/0.67, `compose-ui-test` 1/0.8, `catchup-next` 1/0, `java-upgrade-21` 1/0.5, `compose-hoist` 1/0.25, `stance-react-measure-first` 1/0, `sbt2-commands` 1/0.75, `testing-observable-behaviour` 1/0, and five ui-direction cases 1/0.4.

Other observations:
- Three eval systems coexist: `claude plugin eval` suites, `evals/orchestration-ab/` (a shell and Python harness against historical SHAs), and `plugins/orchestration/evals/run.py` with `cases/*/case.json` (per-tier via `--model`, 3 runs per case, kills at the first Agent call, `plugins/orchestration/evals/README.md:1-9`). The last is the only one that already runs per model tier, and it is a good template for the value suite below. [low] `evals/orchestration-ab/README.md` builds arms from `git show` of retired refs (`CONTROL_REF` default `8f8bd5f`); it will break on a shallow clone. UNVERIFIED (not run). Mark it historical or delete it after the lean-orchestration plan closes.
- `evals/specialists` has 2 cases at `runs: 3`, unpinned.
- Per-plugin result dirs (`plugins/*/evals/results/`) sit under dirs that otherwise hold nothing (`ship`, `pr-comments`); harmless (gitignored) but plugin-data.tsv reads them, so a deleted case still reports a score (`pr-comments-slash` 0.33/None).

### Plans (`docs/plans/`) and `docs/README.md`

`docs/README.md` points only at `plans/plugin-adoption.md` and `archive/docs/`. It does not say which plans are finished, and `plugin-review-fixes.md` has no status line. Per file, by `git log -1` date and the plan's own Status line (verified against the plugin tree where noted):

| Plan | Evidence | Verdict |
|---|---|---|
| `plugin-review-fixes.md` | Table still lists 29 OPEN, 0 FIXED (`:41-53`); S0 to A11, B1, B2, C1, C3, E1 landed (git log 2026-10-23 to 11-06, `check.yml` exists); C2 partly (F5 note `:477`); F1 to F9 open | Landed but unmarked: add a status line, update the table, move to `archive/docs/plans/` when F-items are tracked elsewhere |
| `baseline-slim.md` | States it is done (baseline 0.5.0 matches `marketplace.json`) | Finished |
| `jvm-meta.md` | "implemented, 2026-10-20" | Finished |
| `paperthin-ports.md` | Status: "Done (2026-10-23): S0-S6" | Finished (header still says "Not started") |
| `harness-toolbox-ports.md` | Done S0-S6 and most of S7; "Left: S7 step 5 live checks" | Finished except a live check; header "Not started" is stale |
| `consult-flexible-server.md` | Done S1-S4 2026-10-23 | Finished (header says "Not started") |
| `consult-codex-app-server.md` | no Status line; consult plugin ships the server | Likely finished, UNVERIFIED |
| `context7-grep-app-in-programming-core.md` | "in progress"; `programming-core` now depends on `grep-app` and `context7@claude-plugins-official` (checked) | Finished (header stale) |
| `guard-improvements.md` | no Status line; B1-B4/C1-C9 | UNVERIFIED, likely finished |
| `cloud-ops-guard-optional.md`, `aws-meta.md`, `forgejo-meta.md` | "approved"; the plugins and metas exist | Finished (headers stale) |
| `android-meta.md` | "approved 2026-11-01"; `65d1e1f6` and `4834c448` landed, eval run in `evals-2026-11-01.md` | Finished (header stale) |
| `forgejo-mcp-repo-tools.md` | "slices 2-4 done 2026-11-10; slice 1 deviated" | Mostly finished; slice 1 needs a token to observe |
| `lean-orchestration.md` | "ready to implement ... everything below is open" (2026-10-25) | Open; `agent-router` exists and `orchestration-ab` was built; recheck |
| `goal-ledger.md`, `plugin-config-options.md`, `plugin-adoption.md` | drafts, nothing built (goal-ledger says so) | Live drafts |

Proposal: every plan gets one `Status:` line in the first five lines (draft, approved, implementing, done YYYY-MM-DD) and a `check` rule that fails when a plan has none, plus a `docs/plans/README` index. Cheap, and it answers "which plans are stale" without a review.

### What is in `archive/` and whether anything live still points into it

- `archive/plugins/` holds 52 pre-restart plugin directories (agent-status, api, coder-critical, coder-high, coder-max, coremods, crew, db, experiment-loop and others); `archive/docs/`, `archive/scripts/`, `archive/sandbox/` hold the old install scripts, crew launchers, Dockerfile and prompt-drift tooling. `check` does not scan `archive/` (`load_plugins` reads `plugins/` only).
- Live pointers (all targets exist): 12 in the repo skills (list above), 2 in `CLAUDE.md` (`:30`, `:32`), and 10 in `docs/plans/*` and `docs/README.md` (prose). No plugin, script, eval or settings example refers to an archived path. The hits in `plugins/godot-mcp-setup/.../install-addon.sh:6` and `plugins/game-publish/.../itch-butler.md:73` are unrelated words ("archive/<commit>.tar.gz", a butler URL).
- Archive precedent: `a168f589` (agent-status) edited the marketplace entry, README and `examples/claude-settings` in the same commit; `84243074` (coder tiers) moved three plugins and rewrote `coder`. There was no tooling, no deprecation notice and no uninstall step.

## Deprecation: how it works today and a proposed mechanism

Today:
- `scripts/plugins.py` has no `deprecated` flag, no `archive` command and the word "deprecat" does not appear in it (grep).
- What fails loudly when a plugin is removed from `marketplace.json` and `plugins/`: a meta or bundle listing it (`check` "dependency X is not in this marketplace", `scripts/plugins.py:192`), a Skill grader aimed at it ("matches no known skill"), a case `plugins:` path, a `ROOT_SUITES` extra, the README catalog.
- What does not: `examples/claude-settings/*.json` ids, an agent's `skills:` preload (tested: `ghost` preload passed), prose mentions in other skills and docs, installed users.
- Users: UNVERIFIED against Claude Code, but from the README (`:440`) a meta with an uninstalled dependency "doesn't load". An installed leaf whose marketplace entry vanishes keeps its cached copy and its `enabledPlugins` key and simply stops updating (assumption; needs source check). The installer cannot clean it: `mergeSettings` never deletes keys and `install.mjs:243` aborts on any listed id that does not exist.

Proposal:
1. Phase 1, `plugins.py deprecate <name> --reason R [--replacement P]`: records the plugin in a `DEPRECATED = {name: (reason, replacement, date)}` table next to `MULTI_COMPONENT`, prefixes its `description` with `Deprecated:` in `plugin.json` and `marketplace.json` (a custom marketplace field might fail `validate --strict`; UNVERIFIED, hence the description prefix), removes it from every meta and core bundle `dependencies` and from `examples/claude-settings`, bumps those metas, regenerates the catalog with a Deprecated marker. One release cycle, long enough for an update to reach installed users with a visible description.
2. Phase 2, `plugins.py archive <name>`: `git mv plugins/<name> archive/plugins/<name>`, delete the marketplace entry, regenerate the catalog, and fail unless the plugin was deprecated at least one release earlier (or `--force`).
3. New `check` rules that make a removal safe: (a) every `enabledPlugins` id in `examples/claude-settings/*.json` that names this marketplace resolves, except `<plugin>`; (b) every agent `skills:` preload resolves to a skill in a plugin the agent's plugin depends on or that is its own; (c) a `DEPRECATED` plugin appears in no meta, bundle, example or `ROOT_SUITES`; (d) no live file under `plugins/`, `scripts/`, `evals/`, `.claude/skills/` or `examples/` mentions a path `archive/plugins/<x>` that does not exist (so the 12 skill pointers stay valid or fail); (e) an archived name is not reused by a new plugin without a deliberate override.
4. Installer: add an optional `retired` array to the global example (`"retired": ["old@adminhead"]`), and have `install.mjs --prune` run `claude plugin uninstall` for installed ids in it and drop their `enabledPlugins` keys, printing each action. Default off, because it deletes user state.
5. A plugin's `evals/` moves with it; `check` does not scan `archive/`, so nothing else to do. Historic eval numbers in `docs/research/evals-*.md` stay.

## Listing-budget check

Facts: `skillListingBudgetFraction` defaults to 1% of the context window and the example sets 0.03 (`examples/claude-settings/settings.global.json:8`, `README.md:444`). With 75 visible skills at the default, 13 later descriptions were cut to name-only (`docs/research/evals-2026-11-01.md:40`). 190 model-invocable skills exist in the marketplace with 71,832 description characters in total; 23 are over 500 characters (max 914). plugin-data.tsv's `listing_tokens` is the logged per-skill cost.

Measured per closure (description plus `when_to_use` characters of model-invocable skills in the meta's leaf closure; `/tmp/g10mut/budget.py`, uses `closure()` from `scripts/plugins.py`):

| Closure | Leaves | Skills | Description chars | Logged listing tokens |
|---|---|---|---|---|
| godot-meta | 23 | 20 | 7468 | 2675 |
| android-meta | 17 | 15 | 6782 | 2399 |
| web-meta | 22 | 17 | 6337 | 2274 |
| java-meta | 13 | 11 | 5518 | 1305 |
| kotlin-meta | 12 | 10 | 4619 | 1627 |
| dotnet-meta | 13 | 11 | 4392 | 1556 |
| scala-meta | 11 | 9 | 4351 | 1344 |
| programming-core | 9 | 7 | 3063 | 1086 |
| baseline | 10 | 1 | 288 | 104 |

Each project meta sits on top of `baseline` and `programming-core` at user or project scope, so the real listing is the union of the user's installed closures (and `android-meta` adds 36 third-party skills, `README.md:444`). Per-meta sums understate it.

Rule: add `plugins.py budget [--profile examples/claude-settings/settings.global.json] [--max-chars N]`, and a `check` warning (not error) when (a) any meta closure's description characters exceed `N` (default: calibrate from usage-log `listing` lines where `included < total`; I could not derive the constant from the repo, so do not hard-code 1% x 4 chars per token), (b) any model-invocable description is over 500 characters (23 today), (c) the union of `baseline` plus one meta exceeds `N`. Output: table above plus the five largest descriptions per closure. The calibration step is the open question: `usage-report` already prints "Listing cut" (`usage-report.ts:119`) with `included` and `total`; compare those to the character sum for the same listing to fix `N`.

## Eval design: value per model tier (Haiku 5.5, Sonnet 5.5, Opus 5.5)

Goal: for each of the 111 trigger-only skill plugins, show whether the skill changes the result on each tier, cheaply enough to run on all of them.

**Case shape (one "trap case" per plugin, optionally a second):**
- A realistic prompt whose common unaided answer is wrong in a way the skill's own text names: a K-private fact (an fj/forgejo flag, a homelab convention, a post-cutoff API) or a K-decision rule (what to check first, what to refuse). Source the trap from the skill's "corrections" and "gotchas", not from its description.
- Grader: prefer free graders. `regex` on `last_message` or `file_exists` plus `regex` on `files` for the private fact (the required flag, path or value), and a `regex`/`tool_used` `max: 0` for the forbidden mistake. Add one `llm` grader only for K-decision cases, with a rubric "PASS only if ... FAIL otherwise" and `--judge-model haiku`. Free graders cost nothing; an llm grader is three short judge calls per run (`.claude/skills/skill-evals/references/cli.md:79`).
- `allowed_tools` only what the task needs; `max_turns` 6 for answer tasks, 12 to 14 for edit tasks (`SKILL.md:121`). No `Skill`-fired grader (it is not scored in a two-arm run, `cli.md:95`); the outcome is the measure.
- Place in `plugins/<p>/evals/value-<name>/` with `tags: [value]` so `--tag value` selects the set. Set `runs: 3`, `model: claude-sonnet-5-5`, and override per tier with `--model` (`cli.md:105-107`; the exact ids for Haiku 5.5 and Opus 5.5 need a source check).
- Dry-run discipline: first run the case on the baseline arm only. If Sonnet scores 3/3 without the plugin, the case cannot show lift, so either rewrite the trap or record "baseline sufficient on Sonnet", which is itself the deprecation evidence. This is exactly what the 9 equal results above would have flagged.

**Runs and statistics:** 3 runs per arm per tier. A lift needs with >= 2/3 and without <= 1/3; "no lift" needs without = 3/3. Anything between is inconclusive: rerun at 5 runs on that tier only. With 3 runs only a swing of about 0.67 or more is detectable; smaller effects are out of reach at this budget and should not drive a deprecation.

**Command per tier** (from the repo root; two-arm is the default when a plugin resolves):

```
claude plugin eval plugins/<p> --tag value --trust-plugin --model <tier-model> --judge-model haiku -j 4 --no-publish --max-cost-usd <cap>
```

**Cost estimate**, from the recorded numbers: a routing case with both arms costs about $0.116 (127 cases, one run, baseline included, $14.78; `docs/research/evals-2026-10-17.md:28`); an outcome case with a judge about $0.17 for both arms at one run (`evals-2026-11-01.md:12`); the 54 case-runs of the android paired suite cost $5.00 single-arm, about $0.093 each (`:23`); Opus costs about 2.0x Sonnet (orchestration, $9.95 vs $5.02, `evals-2026-10-17.md:54-55`). No Haiku cost is recorded; I assume 0.3x Sonnet, UNVERIFIED.

| Item | Cost per plugin |
|---|---|
| 1 case, 3 runs, both arms, Sonnet | 3 x $0.17 = $0.51 |
| same, Opus | about $1.02 |
| same, Haiku (assumed 0.3x) | about $0.15 |
| All three tiers | about $1.7 (about $2.1 with a second case on the K-decision plugins) |
| Staged: baseline arm only, Sonnet and Haiku | 3 x $0.085 + 3 x $0.025 = about $0.33 |

For the 111 trigger-only plugins: all tiers, no staging, about $190. Staged (baseline-only screen on Sonnet and Haiku for all, about $37; then both arms on three tiers only for plugins whose baseline did not score 3/3, assume 40% or 45 plugins, about $77) comes to about $115. Add the authoring cost, which dominates: a subagent writing and dry-running one trap case is roughly 20 to 40k tokens. Budget about $100 to $150 for the full sweep, within the $30 plan stop used before (`evals-2026-11-01.md:51` spent $37 on 9 plugins plus a suite, so a sweep needs its own explicit approval).

**What the result drives:** a plugin with "baseline sufficient" on all three tiers is a DEPRECATE (Generic or Duplicate) candidate; lift on Haiku only is a KEEP for the cheap-tier workflow and a listing-budget decision; lift on none because the case never failed the baseline means the case needs a new trap, not a deprecation. Run the 77 no-eval skill plugins first, with the "notable overlap" groups from the old report (git-commit, git-history, git-flow, trunk-based, hubflow; postgres, prisma, db-schema-design; typescript, javascript, ts-module-boundaries, tanstack; python, python-packaging, fastapi; docker, kubernetes, helm, gitops; design-critique, design-system, design-handoff, ux-copy, accessibility-review) first, because those are where deprecation or merging is most likely.

**Infra to support it:** `plugins.py coverage` printing the table in this report (pos, own hard neg, outcome, value case, `runs:1`, unpinned per plugin) with a ratchet file so existing violators do not fail but new or changed plugins must meet the floor (every skill plugin one positive, one own-skill hard negative; every plugin marked `value` has `runs >= 3` and a pinned model). Also a warning in `check` for `runs: 1` committed in a case without `tags: [iterating]`.

## Usage report: a `--plugins` view that produces plugin-data.tsv

`plugins/usage-log/scripts/usage-report.ts` (285 lines) already reads the log and has the pieces: `readLog`, `realSessions`, `listedNames`, `skillSection`, the listing carried per session (`:232`), and the `--judge` description lookup `skillDescriptions` (`:170`).

Columns of plugin-data.tsv and where each comes from:

| Column | Source | In the log today |
|---|---|---|
| `sessions_listed` | `listing` lines: sessions where the plugin has a skill in the latest `listing` at or before a prompt | yes (`skills[].plugin`, README field table); needs carry-forward per session as in `:232` |
| `loads` | `skill` lines, grouped by plugin | yes |
| `calls`, `call_sessions` | `skill-call` lines with no `agentId`, per plugin and distinct sessions | yes |
| `agent_calls` | `agent-call` lines, `type` is `plugin:agent` or bare; map by the part before `:` or by an agent-to-plugin index | yes, with a mapping step |
| `listing_tokens` | `listing.skills[].tokens` summed per plugin | yes |
| `manual_only`, `kind`, `version`, `main_bytes`, `refs`, `scripts`, `eval_cases`, `in_metas` | the repo (`plugins/*`, `plugins.py` `closure`) | no: needs `--repo PATH` |
| `outcome_evals` | `plugins/*/evals/results/*/` JSON, latest per case | no: needs the results schema (UNVERIFIED, not read this round) |
| `new_since_1023` | `git log` | no |

Proposal: `usage-report.ts --plugins [--repo PATH] [--tsv]`. Phase 1 (about 80 lines plus spec cases in `usage-report.spec.ts`): the six log-derived columns, keyed by plugin, `--tsv` printing the same header comments plugin-data.tsv has. Phase 2 (about 70 lines): `--repo` adds the repo columns by reading `plugins/*/.claude-plugin/plugin.json`, skill sizes and `disable-model-invocation`, and meta membership from the metas' `dependencies`. Keep `outcome_evals` in a separate script or in `plugins.py coverage`, since it needs eval-result parsing. Retention is 30 days (`README.md` Privacy), which covers the four-week window, but a report older than that needs the files kept. Two caveats: the report cannot see listing before the `listing` line is first written (a session that never changed its listing has one line), and agent calls by a plugin's agent that was spawned from a subagent count under `From subagents` today; keep that split in the output.

## Proposals, in priority order

1. [high] Add the missing `check` rules: agent `model`, `tools` and `skills:` values against known names and the plugin's dependencies; duplicate marketplace entries; `examples/claude-settings` ids; `hooks.json` and `.mcp.json` parse and path existence; SKILL.md body length (warn) and dead `references/` links (error). Each is a few lines in `component_doc_errors`/`load_plugins` with a fixture test in `scripts/test_plugins.py`. Evidence: the 12 missed defects above.
2. [high] Mark plan status. Add a status line to `plugin-review-fixes.md` and update its table; add one `Status:` line to the other 17 plans; index them in `docs/README.md`.
3. [high] Build the value-eval sweep as specified, starting with baseline-only screening on Sonnet and Haiku for the 77 no-eval skill plugins, so deprecation rests on data.
4. [med] `plugins.py deprecate` and `archive` plus the `retired` installer list, so removal stops depending on the author remembering `examples/` and metas.
5. [med] `plugins.py budget` and the description-size warning.
6. [med] Extend CI to the 15 other spec dirs and add `claude plugin validate --strict` plus the free eval load as a local pre-push script (or `check --evals-load`).
7. [med] Fix `skill-evals/SKILL.md:49` (drop `runs: 1`), then pin `model` and raise `runs` on the 32 unpinned and 317 `runs: 1` cases as cases are touched (a `coverage --ratchet` keeps the number from rising).
8. [low] `usage-report.ts --plugins`.
9. [low] Replace the five `/home/buck/...` paths in mod-authoring references; move the 12 archive-pointed examples into the skills before any archive purge; record the 3rd-party eval pins in the suite READMEs; escape third-party text in `catalog-3rd-party.py`; test for "dependency X is not in this marketplace"; mention `check --since` in `ship-plugin` and CLAUDE.md.

## Needs source check

- Whether Claude Code's `claude plugin validate`/marketplace schema accepts a custom `deprecated` field on a marketplace entry, and what an installed user sees when a plugin disappears from a marketplace (cached copy kept? warning? auto-disable?).
- Whether an installed meta with a now-missing dependency stays loaded or stops loading on `plugin update` (README says "doesn't load" for an unregistered marketplace, not for a removed plugin).
- The eval runner's regex engine (Node/V8 vs Bun/JSC) and whether `scripts/regex_check.mjs` matches it.
- The skill listing budget formula (fraction of the context window, characters per token, and which fields count) and the default fraction. The repo's evidence is one observation (75 skills, 13 cut, `evals-2026-11-01.md:40`).
- Model ids for Haiku 5.5 and Opus 5.5 in `--model`, and Haiku's cost relative to Sonnet.
- Whether `actions/checkout@v7`, `actions/setup-python@v7`, `actions/setup-node@v7` exist.
- Whether the forgejo-ship cross-plugin cases still fail to load per-plugin (not re-run this round; prior review loaded them with `--max-cost-usd 0`).
- `evals/orchestration-ab/build.sh` behavior on a clone without the retired refs (not run).
