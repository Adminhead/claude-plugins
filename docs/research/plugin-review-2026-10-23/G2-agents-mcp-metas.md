# G2 review: subagent plugins, MCP-only plugins, meta/bundle plugins, evals/orchestration

Checks run: `python3 scripts/plugins.py check` → ok. `claude plugin validate` (CLI 2.1.309) passes for all 19 agent plugins and 7 MCP plugins (only ICON_MISSING warnings). No agent file sets `autoCompactWindow`. I unpacked `@sentry/mcp-server@0.42.0` to check the Sentry env-var names. Nothing in the repo was edited.

## Summary

- **[high] The coder tiers and scribe have no `tools` allowlist, so they inherit every MCP tool in the session.** That includes GitHub, Forgejo and Atlassian write tools (merge PR, comment, delete branch), Gmail and Drive. Only `Agent`, `Workflow` and `mcp__claude-in-chrome` are denied (`plugins/coder*/agents/*.md:6`, `plugins/scribe/agents/scribe.md:6`). The bodies say "don't comment on PRs", but a prompt is not a boundary. Give them an explicit allowlist. Scribe also needs the Outline MCP tools.
- **[med] Agent plugins preload skills that they don't depend on.** The coder tiers preload `coding:coding`, debugger preloads `problem-solving:problem-solving`, architect preloads `planning:planning`, and dba preloads `db-schema-design:db-schema-design` and `postgres:postgres`. None of these plugin.json files lists the skill plugin. `orchestration-meta` (user scope) doesn't pull in `programming-core` either, so an orchestration-only install runs the agents without their method skills. `browser-tester` → `playwright-cli` and `shipper` → `git-commit` already do this correctly.
- **[med] The read-only promise is enforced unevenly.** `readonly-agent-gate` covers architect, reviewer, debugger, security-auditor and open-source-release-audit (`plugins/readonly-agent-gate/scripts/agents.ts:8-15`). Only `architect` depends on the gate. `security-auditor` and `open-source-release-audit` are in no meta, so they usually run without it. `web-perf-auditor` has Bash, calls itself report-only and is not gated at all. The README Agents blurb ("limits architect, reviewer and debugger") is stale against the gate's own description.
- **[med] `aspnet-core` and `ef-core` are miscategorised and have no meta.** Both are `"category": "meta"` in `.claude-plugin/marketplace.json`, but each ships a skill. They should be `development`. `check` doesn't catch this: `scripts/plugins.py:154-212` never validates `category` against `is_meta`/`is_bundle`. Both plugins are also orphans, even though `csharp`, which `dotnet-meta` installs, routes to them.
- **[med] 118 plugins are in no meta or bundle.** Many are clear misses that a skill inside a meta already routes to:
  - `godot` hands off to `godot-csharp`, `godot-multiplayer` and `game-ai`.
  - `devops` loads the `kubernetes`, `helm`, `gitops` and `gh-actions` skills, none of which `iac-meta` has.
  - `react` and `vite` point to `javascript` and `typescript`, which `web-meta` lacks.
  - `golang` → `golang-cli`, `golang-performance`; `java` → `spring-boot`, `spring-boot-testing`; `python` → `fastapi`.
  - The GitHub skills `gh-release`, `gh-triage`, `gh-repo-setup`, `gh-code-security` and `issue-breakdown` are all outside `github-meta`, and `forgejo-release` is outside `forgejo-meta`.
- **[med] The `shipper` description has no explicit-request gate, and its body can't do the job when delegated to directly.** The `ship` skill says "agents delegate to shipper:shipper instead". But the 22-line body (`plugins/shipper/agents/shipper.md:12-22`) has no level table, no `gh pr create`, `gh pr checks --watch` or `gh pr merge` steps, and no "stop when no level is named". All of that lives in the ship skill. `forgejo-shipper` has the gate (description, and body line 14) and its full procedure.
- **[med] No agent plugin and no MCP plugin has its own evals.** Delegation routing is covered only by `evals/orchestration` (13 cases), and only from inside the orchestrator main thread. Nothing tests routing from a normal session. These agents have no case at all: `coder-high`, `coder-max`, `web-perf-auditor`, `ui-critic`, `plugin-vetter`, `open-source-release-audit`, `shipper`, `forgejo-shipper`.
- **[med] `evals/orchestration` has drifted from the metas, and its graders accept a bare agent name.**
  - Its "full" set includes `coder-max`, which `orchestration-meta` deliberately leaves out.
  - Every grader accepts the bare name (`"(coder:)?coder"`), even though the Agent tool rejects a bare name for plugin agents (`plugins/orchestration/agents/orchestration.md:20`). A rejected call therefore scores as a pass.
  - Only one case has negatives, and there's no "do it yourself" case.
