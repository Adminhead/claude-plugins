# Plugin review fixes

Source: `docs/research/plugin-review-2026-10-23/` (README plus G1 to G10). This plan covers the security fixes, the `plugins.py` tooling, honest evals, CLAUDE.md drift, and stale facts that can be checked against a primary source. Everything was re-checked on 2026-10-23 against main at 6fb8a05 plus the review commit (consult 0.3.1 and the paperthin fixes included).

## Goal and definition of done

Done means:
- Every OPEN row in the verification table below is fixed, or is listed under follow-ups with a reason.
- Each guard bypass has a must-flag test that failed before the fix and passes after it.
- `python3 scripts/plugins.py check` passes with the new rules turned on: strict YAML, grader regex and skill targeting, inert `max: 0` graders, manual-only routing graders, category rule and root-suite closure.
- `check --since <ref>` exists and passes for the plan's own commits.
- Every touched plugin passes `claude plugin validate --strict`, and its own tests pass: `claude plugin test` for mods, `bun test <spec paths>` for specs, pytest and shell suites.
- Every plugin whose content changed (outside `evals/` and `README.md`) is bumped in both `plugin.json` and `.claude-plugin/marketplace.json`, and the README catalog is regenerated.

## Verification of the review's findings

Status meanings: OPEN means it still reproduces on current code. FIXED means it no longer reproduces. PARTLY means part of it was fixed. WRONG means the claim does not hold. The guard rows were probed by importing each guard's own pure function with bun (`decide`, `analyze`/`askRule`, `run`, `checkFileWrite`). The probe script was `scratchpad/probe.ts` and is not part of the repo.

Result: no finding came back WRONG. Two are PARTLY fixed. Everything else is OPEN.

| # | Finding (source) | Status | Evidence on current code |
|---|---|---|---|
| V1 | check-bypass-guard: `git config [--global] core.hooksPath X`, `git config set core.hooksPath`, `git config commit.gpgsign false` pass (README §2, G1 high) | OPEN | `decide` returns null for all four. `-c core.hooksPath=` is denied. `gitHit` at `plugins/check-bypass-guard/scripts/git-bypass.ts:131` reads only `-c`, env and flag forms. The review's line refs for this file are stale. |
| V2 | check-bypass-guard: `pre-commit uninstall`, `chmod -x .git/hooks/pre-commit`, `echo x >> .eslintignore`, `rm .pre-commit-config.yaml`, `rm -rf .husky` pass (README §2, G1 high) | OPEN | `decide` returns null for all five. The Bash branch (`check-bypass-guard.ts:38-43`) calls only `checkGit`. `isProtectedName` (`config-protect.ts:50`) is used only for Edit, Write and MultiEdit. |
| V3 | cloud-ops-guard: allowlist allows `mise run tofu <env> plan`, `terraform plan` and `init`, and allows `init` in subagents (G1 high) | OPEN | `decide` returns `allow` for all three. `init` from a subagent (`agent_id` set) also returns `allow`. Code: `FORMS` at `cloud-ops-guard.ts:47-50`, `allowlisted` at `:141-154`, the allow at `:962`. |
| V4 | cloud-ops-guard: aliases and wrappers are unseen: `k`, `tf`, `kubecolor`, `oc`, `helmfile … destroy`, `pulumi destroy`, `nix run nixpkgs#terraform -- destroy`, `busybox sh -c`, `python3 -m awscli` (G1 high) | OPEN | `decide` returns null for every one. `TOOL_RE`/`K8S_RE` at `:25,28` gate all checks (`:959`). `SHELLS` at `:56` has no busybox. |
| V5 | cloud-ops-guard: `prd` is not production (README §2) | OPEN | `kubectl --context prd delete pv x` returns null, and the same command with `prod` returns deny. `PROD_RE` is at `:29`. |
| V6 | cloud-ops-guard: the subagent deny message tells the model to add `ALLOW: cloud-ops` itself (README §2) | OPEN | `SUBAGENT_REASON`, `cloud-ops-guard.ts:97`. |
| V7 | bash-rules misses `rm -rf /private/etc`, `find /etc \| xargs rm -f`, `npx rimraf ~`, `busybox rm -rf /`, `prisma migrate reset --force`, `rails db:drop`, `git push origin --delete main`, `jq . ~/.cla*/.credentials.json` (README §2, G1 med) | OPEN | `analyze` and `askRule` give no hit for any of them. `rm -rf /etc` and the literal `~/.claude/.credentials.json` do hit. Code: `danger.ts:43` WRAPPERS, `:230` SYSTEM_DIRS, `:309` CRITICAL_ROOTS, `:466` dbDrop, `:488` viaXargs, `:521` killByName, `:641` credentialsRead, `:882` askHit. |
| V8 | bash-rules sends unsure commands unredacted to ollama.com by default (README §2) | PARTLY | The `plugin.json` description now names the hop ("ollama.com for :cloud models"). Still open: the default is `ollamaModel: 'clef:cloud'` (`hooks/rules/judge.ts:24`, `plugin.json:26`), and `userPrompt` (`judge.ts:76-81`) sends the raw command with no `redact()`. |
| V9 | readonly-agent-gate: `ln -s src/a.ts /tmp/link` and then a Write to `/tmp/link` edits the repo. `sqlite3` DML, `make install` and `scp` are allowed (README §2, G1 med) | OPEN | `run` returns 0 (allow) for `ln -s`, `sqlite3 db "insert …"`, `make install` and `scp host:f .`. `psql -c "insert …"` returns 2. `checkFileWrite({Write /tmp/link})` returns null, because the check is string-only (`scratch.ts:59-75`). `readonly-bash.cases.sh:255` asserts the `ln -s` allow. The same hole exists for Bash redirects through the link, and for hard links. |
| V10 | usage-log: the prune runs `find -name '*.jsonl' -delete` in an env-chosen directory (README §2, G1 med) | OPEN | `scripts/shared/log/usagelog.ts:55,61-64`, vendored to bash-rules and usage-log. `usage-log/scripts/usage-report.ts:205` sets `CLAUDE_USAGE_LOG_DIR` on purpose, so the override itself must stay. |
| V11 | security-scan runs `pip-audit -r requirements*.txt` and `pip-audit <dir>` without `--no-deps --disable-pip` (README §3, G8 high) | OPEN | `skills/security-scan/scripts/scanners.py:269-276`. Only the `uv.lock` path (`:267`) is safe. pip-audit's README: "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`". `--no-deps` "requires all requirements are pinned". `--disable-pip` needs hashes or `--no-deps`. |
| V12 | coder, coder-high, coder-critical, coder-max and scribe have no `tools:` allowlist (README §3, G2 high) | OPEN | Line 6 of each agent file has only `disallowedTools: Agent, Workflow, mcp__claude-in-chrome`. dba and devops already use the allowlist shape. |
| V13 | test-run's grant plus `--cmd` runs any command without a prompt (README §3) | OPEN | `test-run/skills/test-run/SKILL.md:6` has `Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py *)`. `--cmd` is parsed at `scripts/run_tests.py:53`. The only guard is prose at `SKILL.md:22`. |
| V14 | playwright-cli's `Bash(playwright-cli *)` covers `run-code` and `state-save` (README §3) | OPEN | `playwright-cli/skills/playwright-cli/SKILL.md:4`. On playwright-cli 0.1.22, `--help` lists `eval`, `run-code`, `state-save/load`, `cookie-*`, `*storage-*`, `route`, `webmcp-call`. |
| V15 | godot-mcp-setup downloads the addon separately for the dry run and for the install (README §3) | OPEN | `install-addon.sh:20` has `URL=…/archive/HEAD.tar.gz`, fetched on every run (`:64`). |
| V16 | forgejo-release tags the branch head on the server (README §3, G7) | OPEN | `forgejo-release/SKILL.md:49` has `fj release … create "v1.4.0" -T --branch main`. |
| V17 | aws-well-architected puts `--region <region>` on `aws ce` (README §3, G6 high) | OPEN | `references/cost.md:3,10`. The aws skill's `references/cost.md:11,28` uses us-east-1 and cites the AWS General Reference. |
| V18 | aws-well-architected's secret-read deny list has drifted from the aws skills' list (README §3, G6 med) | OPEN | `SKILL.md:25` lacks `batch-get-secret-value`, `ecr get-login-password`, `eks get-token`, `rds generate-db-auth-token`, `ec2 get-password-data` and credential-minting `sts`. The full list is in `aws-resource-query/SKILL.md:29-43`. `aws-cloudwatch/SKILL.md:19` has the same drift. |
| V19 | `plugins.py check` catches none of 14 injected defects. The eval lint is a line regex over `plugins/*/evals` only (README §4, G10 high) | OPEN | `scripts/plugins.py:286-302` (glob at `:292`). No YAML parse, regex compile, skill targeting, name/dir, description length or `autoCompactWindow` rule. |
| V20 | 28 files fail strict YAML: 24 SKILL.md and 4 coder agents (README §4, G10 med) | OPEN | A PyYAML `safe_load` over 1136 frontmatter blocks finds the same 28: ansible, aspire, aspnet-core, aws, aws-cli, better-auth, blazor, catchup, deprecation-migration, docker, dotnet-testing, ef-core, gh-release, gh-triage, git-history, godot-csharp, godot-multiplayer, golang-cli, golang-performance, homelab-network, necromancy, rust, the-fool, threat-model, plus coder, coder-high, coder-critical, coder-max. All eval files parse. |
| V21 | No version-bump guard. necromancy, vet, v0-rewrite, reorder and leakage-audit changed without a bump (README §4) | OPEN | Each is still at 0.1.0, and its last content commit (91b65f1, abdf3c0, 0e5a726) is newer than its last `plugin.json` change. Today's the-fool, ssot-consolidate, catchup, v0-restart and consult fixes did bump. |
| V22 | No category rule; aspnet-core and ef-core are `meta` (README §4) | OPEN | Those two are the only `category`/`is_meta` mismatches in `marketplace.json`. `category` is never read by `check`. |
| V23 | The root suites' plugin lists have drifted from the metas (README §5, G10 med) | OPEN | Against `closure()`: `evals/godot-meta` lacks feature-flags, leakage-audit and grep-app. `evals/jvm` lacks leakage-audit (its README excludes grep-app on purpose). |
| V24 | No CI workflow (README §4) | OPEN | No `.github/`, `.forgejo/` or `.gitea/`. |
| V25 | CLAUDE.md points at `plugins/coremods` and `crew` (README §4, G10 med) | OPEN | CLAUDE.md:14, 18, 20 and 26, plus the `plugin-root` data-dir pattern at :23, which no live plugin uses. Both plugins live only in `archive/plugins/`. |
| V26 | About half of the `max: 0` Skill graders target an unloaded sibling (README §1; G3/G4/G5/G6/G7/G8/G9 high) | OPEN | Of 177 `max: 0` Skill graders, 92 in 65 plugins target a plugin that the case does not load (83 are own-skill, 2 other). The list is in the appendix. |
| V27 | Routing cases for `disable-model-invocation` skills can never pass (README §5, G7 high) | OPEN | `ship/evals/ship-routing/graders/fires-ship.md` and `pr-comments/evals/pr-comments-routing/graders/fires-pr-comments.md`. Both skills set `disable-model-invocation: true`. The gh-pr and forgejo-pr `not-*pr-comments` graders are vacuous and are in the V26 list. |
| V28 | 288 of 364 cases are `runs: 1`, and 44 are unpinned (README §5, G4 high) | OPEN | Same per-plugin counts as G10. Out of scope here (follow-up F3). |
| V29 | Free `--max-cost-usd 0` load check (README §4, G10 high) | not re-run | Re-running means invoking the eval runner, and the stop-before-spend behaviour is undocumented. Follow-up F4. |
| V30 | Three-way collision on "copies of a fact disagree" (G9 high) | PARTLY | a726bd9 now points ssot-consolidate's docs-only duplication at docs-audit. `v0-rewrite/SKILL.md:3` still claims "related docs have drifted apart", and no eval pins the boundary. Follow-up F1. |
| V31 | Testing-cluster collision between unit-testing and test-gap-audit, with no paired suite (G3 high) | OPEN | The unit-testing description was reworded ("decides which tests to run after a change") but still overlaps. No suite loads both plugins. Follow-up F1. |
| V32 | Zero-eval plugins and routing-only groups (G3/G5/G9 high) | OPEN | Per-plugin gap filling is out of scope (F2). |

