# Plugin and eval review, 2026-10-23

This is a deep review of all 257 plugins, the four root eval suites and the repo tooling. Ten parallel read-only reviewers each took one family of plugins. Each family report has file:line findings tagged [high], [med] or [low], followed by concrete eval proposals for every plugin in it. This page combines them. Nothing in the repo was changed by the review.

| Report | Scope |
| --- | --- |
| [G1](G1-hooks-mods.md) | Hook and mod plugins (bash-rules, cloud-ops-guard, check-bypass-guard, readonly-agent-gate, consult, usage-log, ...) and `scripts/shared/` |
| [G2](G2-agents-mcp-metas.md) | Subagent plugins, MCP-only plugins, metas and bundles, `evals/orchestration` |
| [G3](G3-languages-web-jvm.md) | Language, web, testing and JVM skills, `evals/jvm` |
| [G4](G4-dotnet-esp-idf.md) | .NET skills and esp-idf |
| [G5](G5-godot-gamedev.md) | Godot and game dev, `evals/godot-meta` |
| [G6](G6-infra-data-ops.md) | AWS, IaC, Kubernetes, databases, observability, ops process |
| [G7](G7-git-forges.md) | git, GitHub, Forgejo, PR workflow, `evals/forges` |
| [G8](G8-api-security-design.md) | API, auth, security, design/UX, MCP server, agent config |
| [G9](G9-process-docs-thinking.md) | Thinking, planning, docs and process skills (includes a routing confusion matrix) |
| [G10](G10-tooling-eval-infra.md) | `scripts/plugins.py`, tests, marketplace, CLAUDE.md, eval coverage statistics and infra proposals |

What ran: `plugins.py check` and `catalog --check` (ok), `claude plugin validate --strict` (all 257 pass), `pytest scripts/test_plugins.py` (34 pass), `install.spec.mjs` (12 pass), and every plugin's own `claude plugin test`, `bun test` and shell suites. All of those pass except two timing tests in bash-rules (`danger.test.tsx:339` and the walker timing test), which fail in a cloud container. No `claude plugin eval` model runs were made.

## The five things that matter most

### 1. About half of the "must not fire" eval graders can never fail

`claude plugin eval` loads only the plugin under test, unless the case lists others under `plugins:` (`.claude/skills/skill-evals/references/cli.md:132`). So a grader in `plugins/mysql/evals` that forbids `postgres:postgres` always passes, because postgres is never loaded.

- A pattern count finds about 96 of 180 `max: 0` Skill graders across 67 plugins aimed at an unloaded sibling.
- Every family report found the same thing independently.
- The boundaries these graders were meant to pin are therefore untested. Examples: postgres/mysql, renovate/dependabot, unit-testing/test-gap-audit, the dotnet perf/diagnostics pair, gh/forgejo issues, and problem-solving/coding.

Only cases that list the competing plugins actually measure a boundary: the root suites (`evals/forges`, `evals/jvm`, `evals/godot-meta`, `evals/orchestration`) and the forgejo-ship cases.

Fix:
- Convert every own-skill hard negative so it asserts that this plugin's own skill stays quiet.
- Delete the inert sibling graders, or move them into a multi-plugin suite.
- Add paired root suites for each cluster that lacks one (see "Eval plan" below).
- G9 proposes a generator script that builds one throwaway plugin per cluster from the competing skills, with `dependencies` stripped.

### 2. Guard bypasses (G1)

Each of these was confirmed by calling the guards' own `analyze`/`decide` functions.

- **check-bypass-guard** denies `git -c core.hooksPath=` but lets through:
  - `git config core.hooksPath /dev/null` (also with `--global`)
  - `git config commit.gpgsign false`
  - `pre-commit uninstall`
  - `chmod -x .git/hooks/pre-commit`
  - Bash writes to the configs it protects, such as `echo x >> .eslintignore`