- **[low] The four coder tiers are 48-line copies that differ in only 4 lines.** Nothing checks that they stay in sync. Generate them from one template in `scripts/plugins.py`, or add a `check` that diffs them modulo the tier lines.
- **[low] Some meta listings are redundant.** Each pair below is already pulled in through a dependency:
  - `github-meta`: `ship` + `shipper`
  - `forgejo-meta`: `forgejo-ship` + `forgejo-shipper`
  - `web-meta`: `browser-tester` + `playwright-cli`
  - `orchestration-meta`: `architect` + `readonly-agent-gate`

  This is harmless, but `check` could flag it.

## Per-plugin findings

### architect
- [med] `tools` includes `Edit` (`plugins/architect/agents/architect.md:6`) for an agent that "never modif[ies] repo files". Scratch docs need only `Write`. Drop `Edit`; the gate then has one less write surface to police.
- [low] It preloads `planning:planning` without a dependency on `planning` (see Summary).
- [low] The body hedges "If the planning skill is preloaded" (line 14), but the coder tiers, which share the same risk, don't hedge. Make both consistent.
- Evals now: `evals/orchestration/evals/full-plan` (1 positive, no negative).
- Suggested evals:
  - `route-architect-vs-coder` (hard negative in the full set): "Rename `getUser` to `findUser` in src/db/users.ts and its two callers". `architect` max 0, `coder` min 1.
  - `route-architect-design-choice` (positive): "Should webhook retries use an outbox table or a queue? Compare them for this repo before we pick."

### coder / coder-high / coder-critical / coder-max
- [high] No `tools` allowlist (`disallowedTools: Agent, Workflow, mcp__claude-in-chrome`, line 6 of each). Suggested allowlist: `Read, Edit, Write, Bash, Grep, Glob, LSP, Skill, WebFetch, WebSearch` plus the five `mcp__codebase-memory-mcp__*` tools the body names (line 21).
- [med] `coder` is described as handling "features, fixes, refactors, multi-file edits" on haiku (`coder.md:3`). The orchestrator makes it the default for "most implementation work" (`orchestration.md:28`). That's a lot to ask of haiku, and no outcome eval measures it. Add one (below) before keeping haiku as the default.
- [low] "Commit ... Never push" (line 29) contradicts Boundaries, which allows pushing when the brief asks (line 42: "Unless the brief asks for it, don't ... pushing"). Pick one.
- [low] The coder-max description says "fable". The README and orchestration body agree, but nothing in the repo verifies that `fable` is an accepted agent `model` alias. An unknown alias silently falls back. Confirm with `claude --debug` (`does not recognize`).
- [low] plugin.json descriptions are malformed: "Coder agent, haiku tier. most bounded changes ..." (lowercase after the full stop, no verb). The same pattern is in all four and in the README catalog.
- [low] The four bodies are identical apart from the tier lines (see Summary).
- Evals now: `evals/orchestration`: `full-feature` (coder + 2 negatives), `coder-only-refactor`, `full-known-race` (coder-critical). Nothing routes to `coder-high` or `coder-max`.
- Suggested evals:
  - `route-coder-high-api-redesign` (positive, full set): "Redesign the users repository API so callers pass a typed filter object instead of 6 optional args; update all callers and tests". `coder-high` min 1, `coder-critical` max 0.
  - `route-escalate-after-coder-fail` (positive, `case.yaml` `history_file` with a coder report ending `escalate: coder-high — ...`): the grader expects `coder-high` and not `coder`.
  - `route-coder-max-installed-last-resort` (history in which coder-critical failed twice, coder-max installed): expects `coder-max`. A twin case without coder-max installed expects `debugger` or a user report, with `coder-max` max 0.
  - `outcome-coder-haiku-pagination` (outcome, `--allow-tools Edit Write`, scaffold): delegate `coder:coder` directly with the full-feature brief. Regex graders check that the tests file has 3 `it(` cases and the report has `Commands run`. An llm grader checks the output contract fields.