## Approach

- **Shared code first, then guards in parallel.** The walker (`shell/walk.ts`) and the usage-log writer are vendored copies. Slice S0 edits only `scripts/shared/` and runs `sync-shared`. The guard slices then work on disjoint plugin trees. Group A workers must not edit `scripts/shared/`, must not edit the vendored copies (`plugins/*/hooks/shell|log|vendor`, `plugins/*/scripts/shell|vendor`), and must not run `sync-shared`. A shared-code need found mid-slice goes back to the lead as a follow-up S0b.
- **Keep guards pure and testable.** New logic goes in side files with no `$` (house rule), with must-flag tests built from the probe commands above.
- **Fail toward ask.** A guard that cannot tell gives `ask`, not allow. The cloud-ops allowlist stops auto-approving commands that run code from the repo, unless the user opts in.
- **Tooling before mass edits.** The new `check` rules land first (B1) and report the known violations. The apply slices (B2, C1 to C3) then clear them. Each apply slice's acceptance is "these check errors are gone".
- **marketplace.json is serialized.** Parallel slices edit only their own `plugin.json` (version and any description change). An integrator step at the end of each group copies versions and descriptions into `.claude-plugin/marketplace.json`, runs `scripts/plugins.py catalog`, then runs `check`. Until the integrator runs, a slice's `check` may report only `<p>: version|description differs between plugin.json and marketplace.json` for its own plugins.

Rejected alternatives:
- **Fix busybox and fish nesting separately in each guard.** Rejected: the three wrapper tables have already drifted (G1 cross-group notes). The walker is the shared parser.
- **Pin usage-log's directory to the user settings.** Rejected for now: `usage-report.ts:205` relies on the env override to keep a child `claude -p` out of the real log. Restricting what the prune deletes closes the data-loss path.
- **Convert inert sibling graders in place.** Rejected: they sit inside positive cases, so "the sibling stays quiet" cannot be measured there. They are deleted. New own-skill hard negatives are gap filling (F2).
- **Shell out to `claude plugin eval --max-cost-usd 0` from `check`.** Rejected as a default, because the stop-before-spend behaviour is undocumented. It stays an optional follow-up.
- **One giant tooling slice that also applies the fixes.** Rejected: rules and mass edits are reviewed differently, and the rules must be proven against the known violations first.

Assumptions:
- PyYAML is importable by `python3` where `check` runs (6.0.3 on this host). `check` fails with an install hint when it is missing (decision D5).
- `node` is on PATH for the JS regex compile batch. If node is missing, that rule prints a warning and skips (it does not fail).
- An agent `tools:` allowlist still lets the harness add `SubagentHandback` to a subagent. dba and devops already run with allowlists. A6 verifies this live and does not assume it.
- Permission rules cannot express "this command without `--cmd`". A grant either covers an entry point or it doesn't.

## Slices

Owner tiers: `coder` (mechanical), `coder-high` (design judgment), `coder-critical` (security guards). Every slice ends with `python3 scripts/plugins.py check`, and every touched plugin needs `claude plugin validate --strict plugins/<p>`. Version bumps go in `plugin.json` only. The integrator step mirrors them into marketplace.json (metas are bumped only if their `dependencies` change, and no slice here changes them).

### Order and parallel groups

```
S0 (serial)
  -> Group A, in parallel: A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A11
  -> RA (integrator, serial)
  -> B1 (serial)
  -> Group C, in parallel: B2 C1 C2 C3
  -> RC (integrator, serial)
  -> E1 (optional, needs user confirmation)
```

### S0. Shared walker and log prune (coder-critical, serial, first)

- **Files:** `scripts/shared/shell/walk.ts`, `scripts/shared/log/usagelog.ts`, new `scripts/shared/shell/walk.spec.ts`, new `scripts/shared/log/usagelog.spec.ts`. Running `sync-shared` also writes the vendored copies in bash-rules, check-bypass-guard, cloud-ops-guard, readonly-agent-gate and usage-log. S0 may also edit `plugins/bash-rules/tests/usagelog.test.ts` and `plugins/usage-log/tests/*`, where they assert the prune argv. Also `plugins/usage-log/.claude-plugin/plugin.json`.
- **Changes:**
  - `nestedScript` (`walk.ts:406`) unwraps `busybox sh|ash|bash -c`, `toybox sh -c` and `fish -c`, the same way it handles `sh -c`.
  - `pruneArgv` deletes only `\( -name 'usage-log-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].jsonl' -o -name 'bash-rules-…' \)` under `-maxdepth 1 -type f`. The name set comes from one exported `STREAMS` constant, which `logFile` validates against.
  - The `CLAUDE_USAGE_LOG_DIR` override stays. Trust model, stated in the header: the directory comes from the user's environment and is trusted. The fix stops a misconfigured or project-set directory from losing unrelated files. It does not claim safety against an adversary who controls the filesystem, so there is no ownership or link check on the directory.
- **Tests:**
  - walk.spec: `busybox sh -c 'rm -rf /'` yields the nested script.
  - usagelog.spec: the prune argv never matches `abc.jsonl` or `<uuid>.jsonl`. A tmp-dir run with an old `x.jsonl` and an old `usage-log-2020-01-01.jsonl` deletes only the second.
- **Acceptance:**
  - `bun test scripts/shared`.
  - `python3 scripts/plugins.py sync-shared && python3 scripts/plugins.py check`. No drift is allowed; only the usage-log version/description mismatch may remain.
  - `claude plugin test plugins/bash-rules`. The two known wall-clock timing failures (G1 low) are allowed.
  - `claude plugin test plugins/usage-log`, `bun test plugins/usage-log/scripts`, and `bun test plugins/check-bypass-guard/scripts/tests plugins/readonly-agent-gate/scripts/tests`.
  - `bash plugins/cloud-ops-guard/scripts/tests/check.sh` and `bash plugins/readonly-agent-gate/scripts/tests/readonly-bash.cases.sh`, so the stricter nesting breaks no existing case.
- **Bump:** usage-log 0.1.0 → 0.1.1. The other four plugins are bumped once each by their Group A slice.

### A1. check-bypass-guard: persistent bypasses and Bash writes (coder-critical)

