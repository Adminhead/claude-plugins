# G10: Repo-wide tooling review (plugins.py, tests, installer, evals infra, CLAUDE.md)

Everything here is read-only. The probes live in `(review scratchpad) probes/`: `fm.py` (strict YAML over every SKILL/agent/command/eval file), `evals.py` + `rx.mjs` (grader schema, JS regex compile, skill-name targeting), `cov2.py` (coverage), `rootplug.py` (root suite plugin lists), `mut/` (a mutated repo copy used to measure `check`), and `loadcheck.txt` (a zero-cost load of every suite).

## Summary

- **[high] `plugins.py check` catches none of 14 injected eval/skill defects.** I copied the repo to `probes/mut/` and injected: nested double quotes in an eval description (the actual cold-read failure), a SKILL.md `name` that doesn't match its dir, a description over 1024 chars, `autoCompactWindow` in an agent, an invalid grader YAML, an uncompilable grader regex, a grader aimed at a nonexistent skill, an unknown `prompt.md` key (`run:`), a colon in a root-suite description, an off-vocabulary marketplace category, a case with no graders, a missing `plugins:` entry, a hard negative without `arm: both`, and `(?i)` in a JS regex. `check` printed `ok` for all of them. `claude plugin validate --strict` also passed the name mismatch, the 1100-char description and `autoCompactWindow`.
- **[high] The existing eval lint misses the bug it was written for.** `eval_frontmatter_errors` (scripts/plugins.py:286-302) only flags an unquoted `: ` in `name`/`description`. It doesn't catch nested quotes (`description: "say "hi""`, the cold-read failure in docs/research/evals-2026-10-23.md), other keys, or grader files. It also scans only `plugins/*/evals` (line 292), so the four root suites under `evals/` aren't linted at all.
- **[high] There's a free full-suite load check, and nothing uses it.** `claude plugin eval <target> --trust-plugin --ablation none --max-cost-usd 0 --no-publish` parses every case and grader, reports YAML errors, unknown keys, missing graders and bad `plugins:` paths, then stops before any model call ($0.00). Across all 124 suites it found two real problems:
  - `plugins/forgejo-ship/evals/*` (2 cases) fail to load under the per-plugin target because `plugins: ["../../../forgejo-shipper", ...]` falls outside the containment root. They load only via `claude plugin eval . --eval-dir plugins/forgejo-ship/evals`, and nothing documents that.
  - All 18 `evals/jvm` cases fail without the `3rd-party/gradle-skills` clone. The README documents this, but no check warns about it.
- **[med] 24 SKILL.md and 4 agent files are invalid strict YAML** (unquoted `: ` inside `description`). Claude Code's lenient parser accepts them (`validate --strict` passes), but the eval loader's parser rejects the same construct, and so do the Agent Skills spec and any other strict consumer. Files: threat-model, aws, deprecation-migration, aws-cli, golang-cli, git-history, the-fool, docker, godot-multiplayer, better-auth, necromancy, homelab-network, catchup, rust, dotnet-testing, gh-release, aspnet-core, ansible, aspire, blazor, godot-csharp, golang-performance, gh-triage, ef-core (skills), plus agents coder, coder-high, coder-max, coder-critical (e.g. plugins/aws/skills/aws/SKILL.md:3 `...covers IAM: AccessDenied...`).
- **[med] Content ships without a version bump, and nothing enforces bumps.** necromancy got `91b65f1 fix(necromancy): tighten masking...` (84 lines across SKILL.md and scripts) and is still at 0.1.0 from 837b396. vet (abdf3c0) is the same. v0-rewrite, reorder and leakage-audit (0e5a726) are one-line changes. The clone is shallow (50 commits), so there may be more. Installed copies won't update. The bump rule exists only in `.claude/skills/ship-plugin/SKILL.md` §2, not in `check`.
- **[med] Eval coverage is thin and mostly single-run routing.**
  - 137 of 257 plugins have no evals of their own, including 75 skill plugins.
  - Of the 120 suites, 57 have no hard negative for their own skill. `skill-evals/SKILL.md:120` requires at least one.
  - 361 cases have 554 graders: 499 `tool_used`, 35 `regex`, 14 `llm`, 6 `file_exists`, and no `tool_order` or `baseline`.
  - Only 21 cases across 15 plugins grade an outcome.
  - 285 of 361 cases commit `runs: 1`, and 44 cases leave `model` unpinned. The skill-evals checklist (SKILL.md:122,131) forbids both.
