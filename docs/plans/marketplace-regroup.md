# Marketplace regroup

Status: decisions taken 2026-10-13, all recommended options (Q1 bare names, Q2 four-skill coding-core, Q3-A Sentry stays in sentry-core, Q4 meta-plugin with 11 members, Q5 split github and infra). Not started; S0 is next. Written by the crew architect, critiqued by codex.

## Summary

- **baseline**: new meta-plugin, no skills. `plugin.json` holds only `dependencies`: coremods, crew, coding-core, review, research, testing, code-search, git, github, authoring, setup. Replaces `REQUIRED` in `install.sh`. The third-party `avoid-ai-writing` stays in `install.sh`.
- **coding-core** (was efficient-core): coding, planning, problem-solving, implement-plan.
- **review** (new): second-opinion, review-loop, anti-slop, poka-yoke. **research** (new): research plus the Exa MCP server.
- **prototype**, **experiment-loop**, **modernize**: new single-skill plugins, opt-in, not in baseline.
- **Renames**: efficient-testing/-security/-db/-auth/-web → testing, security, db, auth, web (Q1). efficient-<lang> → coding-<lang>, including coding-esp.
- **sentry → sentry-core**. Recommended: platform references stay in sentry-core (Q3). The move into coding-<lang> is planned as option B.
- **infra** keeps its name, the ops guard, terraform and ansible. New **deploy**: docker, kubernetes, helm, gitops, rollout, production-readiness. New **homelab**: homelab-network.
- **github** keeps the issue and PR flow, the MCP server and the shipper agent. New **github-admin**: actions, code-security, dependabot, dependabot-prs, repo-setup.
- **Unchanged**: api (webhooks hard-loads `api:keys`), authoring, observability, mcp, aws, tooling, the single-tool plugins. `example` stays the uncatalogued template.
- Catalog grows from 34 to 43 plugins. Baseline listing drops from about 24.2k to 19.9k description characters (about 1.1k tokens per session).
- Migration: the marketplace `renames` map handles every 1:1 rename. Split-off pieces arrive through baseline or explicit installs. No deprecated stubs.

## 1. Goal and done-when

Goal: one `baseline` install gives the default set. coding-core holds only core programming skills. Extras sit in small plugins you can toggle per project. Every current skill lands somewhere.

Done when:

- `claude plugin validate --strict .` and `--strict plugins/<p>` pass for every new or changed plugin.
- The stale-reference checks in §6 return nothing, for the repo and the settings files.
- `python3 scripts/agent-tools.py`, `bash plugins/crew/scripts/tests/check.sh`, `bash scripts/install.test.sh`, and every moved suite (run from its new path, S5) pass.
- After cutover, `claude plugin list --json` shows no `efficient-*` ids, no `sentry@adminhead`, and no `errors` field.
- In a fresh session, each crew agent quotes the H1 of every skill it preloads, architect makes one Exa call, and browser-tester sees the Playwright tools with its unsafe tool denied.
- `consult.sh`, `/testing:run` and `/security:audit` run without a permission prompt.

## 2. Verified facts