- **cloud-ops-guard** allows these without asking: `mise run tofu <env> plan`, where the repo defines the task, and `terraform plan`/`init`, which run `data "external"` programs, with `init` allowed even in subagents. It recognises tools only by literal name and gives no verdict for these:
  - `tf`, `k`, `kubecolor`, `oc`
  - `helmfile ... destroy`, `pulumi destroy`
  - `nix run nixpkgs#terraform -- destroy`
  - `busybox sh -c '...'`, `python3 -m awscli`

  "prd" doesn't count as production, and its subagent deny message tells the model how to give itself the `ALLOW: cloud-ops` token.
- **bash-rules** misses these:
  - `rm -rf /private/etc`, `find /etc | xargs rm -f`, `npx rimraf ~`
  - `prisma migrate reset --force`, `rails db:drop`
  - `git push origin --delete main`
  - reads of `~/.cla*/.credentials.json`

  By default it sends unredacted "unsure" commands to ollama.com.
- **readonly-agent-gate** allows `ln -s src/a.ts /tmp/link`, after which a Write to `/tmp/link` edits the repo. It also allows `sqlite3` DML, `make install` and `scp`.
- **usage-log**: the log directory comes from the inherited `CLAUDE_USAGE_LOG_DIR`, and the 30-day `find -delete` prune runs inside it. A project's settings could aim that prune at transcript folders.

### 3. Other security and permission issues

- **security-scan** `scanners.py:269-276` runs `pip-audit -r requirements*.txt` and `pip-audit <pyproject dir>` without `--no-deps --disable-pip`, so auditing a branch can build and run its packages. Only the `uv.lock` path uses the safe flags. (G8)
- **coder, coder-high, coder-critical, coder-max and scribe** have no `tools:` allowlist, only `disallowedTools: Agent, Workflow, mcp__claude-in-chrome`. They inherit every MCP write tool in the session (GitHub merge, Gmail and so on), and "don't push or comment" is enforced only by the prompt. (G2)
- **Pre-approval grants that are too wide:**
  - test-run's `Bash(python3 .../run_tests.py *)` plus its `--cmd` flag lets any command run without a prompt.
  - playwright-cli's `Bash(playwright-cli *)` covers `run-code` and `state-save`. (G3)
- **godot-mcp-setup** installs the addon's latest commit, fetched separately for the approved dry run and for the real install, so the approved code and the installed code can differ. Pin a commit. (G5)
- **forgejo-release** tags the branch head on the server (`-T --branch main`). That is the wrong-commit risk gh-release avoids with `--verify-tag`. (G7)
- **aws-well-architected** `references/cost.md:3` puts `--region <region>` on `aws ce` calls, but Cost Explorer only has a us-east-1 endpoint. The `aws` skill gets this right. Its secret-read deny list has also drifted from the `aws` skill's. (G6)

### 4. Tooling lets defects through (G10)

- `plugins.py check` caught none of 14 defects injected into a copy of the repo. They included nested quotes in eval YAML (the actual cold-read failure in `evals-2026-10-23.md`), an uncompilable regex, a grader naming a nonexistent skill, a skill name that doesn't match its folder, and `autoCompactWindow` in an agent.
- The eval lint only scans `plugins/*/evals`, never the root `evals/`.
- 28 files fail a strict YAML parse because of an unquoted `: ` in the description: 24 SKILL.md files and the 4 coder agents. Claude Code tolerates this today.
- No version-bump guard: necromancy, vet, v0-rewrite, reorder and leakage-audit changed without a bump.
- No category rule: aspnet-core and ef-core are `"category": "meta"` in `marketplace.json`, though both ship a skill.
- No CI workflow exists.
- CLAUDE.md still points at `plugins/coremods` and `crew`, which now live in `archive/plugins/`.
- Free load check: `claude plugin eval <p> --trust-plugin --ablation none --max-cost-usd 0` parses every case and stops before any model call. Run across all suites, it showed the two forgejo-ship cases fail to load from the plugin dir and all 18 jvm cases need the `3rd-party/gradle-skills` clone. This stop-before-any-call behaviour was observed, not documented.