- **Files:** `plugins/check-bypass-guard/scripts/{git-bypass.ts,check-bypass-guard.ts,config-protect.ts}`, new `scripts/bash-protect.ts`, `scripts/tests/*.spec.ts`, `.claude-plugin/plugin.json`, `README.md` (new, optional).
- **Changes:**
  - `gitHit` (`git-bypass.ts:131`) gets a `config` subcommand branch that classifies every mutation of git config. It covers modern and legacy syntax, with any scope or file option (`--local|--global|--system|--worktree|--file F|--blob`):
    - `git config <key> <value>`, `git config set …`, `--add`, `--replace-all`
    - `--unset`, `--unset-all`, `unset`
    - `--remove-section`/`remove-section` and `--rename-section`/`rename-section`, where the section is `core`, `commit`, `tag`, `include` or `includeIf.*`
    - `--edit`/`edit`, which gets `ask`

    It reuses `isHookKey` and `isSignOff`. A mutation that sets or drops `core.hooksPath`, `include.path`/`includeIf.*.path`, or that sets `commit.gpgsign`/`tag.gpgsign` false (or unsets or removes them) gives `deny`. `get`, `list`, `--get*` and `--list` stay allowed.
  - New pure `protect-path.ts`, a path-aware matcher for protected configs (`isProtectedName`) and for any path under `.husky/`, `.git/hooks/`, `<gitdir>/hooks/` of a linked worktree, or `.git/config`. Both callers use it:
    - The file-tool branch (`check-bypass-guard.ts:44-53`) gives `ask` for Write/Edit/MultiEdit on those paths, existing or new. Today it filters by basename only (`:46`).
    - New pure `bash-protect.ts`, called from the Bash branch after `checkGit`, gives `ask` when a redirect target, or the operands of `rm`/`mv`/`cp` (destination)/`sed -i`/`perl -i`/`truncate`/`tee`/`chmod`/`ln`, match. It also asks on `pre-commit uninstall`, `husky uninstall` (including through `npx`/`pnpm dlx`/`bunx`) and `lefthook uninstall`.
  - Add `.lintstagedrc*`, `lint-staged.config.*`, `commitlint.config.*` and `.commitlintrc*` to `NAMES`/`PATTERNS` (`config-protect.ts:7,35`).
- **Must-flag tests:**
  - Every V1 and V2 command.
  - `git config --local core.hooksPath x`, `git config --remove-section core`, `git config --rename-section commit x`, `git config --unset-all commit.gpgsign`.
  - `sed -i s/x/y/ .eslintrc.json`, `mv .pre-commit-config.yaml /tmp/`, `npx husky uninstall`.
  - Write to a new and to an existing `.husky/pre-commit`, Write to `.git/hooks/pre-commit`, and Edit of `.git/config`.
- **Must-pass tests:** `git config user.name x`, `git config --get core.hooksPath`, `echo x >> notes.txt`, `rm build/out.js`.
- **Acceptance:** `bun test plugins/check-bypass-guard/scripts/tests`, plus a bun one-liner over `decide` that shows every V1/V2 command now returns non-null.
- **Bump:** 0.1.0 → 0.2.0. The description gains "and Bash writes to those configs".

### A2. cloud-ops-guard: allowlist opt-in, aliases, wrappers, prod names, deny text (coder-critical)

- **Files:** `plugins/cloud-ops-guard/scripts/cloud-ops-guard.ts`, `scripts/tests/check.sh`, `scripts/cloud-ops-guard.spec.ts`, `hooks/hooks.json` (only if the option env must be passed), `.claude-plugin/plugin.json`, `README.md` (new).
- **Changes:**
  1. Add a userConfig `autoAllowReadOnly` (boolean, default false; decision D2), read from `CLAUDE_PLUGIN_OPTION_AUTOALLOWREADONLY` (confirm the env name the way readonly-agent-gate reads `extra_agents`).
     - Gates come first: in `decide` (`:952-969`), the subagent brief-token check for `gate` kinds runs before, and independently of, the allow decision.
     - Then, when the option is false, `allowlisted` forms return null (no opinion) instead of `allow`. When it is true, they return `allow` as now.
     - `init` is classified as `gate` in the common classifier (today it is `safe` in `tfForm` and quiet in `QUIET_SUBS` at `:77,322`), so the direct and wrapped forms agree.
  2. Normalize aliases before classification, rather than only extending the name sets: `tf` → terraform, `tg` → terragrunt, `k`/`kubecolor`/`oc` → kubectl. `k8sFindings` branches on `tool === 'kubectl'` (`:565,567,571`), so an unnormalized alias would get weaker treatment. Extend the early filters `TOOL_RE`/`K8S_RE` (`:25,28`) for the alias names.
     - `helmfile` gets its own handling: destroy/delete/sync/apply ask, and production is denied like helm.
     - `pulumi` gets its own handling: destroy/up/refresh ask, and a `--stack` matching the prod pattern counts as production.
     - `python[3] -m awscli` is treated as aws.
  3. Add `busybox` and `toybox` to `SHELLS` (`:56`). `nix run <installable>#<tool> -- …` maps the executable from the installable's attribute name, since wrapper stripping alone cannot recover it. `nix shell … -c <cmd>` becomes a wrapper in `stripWrappers` (`:158`).
  3a. `processProd` (`:519-523`) treats an unreadable kubeconfig as non-production, and `prodTarget` calls it even when `files` is false (`:514`). Make both cases return `'unknown'`, which asks. Test `kubectl config use-context production; kubectl delete pvc data` with no kubeconfig present.
  4. Read a userConfig `prodPattern` (regex source, default `prod(uction)?\d*|prd|live`), bounded to 200 chars and compiled once. An invalid pattern gives ask.
  5. Reword `SUBAGENT_REASON` (`:97`) to say a subagent cannot run this, and the main session should run it or ask the user to approve adding the token. Drop the instruction to add the token itself.
- **Must-flag tests (check.sh):** every V4/V5 command, `aws kms schedule-key-deletion …` (ask in main), and `terraform plan` (expected null with the default config, allow with `autoAllowReadOnly=true`). A `mise run tofu dev plan` case is expected null by default.
- **Must-pass tests:** the existing 588 cases, updated where the allow-to-null default changes them. Each changed expectation is listed in the commit.
- **Acceptance:** `bash plugins/cloud-ops-guard/scripts/tests/check.sh`, `bun test plugins/cloud-ops-guard/scripts/cloud-ops-guard.spec.ts`, and the bun probe over V3 to V5.
- **Bump:** 0.2.0 → 0.3.0. The description states the default no longer auto-approves plan/init.

### A3. bash-rules: danger gaps, credentials glob, model-stage privacy (coder-critical)

- **Files:** `plugins/bash-rules/hooks/danger/{danger.ts,rules.ts}`, `hooks/rules/judge.ts`, `hooks/register.tsx`, `tests/{danger.test.tsx,judge.test.ts,register.test.tsx}`, `.claude-plugin/plugin.json`, `README.md`. Not `hooks/shell`, `hooks/log` or `hooks/vendor` (S0 owns those).
- **Danger gaps (`danger.ts`):**
  - Add `private` (macOS `/private/etc` and `/private/var`), `Applications`, `mnt`, `media`, `opt`, `proc` and `sys` to `SYSTEM_DIRS`/`CRITICAL_ROOTS` (`:230,309`). Treat `/private/<dir>` as `/<dir>`.
  - Add `busybox`, `toybox`, `ionice`, `chrt`, `taskset`, `flock`, `unshare`, `systemd-run`, `watch` and `parallel` to `WRAPPERS` (`:43`).
  - In `rmRoot`/`rmCritical`, an `rm` fed by `xargs` from a `find` whose start path is protected is a hit (reuse `viaXargs` at `:488`). `npx|pnpm dlx|bunx rimraf <protected>` is a hit.
  - `dbDrop` (`:466`) gains `prisma migrate reset`, `prisma db push --force-reset`, `rails|rake db:drop|db:reset|db:schema:load`, `manage.py flush` and `dropuser`, plus mongosh `--eval` text with `.drop()`/`dropDatabase()`.
  - The `git-rewrite` ask (`askHit` at `:882`) gains `push --delete <protected-ish>`, `push <remote> :<branch>` and `checkout -- .`.
  - `credentialsRead` (`:641`) matches a glob component that could expand to `.claude`, such as `.cla*` or `.c?aude`.
- **File tools:** extend the existing `tool.call` registration (do not register a second one) to deny Read, Grep, Edit, MultiEdit, Write and NotebookEdit on the credentials file.
  - Resolve relative paths against cwd, and honour a `CLAUDE_CONFIG_DIR` override the way `danger.ts:636` does.
  - For Grep, deny when `path` is the file or a directory containing it with a glob that could match it.
  - Bound the path length before matching.
- **Model stage (decision D1, recommended option):**
  - New userConfig `ollamaCloud` (boolean, default false). When it is false and `ollamaModel` ends in `:cloud`, or `ollamaUrl` is not a loopback host, the Ollama stage is skipped.
  - The Haiku fallback (`register.tsx:95`, `$.model.complete`) goes to the session's own model provider, not a third party. It stays governed by `fallbackModel`, and the option name says "Ollama" so it does not over-promise.
  - `redact()` (import from `../log/usagelog`, already vendored) runs on the command and on the parser notes before truncation. This covers all three request builders: `ollamaRequest`, `systemoneRequest` and the fallback `userPrompt`.
  - The `plugin.json` description and README state both rules.
- **Must-flag tests:** every V7 command, plus `rm -rf /private/var/db`, `flock /tmp/l rm -rf ~`, `docker volume rm $(docker volume ls -q)` and `mongosh --eval 'db.users.drop()'`.
- **Model-stage tests:**
  - A judge test asserts that the body from each of the three request builders contains no `AKIA` when the command or the notes contain an AWS key.
  - A `parseOptions` test asserts that with `ollamaCloud: false` a `clef:cloud` model is skipped.
  - Grep with `path: ~/.claude` and `glob: '*.json'` is denied.