| Fact | Source |
|---|---|
| A plugin with only `name` and `dependencies` is a valid bundle; installing it installs the dependencies at the same scope | code.claude.com/docs/en/plugins/dependencies.md ("Bundle plugins for a team"), fetched 2026-10-13 |
| Enable also enables dependencies. Disable is refused while a dependent is enabled, and the refusal prints a chained command that disables both. Uninstall keeps auto-installed dependencies until `claude plugin prune` | plugins/install.md, "Plugins with dependencies" |
| `prune` removes only auto-installed orphans, never hand installs | plugins/cli-reference.md, "plugin prune" |
| A cross-marketplace dependency that isn't allowlisted installs, but the plugin then fails to load | dependencies.md |
| An added dependency takes effect on `plugin update` or `/reload-plugins` | dependencies.md |
| Marketplace `renames` (2.1.193+) maps old → new or `null` and rewrites `enabledPlugins` and `pluginConfigs` in user, project and local settings at startup. It is 1:1 and append-only; `validate` rejects cycles; remote sources can hit `plugin-cache-miss` | plugin-marketplaces docs, "Rename or remove a plugin" |
| MCP tool names embed the plugin name (`mcp__plugin_<plugin>_<server>`) | `plugins/crew/agents/*.md`, `scripts/agent-tools.py:43-54` |
| Crew preloads `efficient-core:{coding,planning,problem-solving,second-opinion}`; a missing preload is skipped silently. Four agents grant `mcp__plugin_efficient-core_exa`; browser-tester uses `mcp__plugin_efficient-web_playwright` | `plugins/crew/agents/*.md:6-9` |
| `agent-tools.py` doesn't check that preloads resolve | `rg skills scripts/agent-tools.py` is empty |
| Hard loads: modernize runs planning's closing review; implement-plan uses review-loop; webhooks follows `api:keys` | `modernize/SKILL.md:47`, `implement-plan/SKILL.md:21`, `webhooks/SKILL.md:40` |
| The user settings allow rule for consult.sh pins plugin name and version (`.../cache/adminhead/efficient-core/0.4.2/skills/second-opinion/scripts/consult.sh *`) | `~/.claude/settings.json:25` |
| The live marketplace is this checkout, so a commit on main goes live at `/reload-plugins`. Work happens on a branch | `docs/plans/marketplace-native-config.md:19` |
| `~/.claude/{agents,hooks,prompts}` are dangling symlinks; targets and `.adminhead-frozen` are gone | `ls` |

Assumptions: one user, one machine, Claude Code 2.1.296+. `coding-esp` is the name for efficient-esp. Evals still can't span plugins (efficient-split Finding 5).

## 3. Target layout

### 3.1 Plugins

B marks baseline members (user scope). The rest are per-project or opt-in.

| Plugin | Contents | From | Deps | Version |
|---|---|---|---|---|
| **baseline** B | no skills; dependencies on the 11 members | new | plugin.json deps | 0.1.0 |
| **coding-core** B | coding, planning, problem-solving, implement-plan | efficient-core | — | 0.4.2 → 0.5.0 |
| **review** B | second-opinion (with scripts and tests), review-loop, anti-slop, poka-yoke | efficient-core | — | 0.1.0 |
| **research** B | research; Exa `.mcp.json` | efficient-core | — | 0.1.0 |
| **testing** B | unit, e2e, run, harness, gap-audit | efficient-testing | — | 0.1.1 → 0.2.0 |
| **github** B | issues, issue-breakdown, triage, pr, pr-comments, ship, release; GitHub MCP, shipper agent, `scripts/` | github | — | 0.6.0 → 0.7.0 |
| coremods, crew, code-search, git, authoring, setup B | unchanged contents | same | — | patch bump if touched |
| **github-admin** | actions, code-security, dependabot, dependabot-prs, repo-setup (a script moves only if all its referrers move) | github | — | 0.1.0 |
| **prototype** | prototype | efficient-core | — | 0.1.0 |
| **experiment-loop** | experiment-loop | efficient-core | — | 0.1.0 |
| **modernize** | modernize (hard-loads `coding-core:planning`, a baseline member) | efficient-core | — | 0.1.0 |
| **coding-go / -python / -js / -rust / -shell** | unchanged skill sets | efficient-<lang> | marketplace-entry LSP deps | 0.1.1 → 0.2.0 |
| **coding-esp** | firmware-engineer | efficient-esp | — | 0.1.0 → 0.2.0 |
| **web** | web-development, web-design; Playwright MCP | efficient-web | — | 0.2.1 → 0.3.0 |
| **auth** | auth, better-auth | efficient-auth | — | 0.1.0 → 0.2.0 |
| **db** | database-design, postgres, mysql, redis | efficient-db | — | 0.1.0 → 0.2.0 |
| **security** | audit, privacy-review, threat-model | efficient-security | — | 0.1.0 → 0.2.0 |
| **sentry-core** | sentry (all references under Q3-A; see §4.4 for Q3-B) | sentry | — | 0.2.0 → 0.3.0 |
| **infra** | terraform, ansible; cloud-ops guard hook with `scripts/{shell,vendor,tests}` | infra | — | 0.5.0 → 0.6.0 |
| **deploy** | docker, kubernetes, helm, gitops, rollout, production-readiness | infra | — | 0.1.0 |
| **homelab** | homelab-network | infra | — | 0.1.0 |
| api | unchanged (8 skills) | api | — | patch |
| sentry-mcp, sentry-mcp-self-hosted, observability, mcp, aws, tooling, accessibility, playwright-cli, termwright, devenv, chezmoi, pass-cli | unchanged | same | — | patch if touched |
| example | hello; uncatalogued template | same | — | — |