### 5. Eval coverage is shallow

- 137 of 257 plugins have no evals of their own: 75 skill, 18 agent, 17 hook/mod, 7 MCP, 20 meta/bundle.
- Of the 120 that have evals, 57 have no own-skill hard negative.
- Only 21 cases across 15 plugins check the result rather than routing.
- 285 of 361 cases commit `runs: 1`, and 44 don't pin a model.
- Four routing evals can never pass, because their skill sets `disable-model-invocation: true`: `ship-routing` and `pr-comments-routing` here, and the matching graders in gh-pr and forgejo-pr, which always pass. Manual-only skills need slash-invoked outcome evals instead.
- `evals/jvm` has no held-out cases: spring-boot-testing, unit-testing, scala and java descriptions restate the suite's prompts nearly word for word.
- The root suites' plugin lists have drifted from `programming-core` (they lack leakage-audit, feature-flags and grep-app).

## Other notable findings by family

- **Metas and routing (G2, G4, G5):**
  - 118 plugins are in no meta or bundle, including ones a skill inside the meta already hands off to: godot → godot-csharp/godot-multiplayer/game-ai, react/vite → javascript/typescript, golang → golang-cli/golang-performance, python → fastapi, and the devops agent → kubernetes/helm/gitops.
  - dotnet-meta installs 4 of the 15 .NET plugins.
  - Agent plugins preload skills (`coding:coding`, `planning`, `postgres`) without depending on their plugins.
  - Only architect depends on readonly-agent-gate.
- **Description collisions with no working eval:**
  - unit-testing vs test-gap-audit, both in programming-core
  - git-flow vs trunk-based on "which branching model"
  - v0-rewrite vs ssot-consolidate vs docs-audit on "copies disagree"
  - modernize vs deprecation-migration
  - planning's "grill me" vs the-fool
  - game-feel vs godot-physics vs game-performance on "jitter"
  - the five ported design skills vs Anthropic's official `design` plugin, which uses the same names
- **Forge parity (G7):**
  - gh-triage, issue-breakdown, gh-repo-setup and gh-code-security have no Forgejo gate.
  - Nothing handles Gitea.
  - forgejo-actions lacks gh-actions' injection-sink list and `$GITHUB_ENV` delimiter rule.
  - pr-comments fetches through GraphQL only, which returns 403 in cloud sessions.
  - dependabot and renovate disagree on merge approval and on PRs with no checks.
- **Stale facts:**
  - .NET 8 and 9 reach end of support on 2026-11-10, and no .NET skill warns about it. dotnet-upgrade-guide chains 8 → 9 → 10 and its test-framework references miss xunit.v3 4.x and MTP v2.
  - mysql misses the 9.7 LTS line.
  - feature-flags says the Statsig acquisition is unconfirmed (it closed 2026-05-05).
  - promql ignores Prometheus 3 native histograms.
  - godot dates `add_dock(EditorDock)` to 4.7 instead of 4.6, and godot-physics offers a 3D-only interpolation call to 2D users.
  - security-scan mis-maps several OWASP 2025 IDs.
  - app-auth has no passkey or NIST 800-63B-4 guidance.
- **Unverified version claims that need a source check:**
  - Prisma 8 and its unpinned `npx` behaviour
  - Go 1.27 features
  - Vite 8 `codeSplitting`
  - Pinia 4
  - Gradle 9 on JDK 27
  - gh 2.94 issue flags

## Suggested order of work

1. **Security fixes.**
   - The G1 guard bypasses, each with must-flag tests built from the commands above.
   - security-scan's pip-audit flags.
   - A `tools:` allowlist for coder-* and scribe.
   - Narrower grants for test-run and playwright-cli.
   - Pin the godot-mcp-setup commit.
   - `--verify`-style tagging in forgejo-release.