- **Must-pass tests:** `rm -rf ./private/etc-copy`, `find . -name '*.o' | xargs rm -f`, `prisma migrate dev`, `git push origin feature`.
- **Acceptance:** `claude plugin test plugins/bash-rules` (the known timing failures are allowed), `claude plugin validate --strict plugins/bash-rules` with no new "gating hook without .catch", and the bun probe over V7.
- **Bump:** 0.4.0 → 0.5.0.

### A4. readonly-agent-gate: links, sqlite3, install and copy commands (coder-critical)

- **Files:** `plugins/readonly-agent-gate/scripts/{scratch.ts,readonly-bash.ts}`, `scripts/tests/{readonly-bash.cases.sh,readonly-gate.spec.ts}`, `.claude-plugin/plugin.json`.
- **Changes:**
  1. New `scratchDest(path)` in `scratch.ts`: the string check, then a filesystem check.
     - Canonicalize the scratch roots once with `realpath` (macOS `/tmp` → `/private/tmp`).
     - Resolve the longest existing prefix of the path with `realpath`, and refuse if it lands outside the canonical roots. This handles symlinks with `..` and missing descendants.
     - If the final component exists, `lstat` it. Refuse a symlink whose target resolves outside the roots, and refuse a regular file with `nlink > 1`. Directories are exempt from the link-count rule.
     - All write destinations use `scratchDest`: `checkFileWrite` (`scratch.ts:59`), Bash redirect targets (`readonly-bash.ts:1226`), and FS-command destinations (`:133`). That closes `printf x > /tmp/link` and `cp src /tmp/link` as well as Write.
     - The header states the limit: this is an accident guard, and races or arbitrary programs are not covered.
  2. `readonly-bash`: block `ln` (hard or `-s`) whose source resolves outside scratch. A symlink target resolves relative to the link's directory, and a hard-link source relative to cwd.
     - `cases.sh:255` (`ln -s src/a /tmp/link`) keeps `allow`, because its target is `/tmp/src/a`.
     - New `block` cases: `ln -s "$PWD/src/a.ts" /tmp/link`, `ln -s ../../repo/src/a /tmp/x/link` where that path resolves into the repo, and `ln src/a.ts /tmp/h`.
  3. SQLite-family clients get client-specific handling, not just an entry in `SQL_CLIENTS` (`readonly-bash.ts:765`). That parser assumes the psql/mysql `-c`/`-e` options and `SQL_OUT_LONG` (`:795,814`).
     - `sqlite3`/`litecli`/`duckdb`: positional SQL and `-cmd` text go through the shared statement checker.
     - Dot-commands are blocked except `.tables`, `.schema`, `.indexes`, `.mode`, `.headers`. This blocks `.shell`, `.system`, `.output`, `.once`, `.backup`, `.save`, `.import` and `.load`.
     - `-init` files are blocked. stdin/heredoc input goes through the same checker.
     - Any mode the parser does not know is blocked.
  4. Block `make install|uninstall`, `scp` with a local destination, `wget` without `-O -`/`-O /tmp…`/`--spider`, `curl -o|-O|--output` outside scratch, and `ssh host <command>`. Update the header's known-gaps list (`:4-6`) for what remains.
- **Must-flag tests:**
  - Through a pre-created `/tmp` symlink to a repo file: Write (spec), `printf x > /tmp/link`, and `cp a /tmp/link`.
  - A pre-created hard link in `/tmp`.
  - `ln -s "$PWD/src/a.ts" /tmp/link`, `ln src/a.ts /tmp/h`.
  - `sqlite3 db "insert into t values(1)"`, `sqlite3 db '.shell id'`, `make install`, `scp host:f .`, `wget https://x`, `ssh host 'rm -rf x'`.
- **Must-pass tests:**
  - `ln -s src/a /tmp/link`, as in today's case.
  - `sqlite3 db "select 1"`, `sqlite3 db .schema`, `curl -s https://x`, `wget -O - https://x`.
  - Write to `/tmp/new.txt` and to `/tmp/newdir/x` (a missing parent).
- **Acceptance:** `bun test plugins/readonly-agent-gate/scripts/tests` and `bash plugins/readonly-agent-gate/scripts/tests/readonly-bash.cases.sh`.
- **Bump:** 0.2.0 → 0.3.0.

### A5. security-scan: pip-audit cannot run branch code (coder-high)

- **Files:** `plugins/security-scan/skills/security-scan/scripts/scanners.py`, `tests/test_scan.py` (plus fixtures), `SKILL.md`, `.claude-plugin/plugin.json`.
- **Changes:**
  - `pip_audit_jobs` (`:255-277`) always appends `--no-deps --disable-pip`.
  - The `uv export` output and every `requirements*.txt` are pre-validated. A file containing option lines (`-e`, `--index-url`, `--extra-index-url`, `-f`, `-r`/`-c` includes) or URL, VCS or local-path requirements is not audited, and a gap says why.
  - With `--no-deps`, only the listed packages are audited. A requirements file counts as a full inventory only when every line is `==`-pinned and the file is hash-pinned or has a pip-compile/uv header. Otherwise the findings stand, plus a gap: "transitive dependencies not audited (no lock)".
  - A pip-audit failure on unpinned requirements becomes the gap "requirements are not fully pinned; pip-audit skipped so branch code is not built".
  - `pyproject.toml`/`setup.py` without a lock are no longer passed as a project path. The gap is "no lock file; pip-audit would install the project".
  - `SKILL.md:63` is rewritten to match.
- **Tests:**
  - Every argv `pip_audit_jobs` returns contains both flags.
  - An option-line requirements file and a pyproject-only project each produce a gap and no job.
  - Stub `run` so no real pip-audit runs.
- **Acceptance:** `uv run --with pytest pytest plugins/security-scan/skills/security-scan/tests`.
- **Bump:** 0.1.0 → 0.2.0.

### A6. Agent tool allowlists for coder tiers and scribe (coder)

- **Files:** `plugins/{coder,coder-high,coder-critical,coder-max}/agents/*.md`, `plugins/scribe/agents/scribe.md`, and their `plugin.json` files.
- **Changes:**
  - Replace line 6 with `tools: Read, Edit, Write, Bash, Grep, Glob, LSP, Skill, WebFetch, WebSearch, TodoWrite, mcp__codebase-memory-mcp__*`. scribe also gets `mcp__plugin_outline-mcp_outline__*`.
  - Keep `disallowedTools: Agent, Workflow` (still satisfies `agent_spawn_errors`).
  - Single-quote the 4 coder descriptions (V20). This is the only YAML-quoting edit to agent files.
- **Acceptance:**
  - `check` (the spawn rule passes), and a PyYAML parse of the 5 files.
  - A live check: in a session with the GitHub and codebase-memory MCP servers connected, launch `coder:coder` with "list your tools, call one codebase-memory tool, then hand back".
    - Do this both in the foreground and in the background, since the agent-authoring frontmatter reference (:89) says the available tools differ between them.
    - It must hand back. The codebase-memory call must work, and no `mcp__github*` tool may be listed.
  - If handback or background tooling fails, add the missing lifecycle tools (`SubagentHandback`, `Monitor`, `TaskStop`) and record that in the plan.
  - Prefer the exact five codebase-memory tool names over the `__*` wildcard, matching the dba agent's list.
- **Bumps:** coder 0.1.1 → 0.1.2, coder-high 0.1.1 → 0.1.2, coder-critical 0.1.1 → 0.1.2, coder-max 0.2.0 → 0.2.1, scribe 0.2.1 → 0.2.2.

### A7. Narrow test-run and playwright-cli grants (coder-high)

- **Files:** `plugins/test-run/skills/test-run/{SKILL.md,scripts/run_tests.py,scripts/detect.py}`, new `scripts/run_custom.py`, `scripts/plan.py`, `tests/test_run_tests.py`, `plugins/playwright-cli/skills/playwright-cli/{SKILL.md,scripts/pw.sh,tests/pw-spec.sh}`, both `plugin.json` files.
- **test-run changes:**
  - `run_tests.py` rejects `--cmd` with exit 2 and the message "use run_custom.py".
  - New `run_custom.py --cmd "…"` shares the parse/plan code and is not in `allowed-tools`, so it always prompts.
  - SKILL.md documents both entry points (`argument-hint` and :22, :37, :51).
  - The description and README say plainly what this fixes. It closes the arbitrary-command escape hatch. Running a repo's test runner (for example `npm test`) still runs project code, which is inherent, and the skill remains for trusted projects.
  - Update every mention of `--cmd`: SKILL.md (`argument-hint` and :22, :37, :51), the error at `detect.py:410,414` and `plan.py:281`, and the rerun instructions.