Version rule: a renamed plugin continues its version with a minor bump. A new plugin starts at 0.1.0. Any other plugin with a changed file gets a patch bump in `plugin.json` and the marketplace entry together.

`renames` adds efficient-core → coding-core; efficient-{testing,security,db,auth,web} → {testing,security,db,auth,web}; efficient-{go,python,js,rust,shell,esp} → coding-{same}; sentry → sentry-core. `ripgrep → code-search` stays.

### 3.2 Evals

Each eval case moves with its positive skill. These negatives become cross-plugin and can no longer fail, so record them as lost coverage:

- `experiment-loop-vs-problem-solving`
- `prototype-vs-planning`
- `trigger-research-1`
- `infra/trigger-terraform-1` and `-2` (they negate kubernetes)

These pairs stay live: `implement-plan-routing`, `review-loop-routing`, `production-readiness-vs-rollout` (in deploy), `dependabot-prs-routing` (in github-admin), and every testing, authoring and db pair.

Gitignored `evals/results/` don't move with `git mv`. Archive them to `~/.claude/skills.migrated/_eval-results/<old>/`, as efficient-split did.

### 3.3 Capability map

| Old capability | New home | Migration action |
|---|---|---|
| coding, planning, problem-solving, implement-plan | coding-core | `renames` |
| second-opinion, review-loop, anti-slop, poka-yoke | review | via baseline |
| research and Exa | research | via baseline |
| prototype, experiment-loop, modernize | own plugins | dropped from defaults on purpose; install at user scope if wanted |
| efficient-<x> plugins | renamed | `renames`, every scope |
| infra docker and k8s skills | deploy | install wherever `infra` is enabled |
| infra homelab-network | homelab | install where used (ask) |
| infra terraform, ansible, guard | infra | unchanged, so the guard isn't lost |
| github admin skills | github-admin | install at user scope |
| sentry | sentry-core | `renames` |

## 4. Design decisions

### 4.1 Baseline as a meta-plugin (recommended)

"Defaults we want" means three things: what `install.sh REQUIRED` installs today under the new names; what crew preloads or grants tools from (coding-core, review, research); and what every session uses (code-search, git, github, authoring with its docs-sync hook, coremods, setup).

| Aspect | Meta-plugin (recommended) | Content baseline | `install.sh` preset (today) |
|---|---|---|---|
| Context cost | none of its own | same skills, no per-piece toggles | same |
| Install | one command anywhere | one | clone plus script |
| Add a default | add a dependency, then `/reload-plugins` | edit the plugin | rerun the script |
| Drop a default | remove the dependency; `prune` removes it if baseline installed it | edit | manual uninstall |
| Disable one member | refused while baseline is enabled; disable baseline first | impossible | free |
| Evals | no skills, so no `dependency-unsatisfied` | — | — |

This revisits a settled decision on purpose. `marketplace-native-config.md:85` rejected `dependencies` because declaring them on crew would make disabling coremods fail. That decision applied to a content plugin. For baseline, the enforced group is the point. The cost is the disable refusal, documented with the workaround (disable baseline, then the member). efficient-split's eval objection doesn't apply, because baseline has no skills.

A content baseline loses because it can't toggle pieces, it mixes unrelated concerns, and it would rename every skill to `baseline:*`.

### 4.2 coding-core cut line (Q2)