- **[med] The root paired suites have drifted from the metas they mirror.** Every `evals/godot-meta` case lacks `feature-flags`, `leakage-audit` and `grep-app`, all of which `programming-core` now installs. `evals/jvm` lacks `leakage-audit`. The READMEs say "keep in step", but nothing checks it.
- **[med] There's no CI.** There's no `.github/` or `.forgejo/` directory, so `check`, `test_plugins.py`, `install.spec.mjs`, the plugin `*.spec.ts` and mod tests run only when someone remembers.
- **[med] CLAUDE.md describes archived plugins as live.** `coremods` and `crew` now live only in `archive/plugins/`, and no live plugin has a hooks.json with both `"modules"` and `"hooks"`, a DuckDB hook, or the `plugin-root` data-dir pattern.
- Tests: `uv run --with pytest pytest scripts/test_plugins.py` → 34 passed. `python3 scripts/test_plugins.py` fails with `ModuleNotFoundError: pytest` (no `__main__`, and pytest isn't importable by the system python3). `bun test scripts/install.spec.mjs` → 12 pass. `node --test scripts/install.spec.mjs` → 12 pass. `plugins.py check` → ok. `catalog --check` → ok. `claude plugin validate --strict` → passes on the marketplace and all 257 plugins.

## Findings by area

### scripts/plugins.py `check`: gaps, measured

The baseline repo passes. Each defect below was injected into `probes/mut/`. "Loader" means `claude plugin eval --max-cost-usd 0`, "validate" means `claude plugin validate --strict`.

| Defect | check | validate | loader |
|---|---|---|---|
| Nested `"` in eval description | missed | n/a | caught |
| Unquoted `: ` in a **root-suite** prompt description | missed (root `evals/` not scanned, :292) | n/a | caught |
| Grader file invalid YAML (`input_match: "skill": "redis"`) | missed | n/a | caught |
| Unknown prompt.md key (`run: 3`) | missed | n/a | caught |
| Case dir with prompt.md and no graders | missed | n/a | caught |
| `plugins:` entry that doesn't exist | missed | n/a | caught |
| Uncompilable grader regex `(unclosed` | missed | n/a | **missed** (fails only at run time) |
| `tool_used: Skill` grader naming a nonexistent skill | missed | n/a | **missed** |
| Skill hard negative (`max: 0`) without `arm: both` | missed | n/a | **missed** (silently unscored in the two-arm run) |
| `(?i)` in a regex pattern (JS has no inline flags) | missed | n/a | **missed** |
| SKILL.md `name: rediz` in dir `redis` | missed | **missed** | n/a |
| SKILL.md description 1100 chars | missed | **missed** | n/a |
| SKILL.md with unquoted `: ` (strict-YAML invalid) | missed | passes (lenient) | n/a |
| Agent with `autoCompactWindow` (CLAUDE.md:8 forbids) | missed | **missed** | n/a |
| Marketplace `category` not in {development, meta, bundle} / leaf with `meta` | missed | missed | n/a |
| Meta dependency on a nonexistent plugin | caught | | |

Current repo state for the checks I could run with real data:
- All 534 regexes compile as JS. No Skill grader targets a missing skill except the deliberate externals: `gradle-skills:*`, `general-purpose` in orchestration, and `create-skill|skill-creator` in agent-instructions.
- Every positive `fires-*` grader matches its own plugin's skill in both bare and `plugin:skill` forms. None is overbroad (the closing-quote convention holds).
- Every Skill hard negative has `arm: both`. The Bash-level `max: 0` graders in dependabot and forgejo-ship lack it, but `tool_used` on Bash is scored in both arms anyway, so that's fine.
- No skill name/dir mismatch, no description over 1024 chars, no agent with `autoCompactWindow`. These are all clean today and unguarded.

Smaller code issues:
- [med] scripts/plugins.py:286-302 `eval_frontmatter_errors` should parse with real YAML. PyYAML isn't stdlib; options are `uv run --with pyyaml`, a vendored minimal check, or shelling out to the zero-cost loader. It should also cover `evals/*/evals/**`, graders and `case.yaml`.
- [med] There's no category validation. `new()` (:519) always writes `development`, and `category_for` (:530) runs only at `register`. `aspnet-core` and `ef-core` are `"category": "meta"` (.claude-plugin/marketplace.json:1164, :1234) but are leaf skill plugins. `is_meta` is name-based, so the catalog is right, but the marketplace UI files them under meta. Add: category == `meta` iff `is_meta(name)`, and category ∈ {development, meta, bundle}.
- [low] scripts/plugins.py:305-310 `shared_copies` globs `*/*/{rel}` at exactly depth 2. A copy at `plugins/x/hooks/lib/shell/walk.ts`, or a renamed copy, escapes both drift detection and `sync-shared`. Better to fail on any file under `plugins/` whose bytes start like `unbash.js` or that imports `./vendor/unbash` without a tracked copy, or to keep an explicit manifest of copies.
- [low] `godot_version_errors` and `agent_spawn_errors`/`agent_rows` read frontmatter with line regexes (`^description:\s*(.+)$`), so a folded `description: >` is skipped silently.
- [low] scripts/test_plugins.py has no test for "dependency X is not in this marketplace" (the code path works; I verified it by mutation).
- [low] scripts/test_plugins.py:268 tests only the unquoted-colon case. Add the nested-quote and root-suite cases once the lint covers them.

### scripts/install.mjs / install.spec.mjs

- [low] `mergeSettings` lets example scalars win (install.mjs:31-55). The `keep` set protects only `false` (off) plugins, so a user who sets an example-enabled plugin to `false` gets it re-enabled on every rerun. The spec doesn't cover that case. Either extend `keep` to every `enabledPlugins` key the user already set, or document it.
- [low] It overwrites `model` and every other scalar without asking. That's documented in the header comment but not printed as a warning before the write. `--dry-run` exists.
- The specs pass under both bun and node, and examples/claude-settings `enabledPlugins` ids all resolve to real marketplace entries (only the `<plugin>@adminhead` placeholders in settings.project/local.json don't).

### scripts/catalog-3rd-party.py

- [low] It hand-parses frontmatter (:13-42) and writes untrusted third-party descriptions into `docs/3rd-party/*/catalog.md`. Pipes are escaped (:45), but Markdown and link injection isn't, and Claude later reads those docs. A low-impact prompt-injection surface: wrap descriptions in code spans, or strip `[`/`]`/`<`.

### scripts/shared sync

The check works today: 4 guard plugins carry walk/unbash and 2 carry usagelog, and no drift. The depth-2 glob blind spot is noted above.

### CLAUDE.md accuracy

- [med] CLAUDE.md:14 gives `coremods` and `crew` as example commit scopes. Both are archived (`archive/plugins/coremods`, `archive/plugins/crew`). Use live ones such as `bash-rules` or `orchestration`.
- [med] CLAUDE.md:18 and :20 point to `plugins/coremods/hooks/register.tsx` and `plugins/coremods/hooks/`, which don't exist. Live mods: `plugins/usage-log/hooks/register.tsx`, `plugins/bash-rules/hooks/`.
- [med] CLAUDE.md:26 says hooks.json "can hold both `modules` and classic `hooks` (coremods does)", and that hook-side scripts in `plugins/coremods/scripts/` can use `@duckdb/node-api` installed by SessionStart. No live plugin does either. Point at `archive/plugins/coremods` explicitly, or drop the example. Live `*.spec.ts` examples: `plugins/check-bypass-guard/scripts/tests/`, `plugins/usage-log/scripts/usage-report.spec.ts`.
- [low] CLAUDE.md doesn't say how to run the repo's own tests. README.md:441 has `uv run --with pytest pytest scripts/test_plugins.py`, and install.spec.mjs:1 has `node --test`.
- [low] `.claude/skills/mod-authoring/references/{testing,examples,sandbox}.md` hard-code `/home/buck/Projects/adminhead/claude-plugins/...` (5 occurrences). Use repo-relative `archive/plugins/coremods/`.
- [low] `.claude/skills/skill-evals/SKILL.md:49` annotates `runs: 1` in the canonical example while :122 and :131 forbid committing it. Authors copied the example: 285 of 361 cases have `runs: 1`. Either change the example to omit `runs`, or relax the rule for routing-only cases and say so.

### Eval organization

- Per-plugin suites live in `plugins/<p>/evals/<case>/` (120 plugins, 307 cases, 29 with `case.yaml`). Root paired suites live in `evals/{forges,godot-meta,jvm,orchestration}/evals/` (54 cases) and are run from the repo root with `--eval-dir`.
- forgejo-ship's two outcome cases are effectively root-style suites (they load sibling plugins) living under a plugin dir, so the per-plugin command fails. Move them to `evals/forgejo/`, or document `--eval-dir plugins/forgejo-ship/evals` from the root.
- Root suites hard-code `plugins:` lists (16 to 30 entries, repeated in every case). They've already drifted (godot-meta lacks feature-flags, leakage-audit and grep-app; jvm lacks leakage-audit). Generate them from `closure()`, or check them (proposal 3).
- Model pin: 317 cases pin `claude-sonnet-5-5`. 44 don't: all 12 orchestration cases, ef-core 4, dotnet-testing 4, aspnet-core 4, tilt 3, mise 3, aws-cli 3, aws 3, unit-testing 2, e2e-testing 2, plus 1 each in problem-solving, coding, agent-instructions and adr-writing.
- Runs: 285 cases `runs: 1`, 59 `runs: 3`, 17 default.
- Grader key usage is within the documented schema. No unknown keys were found (the loader would refuse them).

## Eval coverage

Totals:
- 120 plugins with their own suites, 307 own cases.
- 223 own-skill positives, 81 own-skill hard negatives, 21 outcome cases.
- Root suites add routing positives for 11 agent plugins that have no suite of their own: architect, browser-tester, coder, coder-critical, coder-max (negative only), dba, debugger, devops, reviewer, scribe, security-auditor.

Distribution of cases per plugin:

| Cases | Plugins |
|---|---|
| 1 | 45 |
| 2 | 10 |
| 3 | 36 |
| 4 | 20 |
| 5 | 7 |
| 6 | 1 |
| 13 | 1 (ui-direction) |

Plugins with an outcome case (count in brackets): ui-direction (6), forgejo-ship (2), and 1 each for dependabot, gradle, java, java-testing, maven, play-framework, react, sbt, scala, sentry-sdk, spring-boot, spring-boot-testing and unit-testing.

### Per-plugin table (plugins with their own evals)

Column definitions:
- **Pos**: case expects own skill/agent to fire.
- **Hard neg**: case asserts own skill does NOT fire.
- **Neighbour guard**: case asserts a different skill does not fire.
- **Outcome**: case has a non-routing grader.
- `*`: no own-skill hard negative.

| Plugin | Cases | Pos | Hard neg | Neighbour guard | Outcome | runs:1 | Unpinned |
|---|---|---|---|---|---|---|---|
| adr-writing * | 1 | 1 | 0 | 0 | 0 | 1 | 1 |
| agent-config-audit * | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| agent-instructions * | 1 | 1 | 0 | 0 | 0 | 1 | 1 |
| ansible * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| api-idempotency * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| api-keys * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| api-oauth-provider * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| api-rest-design * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| api-webhooks * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| aspire | 3 | 2 | 1 | 1 | 0 | 3 | 0 |
| aspnet-core | 4 | 3 | 1 | 1 | 0 | 4 | 4 |
| aws | 3 | 2 | 1 | 0 | 0 | 3 | 3 |
| aws-cli | 3 | 2 | 1 | 0 | 0 | 3 | 3 |
| aws-cloudwatch * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| aws-resource-query * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| aws-well-architected * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| bash * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| blazor | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| catchup | 4 | 2 | 2 | 0 | 0 | 4 | 0 |
| click-path-audit * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| coding * | 1 | 1 | 0 | 1 | 0 | 1 | 1 |
| cold-read | 4 | 2 | 2 | 0 | 0 | 4 | 0 |
| csharp | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| dependabot * | 2 | 1 | 0 | 1 | 1 | 2 | 0 |
| deprecation-migration | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| devcontainer * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| dotnet-ai-apps | 5 | 3 | 2 | 1 | 0 | 5 | 0 |
| dotnet-diagnostics | 5 | 3 | 2 | 2 | 0 | 5 | 0 |
| dotnet-native-interop | 4 | 3 | 1 | 3 | 0 | 4 | 0 |
| dotnet-performance | 5 | 2 | 3 | 0 | 0 | 5 | 0 |
| dotnet-template-authoring | 4 | 3 | 1 | 2 | 0 | 4 | 0 |
| dotnet-testing | 4 | 3 | 1 | 2 | 0 | 4 | 4 |
| dotnet-upgrade-guide | 5 | 3 | 2 | 0 | 0 | 5 | 0 |
| doubt-review | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| e2e-testing | 2 | 1 | 1 | 1 | 0 | 2 | 2 |
| ef-core | 4 | 3 | 1 | 1 | 0 | 4 | 4 |
| esp-idf * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| experiment-loop * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| forgejo-actions * | 2 | 2 | 0 | 0 | 0 | 2 | 0 |
| forgejo-cli * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| forgejo-issues * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| forgejo-pr * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| forgejo-readme * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| forgejo-release * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| forgejo-ship * | 2 | 0 | 0 | 0 | 2 | 2 | 0 |
| game-ai | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| game-architecture * | 2 | 2 | 0 | 1 | 0 | 2 | 0 |
| game-assets | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| game-audio | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| game-design | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| game-feel | 2 | 1 | 1 | 1 | 0 | 2 | 0 |
| game-genres | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| game-performance | 2 | 1 | 1 | 0 | 0 | 2 | 0 |
| game-playtest | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| game-prototype | 3 | 2 | 1 | 1 | 0 | 3 | 0 |
| game-publish | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| game-ui | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| gh-actions * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| gh-issues * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| gh-pr * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| gh-readme | 4 | 3 | 1 | 0 | 0 | 4 | 0 |
| gh-triage * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| godot | 4 | 2 | 2 | 0 | 0 | 4 | 0 |
| godot-addons | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-csharp | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-editor-tools | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-export | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-gdextension | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-multiplayer | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-physics | 3 | 2 | 1 | 1 | 0 | 3 | 0 |
| godot-shaders | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-testing | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| godot-xr | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| golang * | 2 | 2 | 0 | 2 | 0 | 2 | 0 |
| golang-cli * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| golang-performance * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| gradle | 4 | 3 | 1 | 0 | 1 | 0 | 0 |
| implement-plan * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| issue-breakdown * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| java | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| java-testing | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| leakage-audit | 4 | 2 | 2 | 0 | 0 | 4 | 0 |
| level-design * | 2 | 2 | 0 | 1 | 0 | 2 | 0 |
| maven | 4 | 3 | 1 | 0 | 1 | 3 | 0 |
| mcp-server * | 3 | 3 | 0 | 2 | 0 | 3 | 0 |
| mcp-server-audit * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| mcp-server-review * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| mise | 3 | 2 | 1 | 0 | 0 | 3 | 3 |
| msbuild | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| mysql * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| nuget | 3 | 2 | 1 | 2 | 0 | 3 | 0 |
| play-framework | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| pr-comments * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| pre-commit * | 2 | 2 | 0 | 0 | 0 | 2 | 0 |
| problem-solving * | 3 | 3 | 0 | 3 | 0 | 3 | 1 |
| production-readiness * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| promql * | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| prototype * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| react * | 1 | 1 | 0 | 0 | 1 | 1 | 0 |
| redis * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| renovate * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| research * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| review-loop * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| roslyn-analyzers | 3 | 2 | 1 | 1 | 0 | 3 | 0 |
| sbt | 4 | 3 | 1 | 0 | 1 | 0 | 0 |
| scala | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| sentry-sdk * | 1 | 1 | 0 | 0 | 1 | 1 | 0 |
| ship * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |
| spring-boot | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| spring-boot-testing | 4 | 3 | 1 | 0 | 1 | 4 | 0 |
| ssot-consolidate | 4 | 2 | 2 | 0 | 0 | 4 | 0 |
| terraform * | 5 | 5 | 0 | 2 | 0 | 5 | 0 |
| test-gap-audit * | 3 | 3 | 0 | 3 | 0 | 3 | 0 |
| the-fool | 3 | 2 | 1 | 0 | 0 | 3 | 0 |
| tilt | 3 | 2 | 1 | 0 | 0 | 3 | 3 |
| ui-direction | 13 | 9 | 4 | 0 | 6 | 0 | 0 |
| unit-testing | 5 | 4 | 1 | 3 | 1 | 5 | 2 |
| v0-rewrite | 5 | 2 | 3 | 0 | 0 | 5 | 0 |
| vet | 6 | 2 | 4 | 0 | 0 | 6 | 0 |
| vite * | 1 | 1 | 0 | 1 | 0 | 1 | 0 |

### The 137 plugins with zero evals of their own, by type

| Type | Count | Plugins |
|---|---|---|
| skill | 75 | accessibility-review, api-graphql, api-grpc, app-auth, better-auth, chezmoi, codebase-design, config-audit, db-schema-design, debloat, dependency-vetting, design-critique, design-handoff, design-system, devenv, docker, docs-audit, domain-modeling, fastapi, feature-flags, file-conversion, forgejo-pr-comments, gh-code-security, gh-release, gh-repo-setup, git-commit, git-flow, git-history, gitops, godot-mcp-setup, grafana-dashboards, handoff, helm, homelab-network, hubflow, javascript, kubernetes, macrothink, modernize, necromancy, observability-instrumentation, pass-cli, planning, playwright-cli, poka-yoke, postgres, postmortem, prism, prisma, privacy-review, prove, python, python-packaging, recommend-plugins, reorder, rollout-plan, rust, screen-reader-testing, second-opinion, security-scan, session-retro, setup-wizard, tanstack, termwright, test-run, threat-model, trunk-based, ts-module-boundaries, typescript, uiux-lookup, ux-copy, v0-restart, vue, web-design, web-development |
| agent | 18 | architect, browser-tester, coder, coder-critical, coder-high, coder-max, dba, debugger, devops, forgejo-shipper, open-source-release-audit, plugin-vetter, reviewer, scribe, security-auditor, shipper, ui-critic, web-perf-auditor (11 of these get root-suite routing coverage from `evals/orchestration`; coder-high, forgejo-shipper, open-source-release-audit, plugin-vetter, shipper, ui-critic, web-perf-auditor have none) |
| mod (TSX `modules`) | 10 | agent-router, agent-status, bash-rules, cache-clock, consult, git-statusline, mcp-health, turn-stats, usage-band, usage-log (these are covered by `claude plugin test` instead; evals apply only to model-visible behaviour such as agent-router's routing or consult's slash command) |
| classic hook | 7 | atlassian-docs, check-bypass-guard, cloud-ops-guard, docs-sync, orchestration (agent + hook; root suite covers it), outline-docs, readonly-agent-gate |
| mcp | 7 | atlassian-mcp, aws-knowledge, aws-mcp, forgejo-mcp, grep-app, outline-mcp, sentry-mcp-self-hosted |
| meta | 17 | aws-meta, baseline, design-meta, dotnet-meta, forgejo-meta, github-meta, godot-meta, golang-meta, iac-meta, java-meta, kubernetes-meta, node-typescript-meta, orchestration-meta, python-meta, rust-meta, scala-meta, web-meta (forges, godot-meta and jvm get paired root suites; the rest have none) |
| bundle | 3 | design-core, gamedev-core, programming-core |

Notable zero-eval skill plugins with heavy sibling overlap. These should come first:
- git-commit, git-history, git-flow, trunk-based and hubflow: branching-model overlap.
- postgres, prisma and db-schema-design.
- typescript, javascript, ts-module-boundaries and tanstack.
- python, python-packaging and fastapi.
- docker, kubernetes, helm and gitops.
- planning: in programming-core, so it's installed everywhere.
- design-critique, design-system, design-handoff, ux-copy and accessibility-review: these collide with the `design:*` plugin skills of the same names that are commonly installed.
- necromancy and handoff.

## Proposed infra improvements

1. **`plugins.py check` eval lint** (stdlib-only, or `uv run --with pyyaml`). For every `prompt.md`, `case.yaml` and `graders/*.md` under `plugins/*/evals` **and** `evals/*/evals`, it should:
   - Parse the frontmatter as YAML (catches nested quotes and the colon bug).
   - Reject keys outside the documented sets (prompt keys from cli.md; grader keys per type).
   - Require at least 1 grader per case, and check `type` ∈ {regex, tool_used, tool_order, file_exists, llm, baseline}.
   - Compile `pattern`/`input_match` as JS (`node -e 'new RegExp(p,f)'` in one batch process, or a Python approximation plus rejecting `(?i)`).
   - Check that every `tool_used: Skill` regex matches at least one existing `skill` or `plugin:skill` (allowlist external marketplaces from `allowCrossMarketplaceDependenciesOn`).
   - Require `arm: both` on Skill graders with `max: 0`.
   - Check that every `plugins:` entry exists.
   - Warn on `runs: 1`, and on a missing `model` for non-routing cases.
2. **Same lint for SKILL.md and agents.** Strict YAML, `name` == dir/stem, name ≤ 64 chars `[a-z0-9-]`, description 1 to 1024 chars, no `autoCompactWindow` in `agents/*.md` (enforces CLAUDE.md:8), body ≤ 500 lines (warn). Then fix the 28 strict-YAML files by single-quoting their descriptions.
3. **Root-suite closure check.** For `evals/forges`, `evals/godot-meta` and `evals/jvm`, compute the expected leaf set from `closure()` plus a per-suite `extra`/`exclude` list (e.g. jvm excludes grep-app/context7) and diff it against each case's `plugins:`. Better still, add `plugins.py eval-sync` to rewrite the lists, the way `sync-shared` does.
4. **`plugins.py check --evals-load`.** Runs `claude plugin eval <p> --trust-plugin --ablation none --max-cost-usd 0 --no-publish --output-dir $TMP` for each suite and fails on `failed to load`. It's free, takes about 1 s per suite, and uses Claude Code's own parser, so it keeps up with schema changes. Skip it when `claude` isn't on PATH. Caveat: it relies on the $0 ceiling aborting before the first run, which is observed behaviour, not documented.
5. **`plugins.py coverage`.** Prints this report's table (pos / hard-neg / guard / outcome / runs:1 / unpinned per plugin, plus zero-eval plugins grouped by type). With `--min`, it enforces a rule: every skill plugin needs ≥1 positive and ≥1 own-skill hard negative, and every agent plugin needs ≥1 routing positive in some suite. Use an allowlist file for the 75+57 current violators, ratcheted down, so the rule bites only on new or changed plugins.
6. **Version-bump guard.** `plugins.py check --since <ref>` (default `origin/main`). For each plugin with changed files outside `evals/` and `README.md`, require `plugin.json` `version` to be greater than the version at `<ref>`, and for metas require a bump when `dependencies` change. This would have caught necromancy 0.1.0 after 91b65f1.
7. **Marketplace category rule.** Category ∈ {development, meta, bundle}, `meta` iff `is_meta`. Fix aspnet-core/ef-core.
8. **CI workflow** (GitHub Actions and/or Forgejo Actions, since the repo targets both):
   - Every push: `python3 scripts/plugins.py check`, `catalog --check`, `uv run --with pytest pytest scripts/test_plugins.py`, `node --test scripts/install.spec.mjs`, `bun test` over `plugins/*/scripts/**/*.spec.ts` and skill `tests/`, `claude plugin test` for each mod, `claude plugin validate --strict` for changed plugins, and the zero-cost eval load (4).
   - Nightly or on demand, for changed plugins only: `claude plugin eval plugins/<p> --trust-plugin --json --threshold 0.8 --model claude-sonnet-5-5 --judge-model <pinned> --no-publish --max-cost-usd N`.
   - Weekly: the root paired suites at `--runs 3`.
9. **Docs hygiene.**
   - CLAUDE.md: replace the coremods/crew references with live plugins or explicit `archive/` paths, and add a "Tests" line with the three commands.
   - Give scripts/test_plugins.py a `if __name__ == "__main__": sys.exit(pytest.main([__file__]))` and a clear error when pytest is missing.
   - Make the `.claude/skills/mod-authoring` reference paths repo-relative.
   - Settle the `runs: 1` contradiction in skill-evals.
10. **Move forgejo-ship's cross-plugin cases** to `evals/forgejo-ship/` with a README (or set `"experimental": {"evals": ...}` and document the root invocation), so `claude plugin eval plugins/forgejo-ship` (what ship-plugin would run) doesn't fail.