- **playwright-cli changes:**
  - Session options come before the verb (`playwright-cli -s=checkout snapshot`, SKILL.md:21). A prefix rule cannot express "any `-s` value, then a safe verb" without also admitting unsafe verbs.
  - So add `skills/playwright-cli/scripts/pw.sh [-s=<name>] <verb> [args…]`. It checks `<name>` against `^[A-Za-z0-9_-]{1,64}$` and `<verb>` against an allowlist, then `exec`s `playwright-cli` with argv unchanged.
  - The allowlisted verbs: open, goto, close, snapshot, find, click, dblclick, fill, type, hover, select, check, uncheck, press, keydown, keyup, go-back, go-forward, reload, screenshot, resize, tab-list, tab-new, tab-select, tab-close, console, requests, list, and the `set-*`/`clear-*` emulation verbs.
  - `allowed-tools` becomes `Bash(${CLAUDE_SKILL_DIR}/scripts/pw.sh *)` only. Direct `playwright-cli …` calls prompt, which covers `eval`, `run-code`, `state-*`, `cookie-*`, `*storage-*`, `route`, `webmcp-call`, `upload`, `pdf`, `request*`/`response-*`, `install*`, `kill-all` and `delete-data`.
  - SKILL.md keeps its existing rule that a final submit or purchase click needs the user's go-ahead. Verb enumeration does not replace that.
- **Tests:**
  - test-run: a pytest case for `run_tests.py --cmd x` (exit 2, nothing runs), and a `run_custom.py` happy path with a stub runner.
  - playwright-cli: a new `tests/pw-spec.sh` with a stub `playwright-cli` on PATH. Each allowed verb passes argv through unchanged. `eval`, `run-code`, `state-save` and `-s='x;y' snapshot` exit non-zero without running the stub.
- **Acceptance:** `uv run --with pytest pytest plugins/test-run/skills/test-run/tests`, `bash plugins/playwright-cli/skills/playwright-cli/tests/pw-spec.sh`, and `claude plugin validate --strict` on both plugins.
- **Bumps:** test-run 0.1.0 → 0.2.0, playwright-cli 0.1.0 → 0.2.0.

### A8. godot-mcp-setup: install the approved commit (coder-high)

- **Files:** `plugins/godot-mcp-setup/skills/godot-mcp-setup/{scripts/install-addon.sh,SKILL.md}`, `tests/install-addon-spec.sh`, `.claude-plugin/plugin.json`.
- **Changes:**
  - The dry run resolves HEAD to a commit (from `git get-tar-commit-id`) and prints `commit=<sha>`, as now.
  - The real install requires `--commit <40-hex>`, downloads `archive/<sha>.tar.gz`, and refuses unless `git get-tar-commit-id` equals `<sha>`. If `git` is missing, the install refuses, since it can no longer report the commit as `unknown`.
  - SKILL.md step 3 passes the dry run's commit.
  - The `--dry-run` grant is unchanged, so the real install still prompts.
- **Tests:** in the spec, an install without `--commit` fails, a mismatched commit fails, and a matching commit installs. Use local tarball fixtures through the existing `cp "$src"` path at `:61`.
- **Acceptance:** `bash plugins/godot-mcp-setup/tests/install-addon-spec.sh`.
- **Bump:** 0.1.0 → 0.2.0.

### A9. forgejo-release: tag the verified commit (coder)

- **Files:** `plugins/forgejo-release/skills/forgejo-release/SKILL.md`, `.claude-plugin/plugin.json`.
- **Changes:** §5 becomes:
  1. Record `SHA=$(git rev-parse HEAD)` after preflight. HEAD must equal `<remote>/<default>`.
  2. `git tag -a vX -m vX "$SHA"`, then `git push <remote> vX`.
  3. Check that `git ls-remote <remote> "refs/tags/vX^{}"` equals `$SHA`, and stop if not.
  4. `fj release -R <remote> create vX -t vX …`.

  `-T --branch` moves to a "don't" note that explains the wrong-commit risk, mirroring gh-release's `--verify-tag`.
- **Acceptance:** `claude plugin validate --strict plugins/forgejo-release`, and a read-through checking that every command still exists in `fj release create --help` (fj 0.7.0 is on PATH).
- **Bump:** 0.1.0 → 0.1.1.

### A10. AWS: Cost Explorer region and secret-read deny list (coder)

- **Files:** `plugins/aws-well-architected/skills/aws-well-architected/{SKILL.md,references/cost.md}`, `plugins/aws-cloudwatch/skills/aws-cloudwatch/SKILL.md` (decision D7), and their `plugin.json` files.
- **Changes:**
  - `cost.md:3` adds "except `aws ce` and `aws budgets`, which take `--region us-east-1`". `:10` uses `--region us-east-1`. Both cite the AWS General Reference, the same source as `aws/references/cost.md:28`.
  - `SKILL.md:25` and `aws-cloudwatch/SKILL.md:19` add the missing calls: `secretsmanager batch-get-secret-value`, `ecr get-login-password`/`get-authorization-token`, `eks get-token`, `rds generate-db-auth-token`, `ec2 get-password-data`, and credential-minting `sts`. Each says "the full list is in `aws-resource-query`, if installed".
- **Acceptance:** `claude plugin validate --strict` on both, and a grep that no `ce ` command line in the plugin lacks `us-east-1`.
- **Bumps:** aws-well-architected 0.1.1 → 0.1.2, aws-cloudwatch 0.1.1 → 0.1.2.

### A11. CLAUDE.md drift (coder)

- **Files:** `CLAUDE.md` only.
- **Changes:**
  - :14: scopes become `bash-rules`, `orchestration`, `scripts`.
  - :18 and :20: the mod example is `plugins/usage-log/hooks/register.tsx` / `plugins/bash-rules/hooks/`.
  - :23 and :26: the `plugin-root`, mixed `"modules"`+`"hooks"` and DuckDB examples are marked "as in `archive/plugins/coremods`". The `*.spec.ts` examples become `plugins/check-bypass-guard/scripts/tests/` and `plugins/usage-log/scripts/usage-report.spec.ts`.
  - Add a Tests line: `uv run --with pytest pytest scripts/test_plugins.py`, `node --test scripts/install.spec.mjs`, `bun test <plugin spec paths>` (not a bare `bun test` in plugins that have mod tests).
- **Acceptance:** every path named in CLAUDE.md exists (`grep -o` the backticked paths and `ls` them).
- **Bump:** none.

### RA. Integrator after Group A (lead, serial)

- Mirror each Group A `plugin.json` version and description into `.claude-plugin/marketplace.json`.
- Run `python3 scripts/plugins.py catalog`, then `check` (must print `ok`).
- Run `claude plugin validate --strict` over the Group A plugins.
- One commit per slice, Conventional Commits, explicit paths.

### B1. plugins.py: real lint, eval rules, category, closure, version guard (coder-high, serial)

- **Files:** `scripts/plugins.py`, `scripts/test_plugins.py`, new `scripts/regex_check.mjs` (a node batch compiler that reads JSON on stdin).
- **Rules added to `check`:**
  0. **Effective case:** build each case the way the loader does, as documented in `.claude/skills/skill-evals/references/cli.md:46,58,64`. Prompt frontmatter overrides `case.yaml`, and graders from both sources are combined. Then validate a typed schema per document: unknown keys are rejected, and required fields and per-type grader keys are checked. Duplicate YAML keys are an error, using a PyYAML loader subclass.
  1. **Frontmatter:** `yaml.safe_load` the frontmatter of `plugins/*/skills/*/SKILL.md`, `plugins/*/agents/*.md`, `plugins/*/commands/*.md`, and every `prompt.md`, `graders/*.md` and `case.yaml` under `plugins/*/evals/` and `evals/*/evals/` (skip `results/`). It must be a mapping. This replaces `eval_frontmatter_errors` (`:286-302`) and moves `godot_version_errors`/`agent_spawn_errors` onto the parsed data.
  2. **Skills and agents:** `name` equals the dir or stem, matches `[a-z0-9-]{1,64}`, and the description is 1 to 1024 chars. No `autoCompactWindow` in `agents/*.md`.
  3. **Eval cases and graders:**
     - Every case has at least one grader, and `type` is one of regex, tool_used, tool_order, file_exists, llm, baseline.
     - Every `plugins:` entry resolves to an existing directory.
     - `pattern`/`input_match` compile as JS through `node scripts/regex_check.mjs`, and an inline `(?…)` flag group is rejected.
     - A `tool_used: Skill` regex must match `"skill": "<name>"` for at least one known skill, bare or `plugin:skill`. Allowed externals: an `EXTERNAL_SKILLS` set seeded with `gradle-skills:*`, `create-skill` and `skill-creator`.
  4. **Inert negatives (Skill graders only):** a `tool_used: Skill` grader with `max: 0` needs `arm: both`. Bash `max: 0` graders such as dependabot's `no-admin.md` are exempt.
     - Resolve the regex against the effective loaded skill set: the case's own plugin plus its `plugins:` entries, canonicalized. Test it against `"skill": "<name>"` and `"skill": "<plugin>:<name>"` for every marketplace skill.
     - If every skill it matches lives in an unloaded plugin, the error is "inert sibling grader".
     - If it matches no skill, or uses a construct the matcher cannot evaluate, report "unknown target" as a warning. It is not reported as inert.
  5. **Manual-only skills:** a Skill grader with `min ≥ 1` (or no `max: 0`) aimed at a skill with `disable-model-invocation: true` is an error: "manual-only skill; use a slash-invoked outcome case".
  6. **Category:** in `marketplace.json`, `category` is one of development, meta, bundle, and is `meta` exactly when `is_meta(name)`.
  7. **Root-suite closure:** a `ROOT_SUITES` table:

     | Suite | Metas | Extra | Exclude |
     |---|---|---|---|
     | `forges` | github-meta, forgejo-meta | forgejo-release, gh-release, git-commit | |
     | `godot-meta` | godot-meta | | grep-app (D8) |
     | `jvm` | java-meta, scala-meta, play/spring leaves as its README lists | gradle-skills path | grep-app, context7 |

     Expected = the local `closure()` of the seeds, minus group plugins (`is_group`), minus exclude, plus extra.
     - External providers such as `gradle-skills` are matched by their resolved path under `3rd-party/`. When that checkout is absent, the result is "optional checkout missing", a warning, not an error.
     - Case paths are canonicalized before the plugin basenames are compared. A path that resolves to no directory is an error.
     - `evals/orchestration` is skipped (combinations by design).