| Skill | Verdict | Reason |
|---|---|---|
| coding, planning, problem-solving | in | crew preloads them; every coding session uses them |
| implement-plan | in | executes planning's output; keeps `implement-plan-routing` live |
| second-opinion | → review | review tooling; the preload still resolves through baseline; keeping it here would make `review-loop-routing` vacuous |
| review-loop, anti-slop, poka-yoke | → review | the review and quality cluster |
| research | → research | Exa goes with it; crew grants become `mcp__plugin_research_exa` |
| prototype, experiment-loop, modernize | → own plugins | occasional workflows; prototype also covers backend state models (`prototype/SKILL.md:12`), so web isn't its home |

### 4.3 Splitting rule

1. Split along a seam only if the two sides install in different sets of projects and the smaller side lists at least about 1,000 description characters.
2. A hard load ("load X and follow it") may target only the same plugin or a baseline member. Script and hook coupling never crosses a seam. A routing eval pair that crosses is a recorded cost.
3. Move a skill to the plugin that holds its real routing competitor, unless rule 2 forbids it.
4. Single-skill plugins are fine for a disjoint domain or tool. When the user directs a skill out and no cohesive home exists, it gets its own plugin.
5. Stop splitting when the sides share an install set or the seam has dense cross-references.

| Plugin | Verdict | Why |
|---|---|---|
| efficient-core | split (user-directed) | rule 4; hard loads go to baseline members |
| efficient-testing | rename | harness hard-loads unit and the run script; 5 live pairs |
| efficient-security | rename | 1.4k characters; privacy-review/threat-model pair |
| efficient-db | rename | live mysql/postgres and redis/postgres pairs |
| efficient-auth, efficient-web | rename | 2 skills each |
| api | unchanged | webhooks:40 hard-loads `api:keys`; keys/oauth-provider cited 14 times inside api; graphql and grpc each under 1,000 characters |
| infra | split 3 ways | disjoint projects; deploy cluster stays together; infra keeps the guard |
| github | split | admin side has 2,466 characters; only `release`/`ship` → actions cross; no eval pair crosses |
| authoring | unchanged | both halves are in baseline, so splitting saves nothing |
| observability, mcp, aws, tooling | unchanged | cohesive, small |

### 4.4 Sentry (Q3)

**Q3-A (recommended): rename to sentry-core and keep every platform reference in it.**

- References cost nothing until read, so moving them saves no context.
- Topic references carry per-SDK tables (`metrics.md:28-52`), so sentry-core can't become language-neutral without splitting those too.
- `javascript.md:56` links `../crons.md`, which a move would break.
- The only change is grader `fires-sentry.md`: `sentry:sentry` → `sentry-core:sentry`.

**Q3-B (the original ask): per-language skills.**

- New skills `coding-go:sentry`, `coding-python:sentry`, `coding-js:sentry`, `coding-rust:sentry`, each self-contained, built from `platforms/{go,python,javascript}.md` and the Rust section of `other.md`. The `../crons.md` link becomes "`sentry-core:sentry` references/crons.md, if installed".
- jvm-android, apple, flutter and the rest of `other.md` stay in sentry-core; no coding-<lang> plugin exists for them.
- Pointers run one way. sentry-core's Platforms table says "Go: invoke `coding-go:sentry`, if installed. Otherwise use Context7 `/getsentry/sentry-go` and docs.sentry.io, and tell the user the platform pitfalls weren't checked."
- Without sentry-core, each language skill opens: "The cross-SDK rules (init once, one owner per signal, telemetry never changes behavior, bounded data, DSN vs auth token, confirm remote side effects) live in `sentry-core:sentry`. If it isn't installed, tell the user and continue only with their go-ahead."
- Cost: about 400 listing characters in every session with the language plugin, Sentry or not.
- The `profile-changes-output` eval (Python/Flask) loses the Python notes in its sandbox. Its graders check profile behavior, so the risk is low, but record it.

## 5. Rejected alternatives