2. **Tooling (G10 §"Proposed infra improvements").**
   - A real YAML lint over SKILL.md, agent and eval frontmatter in both eval trees.
   - Regex compile and skill-name targeting for graders, and `arm: both` on `max: 0`.
   - A category rule, a version-bump guard (`check --since origin/main`) and a root-suite closure check.
   - The free load check, a `plugins.py coverage` command with a ratcheting allowlist, and a CI workflow.
   - Then single-quote the 28 descriptions and fix the aspnet-core/ef-core category.
3. **Make existing evals honest.** Replace the inert sibling graders and turn the `disable-model-invocation` routing cases into slash-invoked outcome cases. Re-run the suites with `--runs 3` and pin a model in all 44 unpinned cases.
4. **Fill gaps with the per-plugin proposals in each family report.** Prioritise plugins with zero evals that share a meta with an overlapping sibling.
5. **Metas.**
   - Add the hand-off targets listed above.
   - Consider the `security`, `data`, `api` and `observability` metas G2 proposes.
   - Drop the four redundant listings.
6. **Stale facts, then CLAUDE.md drift.**

## Eval plan

Each family report lists per-plugin case sketches with prompt, type and grader. Cross-cutting additions:

- **New paired root suites** that load every competing plugin. Each case has one expected skill and `max: 0` graders on the rest:
  - `evals/testing`: unit-testing, test-run, test-gap-audit, e2e-testing, playwright-cli, dotnet-testing, java-testing
  - `evals/web`: javascript, typescript, react, vue, vite, tanstack, web-development, web-design
  - `evals/data`: postgres, mysql, redis, db-schema-design, prisma, ef-core, plus the dba agent
  - `evals/aws`: aws, aws-cli, aws-resource-query, aws-cloudwatch, aws-well-architected
  - `evals/dotnet`: all 15 .NET plugins
  - `evals/thinking`: the G9 confusion matrix (doubt-review, the-fool, prove, vet, second-opinion, cold-read, planning, problem-solving, macrothink, prism)
  - `evals/docs`: debloat, reorder, v0-rewrite, v0-restart, ssot-consolidate, docs-audit, cold-read
  - `evals/auth-api`: app-auth, better-auth, api-oauth-provider, api-keys, api-webhooks
  - `evals/security`: security-scan, threat-model, gh-code-security, privacy-review, dependency-vetting, plus the security-auditor agent
  - `evals/branching`: git-flow, hubflow, trunk-based
- **Forge suite additions:** a release case (both release plugins are already loaded), fj vs gh, GitHub Enterprise, Gitea, and Codeberg triage.
- **Agent delegation evals:**
  - One case per agent with no coverage: coder-high, coder-max, web-perf-auditor, ui-critic, shipper, forgejo-shipper, plugin-vetter, open-source-release-audit.
  - A "do it yourself, don't delegate" negative.
  - Graders tightened to require the plugin-qualified agent name. The current `(coder:)?coder` regex also accepts a bare name the Agent tool rejects.
- **Outcome evals with deterministic graders.** Starting points:
  - forgejo-release tags the verified commit.
  - dotnet-upgrade-guide warns about the net9.0 end of support.
  - godot C# scripts are `partial`; no Godot 3 shader names appear.
  - aws-well-architected calls `ce` in us-east-1.
  - ansible doesn't run `--check` against prod without asking.
  - The G9 skills keep their core invariants: read-only until approved, move-only, never read the raw transcript.
- **Deny-message evals for mods (G1).** Feed a denied command and assert the model's next call takes the suggested alternative and doesn't retry or route around the guard. Do this especially for cloud-ops-guard's `ALLOW:` token message.
- **Manual-only skills:** slash-invoked outcome evals (`/ship`, `/pr-comments`, `/security-scan`), with a stub CLI in the way forgejo-ship already does it.