- **New `check --since <ref>`:**
  - The comparison is `<ref>` against the working tree: `git diff -z --name-status --find-renames <ref> --`, plus untracked files from `git ls-files -z --others --exclude-standard`.
  - For each `plugins/<p>` with a change outside `evals/` and `README.md`, `plugin.json` `version` must be greater than at `<ref>`. Versions are parsed as `MAJOR.MINOR.PATCH`; anything else is an error naming the version.
  - A plugin absent at `<ref>` (new) passes. A deleted plugin passes. A rename is checked under its new name.
  - For metas and bundles, a `dependencies` change needs a bump.
  - If `git rev-parse --verify <ref>^{commit}` fails (for example in a shallow clone), it exits 2 with a clear message.
  - It runs only when the flag is given (no default ref, because `origin/main` may not exist).
- **Other:**
  - If PyYAML is missing, `check` exits 2 with "pip install pyyaml or run: uv run --with pyyaml python3 scripts/plugins.py check" (D5).
  - If node is missing, rule 3's regex compile is skipped with a warning.
  - `test_plugins.py` gets `if __name__ == "__main__"`.
- **Tests (test_plugins.py, tmp-repo fixtures like the existing ones):**
  - One failing fixture per rule: nested quotes, unquoted colon in a root suite, invalid grader YAML, no graders, missing `plugins:` path, `(unclosed`, `(?i)`, nonexistent skill, `max: 0` without `arm`, inert sibling, manual-only fires grader, name/dir mismatch, 1100-char description, `autoCompactWindow`, `meta` on a leaf, an unknown category, root-suite drift.
  - `--since` cases: unbumped change fails; bump passes; eval-only change passes; new plugin passes.
- **Acceptance:**
  - `uv run --with pytest pytest scripts/test_plugins.py`.
  - On the real repo, `check` reports the known set, compared against a list the worker writes to the scratchpad: 24 SKILL.md YAML errors (the 4 agents are already fixed by A6), 2 category errors, the inert graders, 2 manual-only graders, and closure drift for godot-meta (13 cases) and jvm (19 cases).
  - The worker diffs `check`'s inert list against the appendix. The planning probe found 92: the appendix plus `ship`/`pr-comments` `not-gh-pr`. Any difference is reviewed and recorded before C1 starts. C1 deletes the reviewed list, not a fixed count.
  - `check --since 6fb8a05` reports necromancy, vet, v0-rewrite, reorder and leakage-audit only if they changed since that ref. They did not, so the stale bumps are found with an older ref such as `837b396`. Record what it prints.
- **Bump:** none (scripts only).

### B2. Apply: quote descriptions, fix categories, catch-up bumps (coder, Group C)

- **Files:**
  - `plugins/<p>/skills/<p>/SKILL.md` for the 24 V20 skills.
  - `plugins/<p>/.claude-plugin/plugin.json` for those 24, plus vet, v0-rewrite, reorder and leakage-audit (necromancy is in both sets).
  - `.claude-plugin/marketplace.json`. B2 is the only Group C slice that touches it, since C1 to C3 change only evals.
  - `README.md` (catalog).
- **Changes:**
  - Single-quote each description, doubling any `'`. No wording changes.
  - Set aspnet-core and ef-core to `"category": "development"`.
  - Patch-bump the 24 (decision D6) and the 4 stale ones.
- **Acceptance:**
  - `check`'s YAML and category errors are gone.
  - `claude plugin validate --strict` on the 28.
  - `git diff --word-diff` shows only quote characters in the SKILL.md files.
  - `check --since 837b396` is clean for the five stale plugins.

### C1. Delete inert sibling graders (coder, Group C)

- **Files:** the reviewed inert list from B1. Its baseline is the 90 grader files in the appendix. Delete only. Excludes `ship` and `pr-comments`, which C2 owns.
- **Acceptance:**
  - `check` reports no inert-grader errors outside `ship` and `pr-comments`.
  - Every touched case still has a `fires-*` grader (the B1 rule "at least one grader").
- **Bump:** none (evals only).
- **Note:** hard negatives aimed at the plugin's own skill are not added here (F2).

### C2. Manual-only routing cases (coder-high, Group C)

- **Files:** `plugins/ship/evals/**`, `plugins/pr-comments/evals/**`.
- **Changes:**
  - Delete `plugins/ship/evals/ship-routing` (decision D4). A slash-invoked ship case needs the `shipper` dependency, which has the same containment problem as forgejo-ship (F5).
  - Replace `pr-comments-routing` with an outcome case `pr-comments-slash`. The prompt is `/pr-comments 214`, and a `scaffold_script` puts a stub `gh` on PATH that serves the fixtures in `skills/pr-comments/tests/fixtures/`.
  - Graders:
    - `tool_used` Bash with `input_match 'gh (pr (comment|review|merge)|api .*-X ?(POST|PATCH|PUT))'`, `max: 0`. This is the read-only promise.
    - An `llm` grader requiring a T1..Tn table and a "which to fix" question.
  - Pin `model: claude-sonnet-5-5` and `runs: 3`.
- **Acceptance:**
  - `check` is clean for both plugins.
  - `claude plugin eval plugins/pr-comments --trust-plugin --ablation none --runs 1 --max-cost-usd 1 --no-publish` loads and scores the case. This costs money, so the lead runs it.
- **Bump:** none.

### C3. Root-suite plugin lists (coder, Group C)

- **Files:** `evals/godot-meta/evals/*/prompt.md` (13), `evals/jvm/evals/*/prompt.md` (19), and both READMEs.
- **Changes:** add `../../../../plugins/feature-flags` and `../../../../plugins/leakage-audit` to godot-meta (matching the existing path style), and `leakage-audit` to jvm. The README states the closure rule and points to `check`.
- **Acceptance:** `check` reports no closure drift.
- **Bump:** none.

### RC. Integrator after Group C (lead, serial)

`check` prints `ok`, and so do `check --since 6fb8a05` and `catalog --check`. Then the commits go in.

### E1. Minimal CI (coder, infra; OPTIONAL, needs user confirmation D9)

- **Files:** `.github/workflows/check.yml` and `.forgejo/workflows/check.yml`, with the same steps.
- **Steps, on push and PR:**
  - Python 3.12 with `pip install pyyaml pytest`.
  - `python3 scripts/plugins.py check`, then `check --since ${{ github.event.before || 'HEAD~1' }}` (skipped when that ref is all zeros), `catalog --check`, and `pytest scripts/test_plugins.py`.
  - `node --test scripts/install.spec.mjs`.
  - With bun set up: `bun test scripts/shared plugins/check-bypass-guard/scripts/tests plugins/readonly-agent-gate/scripts/tests plugins/cloud-ops-guard/scripts/cloud-ops-guard.spec.ts plugins/usage-log/scripts`.
  - `bash plugins/cloud-ops-guard/scripts/tests/check.sh` and `bash plugins/readonly-agent-gate/scripts/tests/readonly-bash.cases.sh`.
  - No `claude` CLI steps (no auth in CI). Mod tests stay local.
- **Acceptance:** a green run on a pushed branch for each forge.

## Version bumps (summary)

| Plugin | From | To | Slice |
|---|---|---|---|
| usage-log | 0.1.0 | 0.1.1 | S0 |
| check-bypass-guard | 0.1.0 | 0.2.0 | A1 |
| cloud-ops-guard | 0.2.0 | 0.3.0 | A2 |
| bash-rules | 0.4.0 | 0.5.0 | A3 |
| readonly-agent-gate | 0.2.0 | 0.3.0 | A4 |
| security-scan | 0.1.0 | 0.2.0 | A5 |
| coder, coder-high, coder-critical | 0.1.1 | 0.1.2 | A6 |
| coder-max | 0.2.0 | 0.2.1 | A6 |
| scribe | 0.2.1 | 0.2.2 | A6 |
| test-run | 0.1.0 | 0.2.0 | A7 |
| playwright-cli | 0.1.0 | 0.2.0 | A7 |
| godot-mcp-setup | 0.1.0 | 0.2.0 | A8 |
| forgejo-release | 0.1.0 | 0.1.1 | A9 |
| aws-well-architected, aws-cloudwatch | 0.1.1 | 0.1.2 | A10 |
| 24 quoted skills plus vet, v0-rewrite, reorder, leakage-audit | current | +0.0.1 | B2 |

No meta or bundle is bumped, because no `dependencies` list changes.

## Risks and rollback

- **The cloud-ops default change adds prompts** for `terraform plan` and `init` users. This is intended. The README names the opt-in. Rollback: revert A2 or set the option.
- **Stricter guards may block legitimate commands.**
  - Mitigation: a must-pass list per slice. Existing suites must stay green, and every changed expectation is listed in the commit.
  - Rollback: revert the slice commit. Each guard is its own commit and its own plugin.
- **S0 changes four guards at once.** It runs first and alone, and all four suites gate it.
- **A `tools:` allowlist could stop a coder tier from launching or handing back.** A6's live check catches this before RA. Rollback: restore `disallowedTools`.
- **The B1 rules could be noisy or wrong.** B1's acceptance pins the exact expected error set. External skills go through the `EXTERNAL_SKILLS` set, not code changes.
- **Deleting graders lowers apparent coverage.** The coverage they gave was fake. F1 and F2 track the replacement.
- **The pip-audit change reports more gaps on unpinned projects.** That is the honest outcome. The SKILL.md text explains it.