| Alternative | Why it lost |
|---|---|
| Content baseline | §4.1 |
| `install.sh` preset only | you asked for a plugin; it can't push a new default through `/reload-plugins`. Fallback if S0 fails |
| `plugin.json` deps from crew to skill plugins | eval sandbox fails with `dependency-unsatisfied` (efficient-split Finding 1) |
| Deprecated stubs under old names | `renames` does the migration; duplicate skills compete in routing |
| `coding-*` prefix for domain plugins | domain plugins already use bare names; `coding-web` reads like a language |
| Move keys/oauth-provider to auth | webhooks hard load (rule 2) |
| prototype in web | also serves backend state models |
| Split authoring | both halves in baseline |
| Split db per engine | kills two live pairs; under the threshold |

## 6. Blast radius

Files to touch:

- every `SKILL.md`, `references/*.md`, grader and description naming a moved skill (by old prefix: efficient-core 137, efficient-testing 90, infra 112, github 152, efficient-js 69, efficient-db 57, and others)
- `plugins/crew/agents/*.md`: preloads; `tools:` `efficient-core_exa` → `research_exa`, `efficient-web_playwright` → `web_playwright`; browser-tester's `efficient-testing:e2e`; devops.md:13's `infra:*` route widens to `infra:*`, `deploy:*`, `homelab:*`, `github-admin:actions`
- `plugins/crew/docs/writing-agents.md`
- `scripts/agent-tools.py:43-54` (`MCP_SERVERS`, `WRITE_SERVER_GRANTS`), `scripts/agent-tools.test.sh:14-15,106,126`
- `scripts/install.sh:16`, `scripts/install.test.sh:30`
- `plugins/setup/skills/recommend-plugins/SKILL.md:30-54` (markers, LSP repair text, new markers for deploy, homelab, github-admin)
- `docs/plugins/efficient.md` → `docs/plugins/coding.md`; new pages for baseline, review, research, testing, security, db, auth, web, deploy, homelab, prototype, experiment-loop, modernize; github.md covers github-admin; sentry.md stays the sentry-* family page
- `docs/plugins/{crew,setup,code-search,api,playwright-cli,infra}.md`, `README.md`, `CLAUDE.md:8`
- `.claude/skills/ship-plugin/SKILL.md` only if step 2 can't resolve family pages

Repo proof (both must print nothing):

```sh
rg -n --hidden -g '!.git' -g '!docs/plans/**' -g '!docs/research/**' -g '!**/evals/results/**' -g '!**/node_modules/**' -g '!.claude-plugin/marketplace.json' \
  -e '\befficient-(core|testing|security|db|auth|web|go|js|python|rust|shell|esp)\b' -e 'plugin_efficient-' \
  -e '\bsentry(:sentry|@adminhead)\b' -e 'plugins/efficient' \
  -e 'infra:(docker|kubernetes|helm|gitops|rollout|production-readiness|homelab-network)\b' \
  -e 'github:(actions|code-security|dependabot|dependabot-prs|repo-setup)\b' \
  -e 'coding-core:(second-opinion|review-loop|anti-slop|poka-yoke|research|prototype|experiment-loop|modernize)\b' \
  .
jq -r '.plugins[].name' .claude-plugin/marketplace.json | rg '^(efficient-|sentry$)'
```

`renames` rewrites only `enabledPlugins`, never permission rules or tool lists, so settings get their own check:

```sh
rg -n -e '(efficient-[a-z]+|"sentry)@adminhead' -e 'plugin_efficient-' -e 'adminhead/efficient-' ~/.claude/settings.json ~/.claude/settings.local.json
rg -n --hidden -g '**/.claude/settings*.json' -e '(efficient-[a-z]+|"sentry)@adminhead' ~/Projects
```

`docs/plans` and `docs/research` keep old names as records.

## 7. Migration

What breaks without action:

- crew preloads of `review:*` until review is installed (silent)
- Exa and Playwright in agent tool lists
- the consult.sh allow rule (starts prompting)
- infra users' docker and k8s skills
- github-admin skills
- the three dropped process skills

Cutover (S6) runs as one sequence with no other Claude sessions open (`pgrep -af claude`).