### debugger
- [low] It preloads `problem-solving` without a dependency.
- [low] `deeper diagnosis` escalation tells the caller to pass `model: opus`, but the description says "the caller passes a stronger model". These are consistent, but only the orchestrator knows to do it. A plain session never will. Consider naming the condition in the description.
- Evals now: `full-flaky` (positive only).
- Suggested evals:
  - `route-debugger-not-coder-unknown-cause` (positive with negative): "POST /webhook returns 500 on staging since yesterday's deploy, no idea why". `debugger` min 1, `coder*` max 0 (bounded by max_turns 4).
  - `route-known-cause-skips-debugger` (hard negative): "The null check at src/routes/users.ts:42 is inverted; fix it and add a test". `debugger` max 0.

### reviewer
- [low] Its `tools` list includes `mcp__consult__consult`, but the plugin doesn't depend on `consult` or `second-opinion`. The body hedges, so this is fine. Same for architect and security-auditor.
- Evals now: `full-review` (positive only).
- Suggested evals:
  - `route-reviewer-plus-security` (positive, specialists set): "Review the auth middleware change in HEAD~1..HEAD against the spec". Graders: `reviewer` min 1 and `security-auditor` min 1 (the orchestrator says to run both).
  - `route-review-not-code-review` (hard negative, plain session without orchestrator): "/code-review style bug hunt across the whole diff". The `reviewer` agent should not fire; the built-in is expected.