## Follow-ups (out of scope)

- **F1. New paired root suites** (testing, web, data, aws, dotnet, thinking, docs, auth-api, security, branching). They would cover V30/V31 and the boundaries the deleted graders pretended to test.
- **F2. Per-plugin gap filling:** own-skill hard negatives for the 57 suites without one, and the cases each G report proposes.
- **F3.** `runs: 3` and model pins for the 44 unpinned cases, and settling the `runs: 1` contradiction in `.claude/skills/skill-evals/SKILL.md:49` vs `:122,131`.
- **F4.** An optional `check --evals-load` using `claude plugin eval … --max-cost-usd 0`, once the stop-before-spend behaviour is confirmed.
- **F5.** Move forgejo-ship's cross-plugin cases to `evals/forgejo-ship/`, and design a slash-invoked `ship` outcome case.
- **F6. Meta restructuring:** hand-off targets, the new metas, and dotnet-meta coverage.
- **F7. Remaining G1 medium and low items:**
  - consult agy read-path restriction and the SECRET list
  - mcp-health treating a hook deny as a server failure
  - git-statusline cwd
  - usage-log `promptText` default
  - cloud-ops `AWS_DESTRUCTIVE` additions
  - inline-suppression asks in check-bypass-guard
  - bash-rules scan caching and timing tests
  - a shared `wrappers.ts`
- **F8. Stale facts that need a source check (no edits planned):**
  - the .NET 8/9 end-of-support date and dotnet-upgrade-guide's chain
  - xunit.v3 4.x and MTP v2
  - the MySQL 9.7 LTS line
  - the Statsig acquisition close
  - Prometheus 3 native histograms
  - Godot `add_dock(EditorDock)` version, and 2D interpolation in godot-physics
  - OWASP 2025 IDs in security-scan
  - passkeys and NIST 800-63B-4 in app-auth
  - Prisma 8 / `npx`, Go 1.27, Vite 8 `codeSplitting`, Pinia 4, Gradle 9 on JDK 27, gh 2.94 issue flags

  The one stale fact that a primary source in the repo confirms, Cost Explorer's region, is fixed in A10.

## Decisions for the user

- **D1. bash-rules cloud model.** Option (a): a boolean `ollamaCloud` (default false) that skips `:cloud` and non-loopback Ollama. Option (b): default `ollamaModel: ''`. Recommend (a). It keeps local Ollama working and makes the third-party hop opt-in.
- **D2. cloud-ops allowlist.** Option (a): userConfig `autoAllowReadOnly`, default false (no opinion). Option (b): drop the allow path entirely. Recommend (a).
- **D3. Inert graders.** Delete only (C1), or delete and also add own-skill hard negatives now. Recommend delete only, with negatives in F2.
- **D4. `ship-routing`.** Delete now, or keep until F5. Recommend delete: it cannot pass.
- **D5. PyYAML for `check`.** A hard requirement with an install hint, or a soft skip. Recommend hard. A silent skip is how the current lint missed the bug.
- **D6. The 24 quoting-only plugins.** Patch-bump them, or exempt frontmatter-quoting changes from the bump rule. Recommend the bump. It is cheap, and it keeps `--since` simple.
- **D7. aws-cloudwatch in A10.** It has the same deny-list drift but was outside the named scope. Recommend including it.
- **D8. godot-meta and grep-app.** Exclude grep-app like jvm does, or add it to every case. Recommend exclude (it ships no skill).
- **D9. CI (E1).** Add GitHub and Forgejo workflows, or neither. Recommend yes, with both, since the repo targets both forges.

## Critique log

One adversarial pass: codex, plan mode, high effort. Each point was checked against the code before deciding.

1. **Bash redirects and `cp` through a pre-existing link bypass a Write-only fix** (`readonly-bash.ts:133,1226`). Adopted: A4 adds a shared `scratchDest` for all write destinations.
2. **An unreadable kubeconfig counts as non-production; `processProd` ignores `files`** (`cloud-ops-guard.ts:514,519-523`, verified). Adopted as A2 item 3a.
3. **The no-opinion default must keep gates independent; `init` is inconsistent between direct and wrapped forms** (`:77,322,961`). Adopted in A2 item 1.
4. **Aliases need normalizing, because `k8sFindings` branches on `tool === 'kubectl'`** (`:565,571`, verified). Also, `nix run` hides the executable in the installable. Adopted in A2 items 2 and 3.
5. **File tools are not protected for `.husky/`, `.git/hooks/` or `.git/config`, since the matcher is basename-only** (`check-bypass-guard.ts:46`). Adopted: a shared `protect-path.ts` serves both branches.
6. **Section removal/rename and `--unset-all` are missed.** Adopted in A1.
7. **The credentials guard skips Grep.** Adopted: Grep, MultiEdit and NotebookEdit are covered, and the `CLAUDE_CONFIG_DIR` override is honoured.
8. **`--no-deps` on direct requirements silently drops transitive coverage.** Adopted: a full-inventory test plus a gap for "transitive dependencies not audited", and validation of the `uv export` output as well.
9. **A relative symlink target resolves against the link's directory, so `cases.sh:255` is correct as written; directories have `nlink > 1`; `/tmp` is `/private/tmp` on macOS.** Adopted: the case stays `allow`, the link-count rule applies to regular files only, and the scratch roots are canonicalized.
10. **Adding sqlite3 to `SQL_CLIENTS` alone does not work** (`:795,814` assume psql/mysql flags). Adopted: client-specific handling, a dot-command allowlist (`.shell`/`.system` blocked) and default-block for unknown modes.
11. **The prune filename filter is not an ownership guarantee.** Adopted as a stated trust model in S0. Ownership and link checks were rejected as out of scope for an accident guard.
12. **`cloudModels: false` still allows the Haiku fallback.** Adopted in part: the option is renamed `ollamaCloud`, and redaction covers all three request builders. Rejected in part: Haiku goes to the session's own provider, so it is not a third-party hop and stays under `fallbackModel`.
13. **Playwright `-s=<session>` before the verb defeats per-verb prefix rules, and a wildcard before the verb admits unsafe verbs.** Adopted: a validating `pw.sh` wrapper is the only grant. Click/submit authorization stays a skill rule.
14. **Splitting out `--cmd` does not stop project code from running.** Adopted: the claim is worded narrowly, and every `--cmd` mention is updated.
15. **The inert rule needs explicit semantics; Bash `max: 0` graders are valid without `arm`; "90" should not be an acceptance number.** Adopted: Skill-only rule, an "unknown target" warning, and a reviewed inventory diff before C1.
16. **Validate the loader's effective case (prompt overrides `case.yaml`), unknown keys, and duplicate keys.** Adopted as rule 0 in B1.
17. **Root-suite closure cannot be raw `closure()`.** Adopted: group plugins are dropped, external providers are resolved by path, and a missing optional checkout is a warning. Rejected in part: skill-bearing-only filtering would wrongly drop `forgejo-mcp` from `forges`, so exclusions stay explicit per suite.
18. **A final integration pass is missing after Group C.** Rejected: RC already owns that, and B2 is the only Group C slice that touches marketplace.json. Adopted in part: Group A workers are explicitly barred from `scripts/shared/` and `sync-shared`.
19. **`--since` semantics are undefined.** Adopted: endpoints, `-z` output, renames, deleted and new plugins, version parsing and the shallow-clone failure are all specified.
20. **A6's acceptance needs checks in both foreground and background modes and a working MCP call.** Adopted.

second opinion: `mcp__consult__consult`, codex, model gpt-6.1-sol (observed), effort high, plan mode, one pass.

## Appendix: inert sibling graders deleted by C1 (90)

Generated by loading every `plugins/*/evals/*/graders/*.md` with `tool: Skill` and `max: 0`, resolving the regex to skill names, and keeping those whose plugin is neither the case's plugin nor in its `plugins:` list. The other two inert graders, `ship/evals/ship-routing/graders/not-gh-pr.md` and `pr-comments/evals/pr-comments-routing/graders/not-gh-pr.md`, are handled by C2.