1. Inventory: `rg -l --hidden -g '**/.claude/settings*.json' '@adminhead' ~/Projects`, then `claude plugin list --json` from each directory. Record scope, project, id.
2. Back up `~/.claude/settings.json`, each project's `.claude/settings*.json`, and a copy of `installed_plugins.json` to `~/.claude/skills.migrated/_regroup/`.
3. `git merge --ff-only regroup`, then `claude plugin marketplace update adminhead`.
4. Trigger renames by the method S0 proved, then immediately `claude plugin install baseline@adminhead --scope user`, before any working session.
5. Per §3.3: install deploy wherever infra is enabled, homelab where used, github-admin at user scope. Ask about prototype, experiment-loop, modernize.
6. Replace the consult.sh allow rule with the path S0 captured, then `chezmoi re-add ~/.claude/settings.json`.
7. Fresh session, `/reload-plugins`, then the S5 probes and both §6 proofs.

## 8. Slices

All work happens on branch `regroup` in a worktree under `.claude/worktrees/`. Main stays untouched until S6.

| # | Slice | Files | Depends on | Acceptance | Check | Agent |
|---|---|---|---|---|---|---|
| S0 | Probe and rehearse in scratch `CLAUDE_CONFIG_DIR` with a toy directory marketplace | /tmp only | — | H1 `renames` on a directory source rewrites user and local keys, shows CLI vs session-start trigger, no cache miss. H2 deps-only plugin passes `validate --strict`. H3 disable-refusal text and project-scope `false` on a user-scope member. H4 `/reload-plugins` installs an added dep; prune after a dep is dropped; hand installs untouched. H5 a renamed plugin keeps its LSP dep. H6 the literal consult.sh path in a fresh session. H7 forward and rollback rehearsed. No-go: H1 fails → efficient-split's uninstall-before-merge cutover; H2 fails → stop and ask | probe log with raw output | coder-high |
| S1 | Structure: `git mv` per §3.1; new `plugin.json`s; marketplace entries, `renames`, versions; evals move with their positive skill; archive results | `plugins/**`, marketplace.json | S0 | skill counts match §3.1; `git diff -M --stat` shows renames | `claude plugin validate --strict .` and per plugin | coder |
| S2a | Rename references outside crew; "if installed" only for per-project targets; list every imperative reference and confirm it targets the same plugin or a baseline member | `plugins/**` minus crew | S1 | §6 repo proof empty; every grader `plugin:skill` resolves; descriptions ≤1024 chars | §6 `rg` plus a one-off resolver | coder |
| S2b | Sentry per Q3 (A: grader only; B: §4.4) | `plugins/sentry-core/**`, `plugins/coding-*/skills/sentry` | S1 | B: all relative links resolve; no-sentry-core behavior written into each skill | link resolver | coder-high |
| S3 | Crew, scripts, setup: preloads, tool names, devops route; new agent-tools rule that each adminhead `skills:` entry resolves to a `SKILL.md`, with a negative fixture; `install.sh` installs baseline and verifies each member from its `plugin.json`, with fixtures for missing, disabled, wrong-scope and partial-failure; setup markers | `plugins/crew/**`, `scripts/agent-tools*`, `scripts/install*`, `plugins/setup/**` | S1 (parallel with S2) | all checks green, including new rules | agent-tools, crew check.sh, install.test.sh | coder-high |
| S4 | Docs: pages, README rows, CLAUDE.md layout line, crew/setup/code-search docs | `docs/plugins/**`, README.md, CLAUDE.md | S1 (parallel) | every catalog plugin has a README row and a page naming each skill | one-off records-agree script plus §6 `rg` | scribe |
| S5 | Branch verification: moved suites from new paths; `claude --plugin-dir` probes for preload H1s, an Exa call, Playwright visible with the unsafe tool denied, no-sentry-core behavior; paid eval smoke on moved cases (`--runs 1`, under $3, only with approval); `review` on the full diff | — | S2–S4 | all green; no `plugin_errors`; lost negatives recorded | as listed | orchestrator + review |
| S6 | Cutover (§7), with user authorization | settings, installs | S5 | §1 post-cutover conditions | §6 settings proof; fresh-session probes | devops |
| S7 | Record `claude plugin details` per member, `/context` Skills row, plan progress, next-day `/skill-doctor` | this file | S6 | measurements recorded | — | scribe |