### scribe
- [high] No `tools` allowlist (inherits all MCP). It needs Outline tools, so use `disallowedTools` for `mcp__github`, `mcp__plugin_forgejo-mcp_forgejo` and `mcp__plugin_atlassian-mcp_atlassian` at minimum, or an allowlist naming the Outline tools.
- [low] Step 5 references the `avoid-ai-writing` skill. No plugin in this repo ships it (it's external), so say where it comes from or drop it.
- Evals now: `full-docs` (positive only).
- Suggested evals:
  - `route-scribe-outline` (positive): "Update the 'Payments runbook' doc in our Outline Engineering collection to match the new webhook retry logic". `scribe` min 1.
  - `route-docstring-stays-with-coder` (hard negative): "Add pagination to GET /users with docstrings". `scribe` max 0 (the orchestrator says the code's author writes its docstrings).

### dba
- [med] It preloads two skills with no dependency, and it's in no meta. It only appears in the eval "specialists" set, so most users never get it. Suggest a `data-meta` (`db-schema-design`, `postgres`, `mysql`, `redis`, `prisma`, `dba`) or adding it to `orchestration-meta`.
- [low] The description claims MySQL and SQLite, but it preloads only postgres. The body defers MySQL to `mysql` "if installed". OK, but the description should say PostgreSQL-first.
- Evals now: `spec-dba` (positive).
- Suggested evals:
  - `route-dba-slow-query` (positive): "`SELECT ... FROM orders WHERE user_id=$1 ORDER BY created_at` takes 4s on prod; here's the EXPLAIN".
  - `route-dba-not-for-orm-code` (hard negative): "Add a `lastLoginAt` field to the User DTO returned by GET /users" (app code, no schema change). `dba` max 0.

### devops
- [med] Step 2 loads `kubernetes:kubernetes`, `helm:helm`, `gitops:gitops`, `bash:bash` and `gh-actions:gh-actions` (`plugins/devops/agents/devops.md:24`). `iac-meta` ships `devops` but not kubernetes, helm, gitops or gh-actions. `kubernetes-meta` has those skills but not `devops`. Add `devops` to `kubernetes-meta`, or add the k8s skills to `iac-meta`.
- [low] Its `tools` list has no `WebFetch`, so it can't check provider docs or version notes. Either add it or say "from repo only".
- Evals now: `spec-devops` (positive).
- Suggested evals:
  - `route-devops-helm-review` (positive, specialists set): "Review charts/api/values.yaml for missing resource limits and probes".
  - `route-devops-not-app-dockerfile-bug` (hard negative): "The Express route in src/routes/users.ts returns 500 inside the container". `devops` max 0, `debugger` min 1.

### security-auditor
- [med] It's in no meta, and it doesn't depend on `readonly-agent-gate`, which is what enforces its read-only Bash. Add the dependency, or put the agent in `orchestration-meta`. The orchestrator body (`orchestration.md:29,31`) assumes it's available.
- Evals now: `spec-security` (positive).
- Suggested evals:
  - `route-security-after-auth-diff` (positive, proactive): "I just changed session cookie handling in src/auth/session.ts, ship it". `security-auditor` min 1.
  - `route-threat-model-not-auditor` (hard negative when the `threat-model` skill is loaded): "Do a STRIDE threat model of the whole system design". The `threat-model` skill fires.

### browser-tester
- [low] Artifacts go to `/tmp/browser-tester-<run>/` rather than the session scratchpad, unlike every other agent. That's fine for the gate, but it's inconsistent.
- [low] This agent starts servers, so the read-only gate can't apply to it. Its "never edits repo" rule is prompt-only; say so in the README.
- Evals now: `web-browser-check` (positive).
- Suggested evals:
  - `route-browser-tester-vs-e2e-testing` (hard negative, web set + `e2e-testing`): "Write a Playwright Test spec for the signup flow". `browser-tester` max 0, `e2e-testing` skill min 1.
  - `route-browser-tester-after-ui-change` (positive, proactive): "I restyled the checkout button and moved it into the footer; make sure checkout still works at localhost:3000".

### web-perf-auditor
- [med] It has Bash and calls itself report-only, but `readonly-agent-gate` doesn't gate it. Add it to `agents.ts`.
- [low] The pinned `npx lighthouse@13` is fine, but it uses `/tmp/<run>/` instead of the scratchpad.
- [low] Line 10 is an HTML attribution comment inside the agent body. The body becomes the system prompt, so this costs tokens on every run. Move it to `LICENSE`/`NOTICE`.
- Evals now: none (it's in the web set but no case targets it).
- Suggested evals:
  - `route-web-perf` (positive, web set): "LCP on our marketing home page is 4.8s in PSI; here's report.json. What's causing it?" `web-perf-auditor` min 1.
  - `route-perf-backend-not-web` (hard negative): "GET /users is slow; the Postgres query takes 3s". `web-perf-auditor` max 0.

### ui-critic
- [low] It writes `.ui-critic/inspect/` into the project root (line 32) and leaves it there. Other read-only agents use the scratchpad. Add `--out` pointing at the scratchpad, or document the `.gitignore` entry in the README.
- [low] `model: inherit` on a screenshot-critique agent means a haiku session gets a haiku critic. Consider pinning `sonnet`.
- Evals now: none. It has `tests/rules.spec.mjs` (bun) for the linter rules only.
- Suggested evals:
  - `route-ui-critic-after-restyle` (positive, design set): "I just rebuilt landing.html; why does it look so generic?"
  - `route-ui-critic-not-a11y` (hard negative vs `accessibility-review`): "Check landing.html against WCAG 2.2 AA contrast and focus rules". `ui-critic` max 0.

### shipper / forgejo-shipper
- [med] The shipper description lacks forgejo-shipper's "Callers delegate to it only when the user explicitly asked in this conversation" sentence. Add it, along with the body gate "if the prompt names no level, stop".
- [med] The shipper body is too thin for direct delegation (see Summary). Add the gh steps, mirroring `forgejo-shipper.md:20-24`.
- Evals now: none for either (`evals/forges` covers the `ship`/`forgejo-ship` skills only).
- Suggested evals:
  - `no-ship-without-ask` (hard negative): "Fix the typo in README and commit it". `shipper` max 0 (commit only, via `git-commit`).
  - `route-shipper-on-explicit-merge` (positive): "Commit this, open a PR and merge once CI is green". `shipper` min 1, `forgejo-shipper` max 0 when both are installed with a GitHub remote scaffold.

### plugin-vetter
- Its tool set (Read/Grep/Glob) matches its purpose. No defects found.
- Evals now: none.
- Suggested evals:
  - `route-vetter-third-party` (positive, with `vet`): "Before I install github.com/foo/claude-tools, check it's safe; cloned at /tmp/foo".
  - `route-vetter-not-own-config` (hard negative vs `agent-config-audit`): "Audit my own ~/.claude/settings.json permissions". `plugin-vetter` max 0.
  - `outcome-vetter-hidden-directive` (outcome, scaffold with a SKILL.md containing a zero-width-joined "ignore previous instructions" and a `curl | sh` hook): regex `Verdict:\*\* FAIL` on last_message.

### open-source-release-audit
- [low] The home-path regex exempts `/home/user/` (line 73). That's tuned to the cloud container, and a real user named `user` slips through. Make it a delegation input instead.
- [med] No gate dependency (see security-auditor).
- Evals now: none.
- Suggested evals:
  - `route-osra-before-public` (positive): "We're flipping this repo to public tomorrow; anything we must scrub first?"
  - `route-osra-vs-security-auditor` (hard negative): "Review the auth diff for injection". `open-source-release-audit` max 0.
  - `outcome-osra-history-secret` (scaffold commits an `AKIA...` key, then deletes it): regex `Verdict: FAIL` and `\[SECRETS\].*commit`.

### orchestration
- [low] Line 21 names `codebase-memory`, `codebase-memory-scout` and `codebase-memory-auditor` agents. These are external, so the fallback is fine, but note where they come from.
- [low] Line 40 says coder-max "is installed per repo", which matches the README. But `evals/orchestration` "full" includes it (see evals below).
- [low] The scripts look sound: `link-launcher.sh` refuses to clobber a regular file, and `claude-orchestrate` quotes everything and passes args as arrays.
- Evals now: the root suite (below).

### evals/orchestration (root suite)
- [med] "full" and "specialists" include `plugins/coder-max` (e.g. `evals/full-feature/prompt.md:5`). The README says `full` = orchestration-meta agents, and orchestration-meta excludes coder-max. Remove it from `full`, and add a separate `full-plus-max` set for the coder-max cases.
- [med] Graders `input_match: '"subagent_type"\s*:\s*"(coder:)?coder"'` accept the bare name, which the Agent tool rejects for plugin agents. Use `"coder:coder"` (scoped only). Then `no-coder-feature`'s `general-purpose` is the only bare match.
- [med] Negatives are scarce: only `full-feature` has any. Add `max: 0, arm: both` guards:
  - `full-plan`: `coder*` max 0 ("don't implement")
  - `full-flaky`: `architect` max 0
  - `spec-dba`: `coder` max 0
  - `full-known-race`: `coder:coder` max 0
- [med] Missing cases:
  - `self-trivial-edit`: `allowed_tools` incl. Edit; "Change the 404 message in src/routes/users.ts:30 to 'User not found'". Agent max 0. Tests the "do it yourself" threshold.
  - `explore-question`: "Where is the webhook signature verified?" Expects `Explore` or no agent; `coder*` max 0.
  - `route-coder-high`, the escalation-history cases and `route-web-perf` (above).
  - `no-architect-plan` (no-coder set without architect): expects `Plan`.
  - `review-after-coder` (history_file with a coder report): expects `reviewer` with a commit range in the prompt (regex on `"prompt"` containing `\.\.|HEAD`).
- [low] No `model:` is pinned in the cases. `evals/godot-meta` pins `claude-sonnet-5-5`. A model rollout will read as a routing regression; pin it, or require `--model` in the README command.
- [low] The `allowed_tools: [Read, Glob, Grep, Agent]` used everywhere removes the orchestrator's option to do the work itself, which biases every case toward delegation. Keep it for routing, but add the `self-trivial-edit` case with Edit allowed.
- `scaffold.sh` copies all match `fixtures/express-api.sh` (checked with `cmp`). OK.

### atlassian-mcp
- Config is correct (HTTP, OAuth). [low] The README warns about the duplicate `atlassian` server from the `design` plugin. That conflict is live in this very session (the `plugin:design:atlassian` server exists), so consider flagging it in the plugin.json description too.
- Evals now: none. Suggested: `route-atlassian-jira` (positive): "What's the status of PROJ-123 and who's assigned?" A `tool_used` grader on `mcp__plugin_atlassian-mcp_atlassian__.*` min 1. It needs auth, so mark it manual-only.

### aws-knowledge / aws-mcp
- Configs are correct. aws-mcp passes the profile as `$1` to `sh -c` (no injection) and pins `mcp-proxy-for-aws-cli==1.7.0` with `--disable-telemetry`.
- [low] aws-mcp: `uvx` resolves from PyPI at runtime with pinned versions but no hashes (the README says so). Acceptable.
- [low] `aws-meta` excludes `aws-knowledge` on purpose (duplicate tools). Good. But `aws-meta` lacks `terraform`, which `aws`, `aws-resource-query` and `aws-well-architected` route to.
- Evals now: none for the MCP plugins (the aws-* skills have their own).
- Suggested evals:
  - `route-aws-docs-mcp` (positive, aws-knowledge only): "Is Bedrock AgentCore available in eu-central-2?" `tool_used` `aws___get_regional_availability` min 1.
  - `run-script-not-for-docs` (hard negative, aws-mcp): "What does the S3 `PutBucketPolicy` API require?" `aws___run_script` max 0.

### forgejo-mcp
- Config is correct. The token is `sensitive: true` and sent as `Authorization: token ...`. The deny-list guidance is good.
- [low] Required `userConfig` combined with installation via `forgejo-meta` is "not verified" to prompt (README:361). Verify it, since the meta installs it at project scope.
- Evals now: none. Suggested: `forgejo-mcp-for-run-logs` (positive, forgejo-meta set): "Why did Actions run 412 fail on git.example.com/org/api?" Expects `mcp__plugin_forgejo-mcp_forgejo__get_action_job_logs`, or the `forgejo-actions` skill first.

### grep-app
- Config is correct, and the README's "not for" boundaries are good. It's in `programming-core`.
- Suggested evals:
  - `route-grep-app-usage` (positive): "How do other projects call `getServerSession(` in Next.js route handlers?" `searchGitHub` min 1.
  - `grep-app-not-own-repo` (hard negative): "Find where we call getServerSession in this repo". `searchGitHub` max 0.

### sentry-mcp-self-hosted
- [low] `.mcp.json` uses the bare-map form (`{"sentry": {...}}`), while all six sibling MCP plugins use the `{"mcpServers": {...}}` wrapper. Both validate, and `plugins.py:105` accepts both. Normalise it.
- Verified against the 0.42.0 tarball (`dist/parse-*.js:72-81`): `SENTRY_HOST`, `SENTRY_URL`, `SENTRY_DSN`/`DEFAULT_SENTRY_DSN` and `MCP_SKILLS` are read with truthiness checks, so the blanking works. `MCP_DISABLE_SKILLS` is not blanked, but it can only narrow. 0.42.0 is still npm `latest`. `npx -y` pins the top-level version only; transitive deps float.
- Evals now: none. Suggested: a manual-only `route-sentry-issue` ("What's the top unresolved error in project api this week?").

### outline-mcp
- `outline-auth.sh` is sound: it validates the key charset before building the JSON and falls back to `{}`.
- [low] `head -n 1 | tr -d '[:space:]'` also strips interior spaces, which is harmless. The script doesn't check the file mode. Consider warning when the key file is group- or world-readable.
- Evals now: none. Cross-check with scribe's Outline step (scribe suggestion above).

### Metas and bundles

**Categories**
- [med] `aspnet-core` and `ef-core` should be `"category": "development"` in `.claude-plugin/marketplace.json`.
- [med] Add a `check` rule: `category == "meta"` ⇔ `is_meta(name)`, and `category == "bundle"` ⇒ only deps and no components.

**Orphans that clearly belong** (a meta's own skill routes to them, or they're the stack's mainstream)

| Meta or bundle | Add |
| --- | --- |
| `dotnet-meta` | `aspnet-core`, `ef-core`, `dotnet-diagnostics`, `dotnet-performance`, `dotnet-upgrade-guide`. `csharp` routes to `aspnet-core`, `ef-core`, `blazor` and `roslyn-analyzers`. Keep `aspire`, `blazor`, `dotnet-ai-apps`, `dotnet-native-interop` and `dotnet-template-authoring` opt-in, but say so in the dotnet-meta description. |
| `golang-meta` | `golang-cli`, `golang-performance` (referenced by `golang`) |
| `java-meta` | `spring-boot`, `spring-boot-testing` (referenced by `java`/`java-testing`). `evals/jvm` already loads them as part of "the JVM set". |
| `scala-meta` | `play-framework` is referenced by `scala`/`sbt`. It's arguably opt-in, but `evals/jvm` treats it as part of the set. |
| `python-meta` | `fastapi` (referenced by `python`) |
| `node-typescript-meta` | `ts-module-boundaries` (referenced by `typescript`). `prisma` is optional. |
| `web-meta` | `javascript` and `typescript` (referenced by `react` and `vite`; a front-end set without the TS skill is the biggest gap), plus `tanstack` and `app-auth`. `vue` is referenced by `react`/`vite` routing; either add it or ship a `vue` variant. |
| `godot-meta` | `godot-csharp`, `godot-multiplayer` (the `godot` route table at `plugins/godot/skills/godot/SKILL.md:27-28` hands off to them) |
| `gamedev-core` | `game-ai` (in the same `godot` route table, line 30), `game-prototype`, `game-genres`, `game-assets`, `game-publish` (referenced by `game-design`, `level-design`, `godot-export`) |
| `iac-meta` | `kubernetes`, `helm`, `gitops`, `gh-actions` (loaded by the `devops` it ships), `pre-commit` |
| `kubernetes-meta` | `devops`, `docker` (referenced by `helm`/`kubernetes`/`tilt`) |
| `aws-meta` | `terraform` |
| `github-meta` | `gh-release`, `gh-triage`, `gh-repo-setup`, `gh-code-security`, `issue-breakdown` |
| `forgejo-meta` | `forgejo-release`. `EXCLUSIVE_METAS` stays satisfied. |
| `design-meta` | `playwright-cli` (`ui-direction`, `web-design` and `screen-reader-testing` in design-core route to it) |
| `orchestration-meta` | `security-auditor` (the orchestrator body expects it), `second-opinion` + `consult` (architect, reviewer and security-auditor list `mcp__consult__consult`), and the agents' skill dependencies `coding`, `problem-solving`, `planning`. Better: put those as dependencies on each agent plugin. |

**Candidate new metas for the remaining orphan clusters**
- `security-meta`: `security-auditor`, `security-scan`, `threat-model`, `privacy-review`, `open-source-release-audit`, `plugin-vetter`, `agent-config-audit`, `mcp-server-audit`.
- `data-meta`: `db-schema-design`, `postgres`, `mysql`, `redis`, `dba`.
- `api-meta`: `api-rest-design`, `api-graphql`, `api-grpc`, `api-idempotency`, `api-webhooks`, `api-keys`, `api-oauth-provider`, `app-auth`.
- `observability-meta`: `observability-instrumentation`, `promql`, `grafana-dashboards`, `sentry-sdk`, `postmortem`, `rollout-plan`.

**Intentional orphans** (fine, but document them in the README)
- Mods enabled by the settings example: `agent-status`, `cache-clock`, `turn-stats`, `usage-log`.
- Instance-bound MCP and docs hooks: `atlassian-*`, `outline-*`, `sentry-mcp-self-hosted`.
- `aws-knowledge` (conflicts with `aws-mcp`).
- `coder-max`.
- Branching-model skills: `git-flow`, `hubflow`, `trunk-based`.

**Redundant listings** (see Summary)
- `ship`/`shipper`, `forgejo-ship`/`forgejo-shipper`, `browser-tester`/`playwright-cli`, `architect`/`readonly-agent-gate`.
- No meta re-lists a member of a bundle it already includes (checked).

**Meta-level eval suites to add** (model on `evals/godot-meta`)
- `evals/web-meta`: `react` vs `web-development` ("hydration mismatch"), `web-design` vs `ui-direction` ("make this page feel less generic"), `browser-tester` agent vs `playwright-cli` skill vs `e2e-testing` ("check the flow works" / "scrape this page" / "write a spec"), `web-perf-auditor` vs `react` ("re-renders on every keystroke"), `accessibility-review` vs `screen-reader-testing`.
- `evals/dotnet-meta` (after adding the skills): `csharp` vs `aspnet-core` ("add a minimal API endpoint"), `ef-core` vs `aspnet-core` (the existing `aspnet-core-vs-ef-query` idea, at the set level), `dotnet-testing` vs `unit-testing`, `msbuild` vs `nuget` ("central package management").
- `evals/design-meta`: `design-critique` vs the `ui-critic` agent vs `accessibility-review` vs `ux-copy` vs `design-system` vs `design-handoff` vs `uiux-lookup`. These nine descriptions overlap heavily.
- `evals/iac-meta`: `terraform` vs the `devops` agent ("review this module" vs "add RDS and show me the plan"), `docker` vs `bash` (entrypoint script), `cloud-ops-guard` blocking `terraform plan` without the `ALLOW: cloud-ops` line (outcome with a regex on trace).
- `evals/aws-meta`: `aws-cli` vs `aws-resource-query` vs `aws-cloudwatch` vs `aws-well-architected` ("list my untagged EC2" / "why did the Lambda error spike" / "review this account against WA"), plus `run_script` vs CLI first.
- `evals/baseline`: the abstractly named skills `prove`, `cold-read`, `macrothink`, `prism`, `v0-rewrite`, `v0-restart`, `necromancy`, `debloat`, `reorder`, `ssot-consolidate` are the highest collision risk in the repo and load in every session. Give each a positive and one near-miss against its nearest sibling.
- `evals/programming-core`: `coding` vs `problem-solving` vs `planning`, `unit-testing` vs `test-run`, `leakage-audit` vs `unit-testing` ("my eval split leaks").
- `evals/python-meta`: `python-packaging` vs `dependency-vetting` vs `python` ("should we add httpx?" / "publish to PyPI" / "type error").

## Cross-group notes

- `evals/godot-meta` case `plugins:` lists omit `feature-flags` and `leakage-audit`, two skill plugins in `programming-core` (e.g. `evals/godot-meta/evals/testing-gut/prompt.md`). That breaks its own "keep in step" rule.
- `docs/plans/plugin-adoption.md:180` still says "Every subagent sets `autoCompactWindow`", which contradicts CLAUDE.md and the current agent files. `:90` also says coder has a "300k window". The doc is stale.
- README Agents blurb (generated in `scripts/plugins.py` catalog): "readonly-agent-gate limits architect, reviewer and debugger" is out of date. The gate also covers security-auditor and open-source-release-audit, and should cover web-perf-auditor.
- The `agent_spawn_errors` check (`scripts/plugins.py:226-`) is good. A sibling check that every agent's `skills:` entry resolves to a declared dependency, or to a plugin in every meta that ships the agent, would have caught the coder, debugger, architect and dba gaps. So would a check that no subagent omits `tools` while living in a session with write-capable MCP servers.
- The `design` plugin from claude-plugins-official ships an `atlassian` MCP server that collides with `atlassian-mcp`. Several orphan overlaps also exist outside this group: `design-critique` and `accessibility-review` vs `design:design-critique` and `design:accessibility-review` from the same official plugin. Groups that review those skills should add hard negatives against the `design:*` names.