- `plugins/agent-config-audit/evals/agent-config-audit-routing/graders/not-config-audit.md` (targets config-audit)
- `plugins/agent-config-audit/evals/trigger-agent-config-audit-1/graders/not-config-audit.md` (targets config-audit)
- `plugins/agent-config-audit/evals/trigger-agent-config-audit-2/graders/not-config-audit.md` (targets config-audit)
- `plugins/ansible/evals/ansible-routing/graders/not-terraform.md` (targets terraform)
- `plugins/api-idempotency/evals/route-idempotency-vs-webhooks/graders/not-neighbour.md` (targets api-webhooks)
- `plugins/api-keys/evals/route-keys-vs-auth/graders/not-neighbour.md` (targets app-auth)
- `plugins/api-oauth-provider/evals/route-oauth-vs-auth/graders/not-neighbour.md` (targets app-auth)
- `plugins/api-rest-design/evals/route-rest-vs-web/graders/not-neighbour.md` (targets web-development)
- `plugins/api-webhooks/evals/route-webhooks-vs-idempotency/graders/not-neighbour.md` (targets api-idempotency)
- `plugins/aspire/evals/trigger-aspire-1/graders/not-ef-core.md` (targets ef-core)
- `plugins/aspnet-core/evals/trigger-aspnet-core-1/graders/not-api-rest-design.md` (targets api-rest-design)
- `plugins/aws-resource-query/evals/resource-query-routing/graders/not-aws-cloudwatch.md` (targets aws-cloudwatch)
- `plugins/bash/evals/bash-vs-coding/graders/not-coding.md` (targets coding)
- `plugins/blazor/evals/trigger-blazor-1/graders/not-aspnet-core.md` (targets aspnet-core)
- `plugins/blazor/evals/trigger-blazor-2/graders/not-csharp.md` (targets csharp)
- `plugins/click-path-audit/evals/click-path-audit-vs-react/graders/not-react.md` (targets react)
- `plugins/coding/evals/coding-feature/graders/not-problem-solving.md` (targets problem-solving)
- `plugins/csharp/evals/csharp-async-deadlock/graders/not-dotnet-performance.md` (targets dotnet-performance)
- `plugins/csharp/evals/csharp-nullable-warnings/graders/not-dotnet-upgrade-guide.md` (targets dotnet-upgrade-guide)
- `plugins/dotnet-ai-apps/evals/trigger-ai-agent-tools/graders/not-mcp-server.md` (targets mcp-server)
- `plugins/dotnet-diagnostics/evals/dotnet-diagnostics-high-cpu-windows/graders/not-problem-solving.md` (targets problem-solving)
- `plugins/dotnet-diagnostics/evals/dotnet-diagnostics-k8s-memory/graders/not-dotnet-performance.md` (targets dotnet-performance)
- `plugins/dotnet-native-interop/evals/trigger-interop-crash/graders/not-dotnet-diagnostics.md` (targets dotnet-diagnostics)
- `plugins/dotnet-native-interop/evals/trigger-interop-header/graders/not-csharp.md` (targets csharp)
- `plugins/dotnet-native-interop/evals/trigger-interop-libraryimport/graders/not-dotnet-upgrade-guide.md` (targets dotnet-upgrade-guide)
- `plugins/dotnet-template-authoring/evals/trigger-template-from-project/graders/not-msbuild.md` (targets msbuild)
- `plugins/dotnet-template-authoring/evals/trigger-template-pack/graders/not-nuget.md` (targets nuget)
- `plugins/dotnet-testing/evals/trigger-dotnet-testing-1/graders/not-unit-testing.md` (targets unit-testing)
- `plugins/dotnet-testing/evals/trigger-dotnet-testing-2/graders/not-unit-testing.md` (targets unit-testing)
- `plugins/e2e-testing/evals/route-e2e-vs-unit/graders/not-unit.md` (targets unit-testing)
- `plugins/ef-core/evals/trigger-ef-core-1/graders/not-db-schema-design.md` (targets db-schema-design)
- `plugins/esp-idf/evals/esp-panic-routing/graders/not-problem-solving.md` (targets problem-solving)
- `plugins/experiment-loop/evals/experiment-loop-vs-problem-solving/graders/not-problem-solving.md` (targets problem-solving)
- `plugins/forgejo-issues/evals/forgejo-issues-routing/graders/not-gh-issues.md` (targets gh-issues)
- `plugins/forgejo-pr/evals/forgejo-pr-routing/graders/not-pr-comments.md` (targets forgejo-pr-comments)
- `plugins/forgejo-release/evals/forgejo-release-routing/graders/not-gh-release.md` (targets gh-release)
- `plugins/game-ai/evals/trigger-game-ai-1/graders/not-game-genres.md` (targets game-genres)
- `plugins/game-ai/evals/trigger-game-ai-2/graders/not-game-genres.md` (targets game-genres)
- `plugins/game-architecture/evals/trigger-game-architecture-2/graders/not-game-feel.md` (targets game-feel)
- `plugins/game-audio/evals/trigger-game-audio-1/graders/not-game-feel.md` (targets game-feel)
- `plugins/game-audio/evals/trigger-game-audio-2/graders/not-game-design.md` (targets game-design)
- `plugins/game-design/evals/trigger-game-design-1/graders/not-game-genres.md` (targets game-genres)
- `plugins/game-design/evals/trigger-game-design-2/graders/not-game-playtest.md` (targets game-playtest)
- `plugins/game-feel/evals/trigger-game-feel-1/graders/not-game-performance.md` (targets game-performance)
- `plugins/game-genres/evals/trigger-game-genres-1/graders/not-game-ai.md` (targets game-ai)
- `plugins/game-genres/evals/trigger-game-genres-2/graders/not-game-ai.md` (targets game-ai)
- `plugins/game-playtest/evals/trigger-game-playtest-1/graders/not-game-design.md` (targets game-design)
- `plugins/game-playtest/evals/trigger-game-playtest-2/graders/not-game-design.md` (targets game-design)
- `plugins/game-prototype/evals/game-prototype-mechanic/graders/not-prototype.md` (targets prototype)
- `plugins/game-ui/evals/trigger-game-ui-1/graders/not-game-feel.md` (targets game-feel)
- `plugins/game-ui/evals/trigger-game-ui-2/graders/not-web-design.md` (targets web-design)
- `plugins/gh-issues/evals/gh-issues-routing/graders/not-issue-breakdown.md` (targets issue-breakdown)
- `plugins/gh-pr/evals/gh-pr-routing/graders/not-pr-comments.md` (targets pr-comments)
- `plugins/gh-triage/evals/gh-triage-routing/graders/not-gh-issues.md` (targets gh-issues)
- `plugins/godot-physics/evals/trigger-godot-physics-1/graders/not-godot-shaders.md` (targets godot-shaders)
- `plugins/golang/evals/trigger-golang-1/graders/not-golang-performance.md` (targets golang-performance)
- `plugins/golang/evals/trigger-golang-2/graders/not-golang-cli.md` (targets golang-cli)
- `plugins/golang-cli/evals/golang-cli-vs-golang/graders/not-golang.md` (targets golang)
- `plugins/golang-performance/evals/golang-performance-vs-golang/graders/not-golang.md` (targets golang)
- `plugins/implement-plan/evals/implement-plan-routing/graders/not-coding.md` (targets coding)
- `plugins/implement-plan/evals/implement-plan-routing/graders/not-planning.md` (targets planning)
- `plugins/issue-breakdown/evals/issue-breakdown-routing/graders/not-gh-issues.md` (targets gh-issues)
- `plugins/level-design/evals/trigger-level-design-2/graders/not-game-architecture.md` (targets game-architecture)
- `plugins/mcp-server/evals/trigger-design-1/graders/not-review.md` (targets mcp-server-review)
- `plugins/mcp-server/evals/trigger-design-2/graders/not-review.md` (targets mcp-server-review)
- `plugins/mcp-server-audit/evals/trigger-audit-1/graders/not-mcp-server.md` (targets mcp-server)
- `plugins/msbuild/evals/msbuild-noop-rebuild/graders/not-csharp.md` (targets csharp)
- `plugins/msbuild/evals/msbuild-obj-clash/graders/not-nuget.md` (targets nuget)
- `plugins/mysql/evals/mysql-vs-postgres/graders/not-postgres.md` (targets postgres)
- `plugins/nuget/evals/nuget-audit-and-sources/graders/not-dependency-vetting.md` (targets dependency-vetting)
- `plugins/nuget/evals/nuget-cpm-conversion/graders/not-msbuild.md` (targets msbuild)
- `plugins/problem-solving/evals/problem-solving-flaky/graders/not-coding.md` (targets coding)
- `plugins/problem-solving/evals/trigger-problem-solving-1/graders/not-coding.md` (targets coding)
- `plugins/problem-solving/evals/trigger-problem-solving-2/graders/not-coding.md` (targets coding)
- `plugins/production-readiness/evals/production-readiness-vs-rollout/graders/not-rollout.md` (targets rollout-plan)
- `plugins/prototype/evals/prototype-vs-planning/graders/not-planning.md` (targets planning)
- `plugins/redis/evals/redis-vs-postgres/graders/not-postgres.md` (targets postgres)
- `plugins/renovate/evals/renovate-config-routing/graders/not-dependabot.md` (targets dependabot)
- `plugins/research/evals/trigger-research-1/graders/not-problem-solving.md` (targets problem-solving)
- `plugins/review-loop/evals/review-loop-routing/graders/not-second-opinion.md` (targets second-opinion)
- `plugins/roslyn-analyzers/evals/trigger-roslyn-analyzers-1/graders/not-csharp.md` (targets csharp)
- `plugins/terraform/evals/trigger-terraform-1/graders/not-kubernetes.md` (targets kubernetes)
- `plugins/terraform/evals/trigger-terraform-2/graders/not-kubernetes.md` (targets kubernetes)
- `plugins/test-gap-audit/evals/test-gap-audit-routing/graders/not-unit.md` (targets unit-testing)
- `plugins/test-gap-audit/evals/trigger-test-gap-audit-1/graders/not-unit.md` (targets unit-testing)
- `plugins/test-gap-audit/evals/trigger-test-gap-audit-2/graders/not-unit.md` (targets unit-testing)
- `plugins/unit-testing/evals/testing-vs-e2e-unit/graders/not-e2e.md` (targets e2e-testing)
- `plugins/unit-testing/evals/trigger-testing-1/graders/not-e2e.md` (targets e2e-testing)
- `plugins/unit-testing/evals/trigger-testing-2/graders/not-e2e.md` (targets e2e-testing)
- `plugins/vite/evals/vite-vs-javascript/graders/not-javascript.md` (targets javascript)