## 9. Risks and rollback

| Risk | Mitigation |
|---|---|
| Preloads skipped silently between renames and the baseline install | drained sessions; baseline installed first; preload-resolution rule; H1 probes |
| `renames` misbehaves on a directory source | S0 H1; efficient-split cutover as fallback |
| Lost IaC guard | infra keeps it |
| consult.sh prompts | S0 H6 captures the real path |
| Routing drift | S5 smoke; `--runs 3` on any flipped case |
| A member disabled in a project is refused | documented in baseline.md |

Rollback:

- Before merge: remove the worktree and branch.
- After merge, before push: uninstall the introduced plugins (baseline, review, research, deploy, homelab, github-admin, prototype, experiment-loop, modernize) at their recorded scopes while the new catalog is still on main; `git reset --keep <pre-SHA>`; restore the settings backups (a reverse `renames` would form a cycle); `marketplace update`; reinstall originals per the inventory; restore the allow rule; `chezmoi re-add`; restart.
- After push: `git revert` in place of the reset.

S0 H7 rehearses this.

## 10. Critique log

| # | Point | Verdict |
|---|---|---|
| 1 | Cutover starts a session before the dependency set is complete | adopted: drained sessions; baseline installed right after renames |
| 2 | Frozen user agents keep old names | rejected: `~/.claude/{agents,hooks,prompts}` are dangling and `.adminhead-frozen` is gone |
| 3 | Rollback doesn't restore install state | adopted: uninstall introduced plugins, reinstall per inventory; rehearsed in S0 |
| 4 | Permission probe may target the wrong path | adopted: S0 H6 captures the literal path |
| 5 | Baseline turns defaults into an enforced group | partly adopted: trade-off documented, Q4 asks |
| 6 | Seams cross hard loads | adopted: rule 2; keys and oauth-provider stay in api; imperative-reference list in S2a |
| 7 | Sentry move adds coupling and saves no listing | adopted as the Q3 recommendation |
| 8 | Sentry move breaks `../crons.md`; topic references carry per-SDK rows | adopted: link resolver; topic references stay central |
| 9 | No capability-to-install map | adopted: §3.3 |
| 10 | devops routes by `infra:*` | adopted: route widened in S3 |
| 11 | Collapsing `REQUIRED` weakens install verification | adopted: member verification plus 4 fixtures |
| 12 | Verification skips moved suites, MCP grants, unsafe-tool denial | adopted: S5 |
| 13 | Evals can't check multi-plugin paths | adopted: lost coverage recorded; `--plugin-dir` probes |
| 14 | experiment-loop and modernize fall under the threshold; prototype isn't web | partly adopted: rule 4 covers user-directed extraction |

Second opinions: codex gpt-6-astra/xhigh produced the 14 points above, each checked against cited files. agy was not run (the script refused `--effort` for the Gemini Pro model).

## 11. Open questions

- **Q1. Names for the efficient-* domain plugins.** (a) bare: testing, security, db, auth, web (recommended); (b) `coding-` prefix; (c) keep efficient-*.
- **Q2. coding-core cut line.** (a) coding, planning, problem-solving, implement-plan; second-opinion in review (recommended); (b) (a) plus second-opinion; (c) only coding, planning, problem-solving.
- **Q3. Language-specific Sentry guidance.** (A) keep in sentry-core, rename only (recommended); (B) move go, python, js, rust into `coding-<lang>:sentry` (§4.4).
- **Q4. Baseline kind.** (a) meta-plugin with the 11 members; prototype, experiment-loop, modernize opt-in (recommended); (b) same plus those three; (c) no plugin, keep the `install.sh` preset.
- **Q5. Optional splits.** (a) github → github + github-admin and infra → infra + deploy + homelab (recommended); (b) infra only; (c) neither.

Unconfirmed until S0: H1–H7, including whether `validate --strict` accepts a componentless plugin and whether directory-source renames avoid `plugin-cache-miss`. Mid-path wildcards in permission rules are also unconfirmed.
