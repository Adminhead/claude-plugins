# MCP servers for adminhead plugins

Status: plan, 2026-10-03. Claude Code 2.1.288. Not implemented. Decisions D1–D10 settled 2026-10-03 (see Settled decisions).

## Goal

Ship six MCP servers through the marketplace, keeping each skill's routing boundary clear.

| # | Server | Target plugin |
| --- | --- | --- |
| 1 | Context7 (remote) | `code-search` |
| 2 | CodeGraph (stdio) plus auto-init | `code-search` |
| 3 | Playwright MCP (stdio) | `efficient-web` |
| 4 | AWS MCP Server | `aws` |
| 5 | Sentry remote plus Sentry stdio (self-hosted), off by default | two new companion plugins (D1) |
| 6 | Exa (remote, `alwaysLoad`) | `efficient-core` |

## Definition of done

- `claude plugin validate --strict` passes for every touched plugin and for the marketplace (`.`).
- Every touched plugin's `plugin.json` version equals its marketplace entry.
- A `claude -p --plugin-dir` smoke run lists each new server's tools as `mcp__plugin_<plugin>_<server>__*`. Deferred names count.
- New skills and changed descriptions have routing evals wherever two skills in one plugin share a boundary.
- `docs/plugins/*.md` and `README.md` give each server's endpoint, auth, tools, dedup behavior, and limits.
- The auto-init script has offline tests, and they pass.
- After rollout, `claude mcp list` shows each server once on this machine.

## Verified facts (probes on 2.1.288)

Probes used throwaway plugins with `claude -p --plugin-dir`, local listeners, and curl. All secrets were dummies; probes logged lengths only.

| Fact | Evidence |
| --- | --- |
| Plugin `.mcp.json` has no per-server off switch. `"disabled": true` is ignored and the server starts | Probe server `off` started |
| `validate --strict` accepts unknown per-server keys | `notAField` passed |
| Only two switches turn a server off: `defaultEnabled: false` on a whole plugin (2.1.154+), or the per-project `/mcp` toggle (`disabledMcpServers` in `~/.claude.json`) | Plugin manifest reference; changelog |
| Stdio dedup compares command and args. A plugin server identical to a higher-scope server is skipped silently | Plugin `dup` vs `--mcp-config` `dupcfg` |
| Precedence runs local > project > user > plugin > claude.ai connector. Plugins and connectors are matched by endpoint; a different query string makes a different endpoint | MCP docs |
| Only a fixed list of credential variables reads as empty in a remote `url` or `headers`. `${NPM_TOKEN}` and `${ANTHROPIC_AUTH_TOKEN}` were emptied; `${SENTRY_ACCESS_TOKEN}`, `${CONTEXT7_API_KEY}`, `${PROBE_API_KEY}` expanded | Loopback and LAN listener probes |
| `${VAR}`, `${VAR:-default}`, and `${user_config.KEY}` all expand in stdio `env` | Probe `expand` |
| Plugin stdio servers inherit the full user environment, including credential-like variables | Probe `inherit` |
| `alwaysLoad: true` on a plugin server loads its tools in full; without it, tools are deferred | Probe `loaded` vs `lazy` |
| Server-level `alwaysLoad: false` defers even a tool whose `_meta` says `anthropic/alwaysLoad: true`. With no server setting, that tool loads | Probe `forcedoff` vs `unset` |
| A manifest `hooks` path loads alongside the TS-module `hooks/hooks.json`. An `async` exec-form `SessionStart` hook fires in `-p` mode with `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` set | Scratch copy of code-search |
| Context7's bare `https://mcp.context7.com/mcp` answers anonymously (200). `?client=claude-code-plugin` returns 401 with no header and 200 with `Bearer ` | curl |
| Exa's `https://mcp.exa.ai/mcp` returns 401 to anonymous clients and advertises OAuth resource metadata | curl |
| AWS MCP answers `initialize`, `tools/list`, and knowledge tools anonymously: 8 tools (12.8 KB). `aws___run_script` returns 401 unauthenticated and self-marks `alwaysLoad`, `readOnlyHint: false`, `destructiveHint: true`. The server's instructions say to prefer its tools and not use the Bash tool for the AWS CLI. AWS Sign-in supports DCR and S256 PKCE | curl |
| With the direct AWS URL and current `aws` skills, Sonnet skipped `aws:resource-query` and called `aws___run_script` with `GetCallerIdentity` and an unprojected `ListFunctions` (Lambda env vars can hold secrets) | `-p` smoke, tools denied before execution |
| `uvx mcp-proxy-for-aws-cli@1.7.0 <url> --read-only --skip-auth` with no credentials exposes 6 tools (no `run_script` or `get_presigned_url`) | Direct stdio session |
| Sentry remote returns 401 with resource metadata; DCR at `/oauth/register`; `scopes_supported` is `org:read project:write team:write event:write alerts:write` | curl |
| npm: `@playwright/mcp` 0.0.83 (Node ≥18), `@sentry/mcp-server` 0.42.0 (Node ≥22.13), `@nanonets/graft` 0.21.1 (Node ≥20). PyPI `mcp-proxy-for-aws-cli` 1.7.0. Local Node 24.21 | `npm view`, PyPI |
| Playwright MCP runs headed by default with a persistent per-workspace profile (one browser at a time) | Package README |
| Local codegraph is 1.6.1 (upstream v1.6.2 on 2026-10-03). The user-level server sets `alwaysLoad: true`; `~/.claude/settings.json` allows `mcp__codegraph__*`. `codegraph init` writes a self-ignoring `.codegraph/` | CLI, config reads |

## Assumptions

- Each slice runs in its own worktree. Only slice F touches `.claude-plugin/marketplace.json` and `README.md`.
- No plugin gets a `dependencies` field. Cross-plugin references say "if installed".
- `claude plugin eval` does not start unmocked plugin MCP servers. Every eval here grades the `Skill` call.
- The repo is the live directory marketplace.

## 1. Context7 → `code-search`

```json
"context7": {
  "type": "http",
  "url": "https://mcp.context7.com/mcp",
  "headers": { "Authorization": "Bearer ${CONTEXT7_API_KEY:-}" }
}
```

- The bare URL is the same endpoint as the "claude.ai Context7" connector. The plugin outranks connectors, so its copy connects and the connector is skipped.
- With no key, the header is `Bearer ` and the server answers anonymously (verified). A set key expands. Whether Context7 bills `Bearer <key>` is UNCONFIRMED.
- `context7@claude-plugins-official` uses `?client=claude-code-plugin`, a different endpoint, so it would run as a second copy (D5).

New skill `code-search:context7`:

- Description: "Look up current, version-specific documentation for a library, framework, SDK, or CLI with Context7's `resolve-library-id` and `query-docs` tools. Use when writing or fixing code against a specific library API, checking an option, config key, signature, or migration step, or when the installed version may be newer than training data. Not for real-world usage across public GitHub (`code-search:grep-app`), your own repo (`code-search:codegraph` or `code-search:ripgrep`), or broad cited research (`efficient-core:research`, if installed)."
- Body (~40 lines): read the installed version from the lockfile; prefer a versioned ID; skip resolve for a known ID; one focused topic per query; check results against the installed version; no secrets or private names in queries; if the plugin's tools are missing but another Context7 server is connected, use it the same way.

Other edits: `grep-app` routes library docs to `code-search:context7`; add a Context7 bullet to the always-on block.

Evals: `context7-vs-grep-app` (Pydantic 2.x field-validator docs question; fires context7, grep-app max 0) and `trigger-context7-1` (version-specific migration question).

## 2. CodeGraph → `code-search`

```json
"codegraph": {
  "type": "stdio",
  "command": "codegraph",
  "args": ["serve", "--mcp"],
  "alwaysLoad": true
}
```

- Same command as the user-level server, so the plugin's copy is skipped while that entry exists (verified). Removing the user-level entry is optional rollout step 2.
- Skills and the always-on block name the tool by its bare name, `codegraph_explore`, so either prefix works.
- `codegraph` must be on `PATH`. No `npx` fallback.

Always-on block (`hooks/register.ts`), static for prompt caching:

```
## Code Search Guidelines
- Always prefer the built-in `Grep` tool or explicit `rg` commands over traditional `grep`.
- Do not use `grep -r` or `find | xargs grep`; `rg` respects `.gitignore`, `.ignore`, and hidden-file rules by default.
- In a project with a `.codegraph/` index, call `codegraph_explore` (pass `projectPath`) before Grep or Read to locate or understand code. Use `rg` for literal text, non-code files, or when the index is missing or still building. Details: the `code-search:codegraph` skill.
- For flag details and output-bounding patterns, load the `code-search:ripgrep` skill.
- For current library, framework, SDK, or CLI docs, load the `code-search:context7` skill.
- For real-world usage of an API, library, config key, or error string across public GitHub code, load the `code-search:grep-app` skill.
```

New skill `code-search:codegraph`:

- Description: "Understand or locate code through CodeGraph's prebuilt symbol graph, where one `codegraph_explore` call returns the relevant symbols' source plus the call paths between them. Use when asked how something works, where a symbol is defined or called, what a change would affect, or before editing unfamiliar symbols in a repo with a `.codegraph/` index. Not for literal text, regex, config, or Markdown searches (`code-search:ripgrep`), public GitHub code (`code-search:grep-app`), or library docs (`code-search:context7`)."
- Body: query by symbol and file names; pass `projectPath`; treat returned source as read; read files named in the staleness banner directly; CLI fallback (`codegraph explore`, `node`, `status`); nested worktrees resolve to the parent's index.
- Claude never runs `init`, `index`, or `uninit` unless asked. The plugin's hook indexes.

Auto-init:

- `plugin.json` gets `"hooks": "./hooks/codegraph-autoinit.json"` and a `userConfig` option.
- New `hooks/codegraph-autoinit.json`, `scripts/codegraph-autoinit.sh`, `scripts/tests/check.sh`.

```json
{ "hooks": { "SessionStart": [ { "matcher": "startup", "hooks": [
  { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/codegraph-autoinit.sh", "args": [], "async": true } ] } ] } }
```

```json
"userConfig": { "codegraph_auto_init": { "type": "boolean", "title": "Index git repos with CodeGraph",
  "description": "At session start, run codegraph init in a git repo that has no .codegraph/ index.", "default": true } }
```

Script steps. Each skip exits 0 and logs one line to `${CLAUDE_PLUGIN_DATA}/codegraph-autoinit.log`.

1. Skip when `CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT` is `false`.
2. `cd "$CLAUDE_PLUGIN_DATA"` before resolving `codegraph`, so a repo's mise or direnv can't swap the binary. Skip if `codegraph` isn't on `PATH`.
3. `dir=${CLAUDE_PROJECT_DIR:-$PWD}`. Skip unless `git -C "$dir" rev-parse --show-toplevel` succeeds.
4. Skip linked worktrees (`--git-dir` ≠ `--git-common-dir`).
5. Skip when the top level is `$HOME` or `/`.
6. Skip when `.codegraph/` exists at the top level or any ancestor.
7. Skip when `git config --bool code-search.codegraph` is `false` (per-repo opt-out).
8. Skip when `git ls-files | wc -l` exceeds `${CODE_SEARCH_CODEGRAPH_MAX_FILES:-25000}`.
9. Add `/.codegraph/` to `$(git rev-parse --git-common-dir)/info/exclude` unless already ignored.
10. Run `nice codegraph init -y "$top"` from the neutral cwd and log its output.

Notes: `async: true` keeps the first response from waiting; until the index exists the always-on text sends Claude to `rg`. The hook fires in `-p` runs and eval sandboxes too; non-git dirs stop at step 3. codegraph telemetry is on (user's saved choice). Concurrent sessions: the second skips or hits codegraph's lock. Whether plugin hooks wait for the folder-trust dialog is UNCONFIRMED.

Offline tests (stub `codegraph`, temp git repos): fresh repo, existing index, ancestor index, option false, git-config opt-out, non-git dir, linked worktree, over the cap.

The user's `~/.claude/CLAUDE.md` says indexing is the user's decision, as do the server's instructions. Under this plan Claude still never indexes; the user's enabled plugin does, with opt-outs. The CLAUDE.md section then duplicates the always-on block and contradicts auto-init (D4).

Evals: `codegraph-vs-ripgrep` (request → DB call path and callers of `saveOrder`; fires codegraph, ripgrep max 0) and `ripgrep-vs-codegraph` (every file incl. hidden containing `TODO(security)`; fires ripgrep, codegraph max 0).

### Graft (trailhq/Graft) compared

| | CodeGraph | Graft |
| --- | --- | --- |
| Indexes | Tree-sitter symbol graph in SQLite | Tree-sitter structural graph as Markdown nodes plus `wiring.json`; optional LLM concept nodes (`graft build --deep`, provider key) |
| Answers | `codegraph_explore`: source, call paths, blast radius in one call | `graft_find_code`, `graft_file_api`, `graft_trace_calls`, `graft_find_all`, `graft_repo_map`, `graft_check_freshness` |
| Multi-project | One server, any indexed project via `projectPath` | One directory per server; cross-repo UNCONFIRMED |
| Languages | 30+ | 23 per README (UNCONFIRMED) |
| Install | Installed here, 1.6.1 via mise | npm `@nanonets/graft` 0.21.1; not installed |
| Storage and init | Self-ignoring `.codegraph/`; file watcher | `build` writes `graft/` and appends to tracked `.gitignore`; `init` writes skill, hooks, statusline into `.claude/` plus project `.mcp.json` |
| Fit with auto-init | One quiet init per repo | Invasive: dirties tracked files |
| Maturity (2026-10-03) | MIT, 73k stars, tagged releases, 509 open issues | MIT, 9.5k stars, created 2026-07, no releases, 205 open issues |
| Privacy | Local index; telemetry on here | Structural layer local; `--deep` sends code to an LLM; telemetry on by default plus daily npm check |

Recommendation: ignore Graft for now (D8). Revisit if it ships tagged releases and a mode that writes nothing tracked.

`code-search` 0.2.0 → 0.3.0. Description: "Code search: ripgrep, CodeGraph's local symbol graph with auto-indexing, Context7 library docs, public GitHub code via grep.app, and always-on search guidelines."

## 3. Playwright MCP → `efficient-web`

Why efficient-web: `web-development` and `web-design` already gather live browser evidence; `efficient-testing:e2e` owns repo-runner suites and is "Not for ad-hoc browser driving"; Microsoft recommends CLI plus skills for coding agents, so the MCP gets a narrow role beside `playwright-cli:playwright-cli`.

```json
{ "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest", "--headless", "--isolated"] } }
```

- `--headless` (default is headed); `--isolated` (default persistent profile allows one browser). No `alwaysLoad`. `@latest` per D9. Default browser channel UNCONFIRMED.

Routing edits:

- `browser-diagnostics.md`: first tool bullet for `mcp__plugin_efficient-web_playwright__browser_*` (interactive inspection). Scripted evidence stays with `playwright-cli:playwright-cli` (if installed); the user's real session with `claude-in-chrome`; covered journeys with the repo's e2e runner.
- Same bullet in `rendered-review-checklist.md`; one line in `web-development/SKILL.md`.
- `efficient-testing:e2e` "Not for ad-hoc browser driving" names `playwright-cli:playwright-cli` or efficient-web's Playwright MCP tools, if installed. `efficient-testing` 0.1.0 → 0.1.1.
- `efficient-web` 0.1.0 → 0.2.0. Description: "Web skills: front-end web development and web design, plus a headless Playwright MCP browser."
- Docs: server table, Node ≥18, first-run download, conflict with `playwright@claude-plugins-official`.
- No new eval; `testing-vs-e2e-browser` covers the e2e edit.

## 4. AWS MCP Server → `aws`

With the direct OAuth URL, the server's instructions take over AWS work: Claude skipped `aws:resource-query` and ran an unprojected `ListFunctions` through `aws___run_script`. That breaks the plugin's read-only and no-secrets guarantees, and skill text can't fix it because the skill was never loaded. D2 decides.

### D2(a), recommended: SigV4 proxy, read-only

```json
"aws-mcp": {
  "command": "uvx",
  "args": ["mcp-proxy-for-aws-cli@1.7.0", "https://aws-mcp.us-east-1.api.aws/mcp", "--read-only", "--skip-auth"]
}
```

- The proxy hides `run_script` and `get_presigned_url` (verified); six tools remain.
- `--skip-auth` signs when credentials resolve, unsigned otherwise; knowledge tools work unsigned.
- Signed requests need `aws-mcp:InvokeMcp` and `aws-mcp:CallReadOnlyTool` (UNCONFIRMED in full).
- Requires `uv`; first run may exceed the connect timeout until `/mcp` reconnects.
- Skills keep the CLI for live reads; each skill says its rules take precedence over the server's "avoid the AWS CLI" instruction. `architecture-review` prefers the AWS knowledge tools for AWS guidance.
- New `plugins/aws/skills/resource-query/references/aws-mcp.md`.

### D2(b): OAuth direct URL, with a guard

```json
"aws-mcp": { "type": "http", "url": "https://aws-mcp.us-east-1.api.aws/mcp", "alwaysLoad": false }
```

- OAuth via DCR against AWS Sign-in; tokens last 1 h, refresh up to 12 h; IAM needs `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` (e.g. `AWSMCPSignInOAuthAccessPolicy`).
- Mid-session auth on the first `run_script` 401 is UNCONFIRMED; fallback `?oauth=initialize`.
- Needs a `PreToolUse` hook on `mcp__plugin_aws_aws-mcp__aws___run_script` that denies secret-reading operations, denies secret-in-output operations without projection, and asks for mutating verbs. Skills gain a `run_script` section.

### Common

- `aws` 0.1.1 → 0.2.0. Description: "AWS skills: read-only resource inspection, CloudWatch incident investigation, and Well-Architected and cost review, plus the AWS MCP Server."
- `docs/plugins/aws.md` MCP section.
- Required smoke: "Which Lambda functions exist in us-west-2 for profile dev?" The first AWS action must be the CLI with `--query`, or (b)'s guarded `run_script`, never an unprojected `ListFunctions`.
- Side finding: Claude skipped `aws:resource-query` in all three smoke runs. Rerun `resource-query-routing`.

## 5. Sentry → companion plugins

No per-server default-off switch exists (verified). Recommended (D1): two new plugins with `defaultEnabled: false`.

`plugins/sentry-mcp`: `defaultEnabled: false`, version 0.1.0, description "Sentry's remote MCP server (OAuth) for querying issues, events, traces, and releases on sentry.io. Off until enabled."

```json
{ "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" } }
```

`plugins/sentry-mcp-self-hosted`: `defaultEnabled: false`, version 0.1.0.

```json
"userConfig": {
  "sentry_host": { "type": "string", "title": "Sentry host", "description": "Hostname only, for example sentry.example.com", "required": true },
  "sentry_access_token": { "type": "string", "title": "Sentry user auth token", "description": "Scopes: org:read, project:read, project:write, team:read, team:write, event:write", "sensitive": true, "required": true }
}
```

```json
{ "sentry": { "command": "npx", "args": ["-y", "@sentry/mcp-server@latest"],
  "env": { "SENTRY_HOST": "${user_config.sentry_host}", "SENTRY_ACCESS_TOKEN": "${user_config.sentry_access_token}",
           "EMBEDDED_AGENT_PROVIDER": "", "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "", "OPENROUTER_API_KEY": "" } } }
```

- Token lives in Claude Code's secure store; prompted when enabling.
- Blank LLM keys stop the server spending an inherited key (D10); AI search tools are disabled. Whether empty `env` overrides an inherited value is UNCONFIRMED; slice E checks with a stub.
- Node ≥22.13. Seer tools drop out for non-sentry.io hosts.

`sentry` plugin: skill routes queries to the Sentry MCP tools from either companion, if enabled, or `sentry-cli:sentry-cli`. 0.1.0 → 0.1.1. Docs MCP section. No new eval.

## 6. Exa → `efficient-core`

`exa@claude-plugins-official` resolves to `github.com/exa-labs/exa-mcp-server`, declaring `https://mcp.exa.ai/mcp?client=claude-code-plugin` with `x-exa-source`.

```json
{ "exa": { "type": "http", "url": "https://mcp.exa.ai/mcp", "alwaysLoad": true } }
```

- The bare URL is the connector's endpoint, so the plugin's copy wins. The `?client=` URL would duplicate tools beside the connector.
- `x-exa-source` dropped.
- `alwaysLoad` is documented ("Exempt a server from deferral", 2.1.121) and verified; startup waits up to 5 s.
- Auth: anonymous refused; sign in once in `/mcp` via OAuth. Connector sign-in carry-over UNCONFIRMED. No static `Authorization` header, since it blocks OAuth.
- Per-request cost: `web_search_exa` ~1.5 KB, `web_fetch_exa` ~0.8 KB, `agent_run` ~3.3 KB; 2 tools ≈ 600 tokens, 3 ≈ 1,400 (mostly cache reads). Tool count after sign-in UNCONFIRMED (D6).

`efficient-core:research`: use Exa's tools when connected, WebSearch/WebFetch otherwise; docs → `code-search:context7` (if installed); list-building → `agent_run` when exposed, else `exa:search`/`exa:exa-agent` (if installed). `efficient-core` 0.1.1 → 0.2.0, description gains "plus the Exa web search MCP server". Docs section. Eval `trigger-research-1` (SQLite `STRICT` tables question; fires research, problem-solving max 0).

## Rejected alternatives

| Alternative | Why it lost |
| --- | --- |
| Per-server `"disabled": true` for Sentry | Ignored by Claude Code (verified) |
| Sentry servers inside `sentry`, always on | Not off by default; stdio fails every session until configured |
| Context7 or Exa with a distinct query string | Runs beside the connector with duplicate tools |
| AWS direct URL with only skill text | Smoke run showed Claude bypassing the skills |
| CodeGraph via `npx` | Drifts from the mise copy |
| Model-driven `codegraph init` | Costs a turn, unreliable, contradicts the server's instructions |
| Blocking SessionStart init | First response waits for indexing |
| Graft beside or instead of CodeGraph | See comparison |

## Slices

Lanes A–E run in parallel worktrees with disjoint files. A1 then A2 in one worktree. F after A–E merge.

| Slice | Files | Agent | Review |
| --- | --- | --- | --- |
| A1 Context7 | `plugins/code-search/.mcp.json`, `skills/context7/`, `skills/grep-app/SKILL.md`, two evals | coder-light | quick-review |
| A2 CodeGraph + auto-init | `plugins/code-search/.mcp.json`, `hooks/register.ts`, `hooks/codegraph-autoinit.json`, `scripts/codegraph-autoinit.sh`, `scripts/tests/check.sh`, `skills/codegraph/`, `plugin.json`, two evals, `docs/plugins/code-search.md` | coder | review |
| B Exa | `plugins/efficient-core/.mcp.json`, `plugin.json`, `skills/research/SKILL.md`, eval, `docs/plugins/efficient.md` (core section) | coder-light | quick-review |
| C Playwright | `plugins/efficient-web/.mcp.json`, `plugin.json`, web skill and references, `plugins/efficient-testing/skills/e2e/SKILL.md`, its `plugin.json`, `docs/plugins/efficient.md` (web/testing sections) | coder-light | quick-review |
| D AWS | `plugins/aws/.mcp.json`, `plugin.json`, skills, `references/aws-mcp.md`, `docs/plugins/aws.md`; (b) adds a guard hook and tests | coder (a) / coder + security review (b) | review |
| E Sentry | `plugins/sentry-mcp/**`, `plugins/sentry-mcp-self-hosted/**`, `plugins/sentry` plugin.json and skill, `docs/plugins/sentry.md` | coder | quick-review |
| F Integration | `.claude-plugin/marketplace.json`, `README.md` (29 → 31 plugins) | coder-light | quick-review |

| Slice | Acceptance | Check |
| --- | --- | --- |
| A1 | Entry and skill as specified; grep-app routes docs to context7 | `validate --strict plugins/code-search`; `jq .` |
| A2 | Six-bullet block, skill, hook skips per steps, neutral cwd | `bash plugins/code-search/scripts/tests/check.sh`; validate; `shellcheck` if present |
| B | Entry with `alwaysLoad`; research routes to Exa | validate; `jq` |
| C | Pinned, headless, isolated; four routing lines | validate both plugins |
| D | Config per D2; precedence line in three skills; `aws-mcp.md` | validate; Lambda smoke; (b) guard tests |
| E | Two plugins with `defaultEnabled: false`, `userConfig`, sentry routing | validate; stub probe for empty `env` |
| F | Versions match; new entries; README rows and count | `validate --strict .` |

Smoke after F: `claude -p --plugin-dir plugins/<p> --model haiku "List tool names starting with mcp__plugin_<p>_, deferred ones included."` for aws, efficient-web, sentry-mcp, sentry-mcp-self-hosted. Smoke code-search and efficient-core after the marketplace update.

## Rollout on this machine

1. Merge; `claude plugin marketplace update adminhead`.
2. CodeGraph (recommended): `claude mcp remove codegraph -s user`; allow `mcp__plugin_code-search_codegraph__*` beside `mcp__codegraph__*`. Check whether `codegraph upgrade` re-adds the server (UNCONFIRMED).
3. Apply D4 to `~/.claude/CLAUDE.md`.
4. Context7: `claude plugin uninstall context7@claude-plugins-official`.
5. Exa: authenticate `plugin:efficient-core:exa` in `/mcp`; check the connector shows no tools.
6. AWS: (a) ensure `uv`; (b) attach `AWSMCPSignInOAuthAccessPolicy`.
7. Sentry: install the companion(s); check they install disabled (UNCONFIRMED); enable one with `claude plugin enable`.
8. Playwright: enable `efficient-web` where wanted.
9. `claude mcp list`: each server once, no `plugin:context7:context7`.
10. Optional paid evals for code-search, efficient-core, efficient-testing, aws.

## Risks and rollback

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| Plugin server silently skipped as a duplicate | Bare tool names; rollout step 2 | Re-add the user-level server |
| AWS server instructions steer Claude off the CLI | (a) hides `run_script`; Lambda smoke | `/mcp` toggle or revert D |
| Auto-init indexes an unwanted or huge repo | Git-only, cap, opt-outs, `info/exclude` | `codegraph uninit`; option false |
| First session sees a partial index | Always-on text sends Claude to `rg` | None |
| Stdio servers inherit every env var | Pinned versions; blank LLM keys for Sentry | Disable the plugin |
| Exa adds 600–1,400 tokens per request | Measured (D6) | Drop `alwaysLoad` |
| `defaultEnabled: false` doesn't survive install | Rollout step 7 | `claude plugin disable` |
| First `uvx`/`npx` run times out | Documented | Reconnect in `/mcp` |

## Critique log

Critic: agy gemini-3.1-pro-high/high, one round.

| # | Point | Status |
| --- | --- | --- |
| 1 | Auto-init violates the user's CLAUDE.md; running a binary in any repo is risky | Partly rejected (requested; D3/D4 surface it); partly adopted (neutral cwd) |
| 2 | Routing evals fail without MCP tools | Rejected: evals grade the `Skill` call |
| 3 | Removing user-level codegraph breaks it elsewhere | Partly adopted: optional; bare tool names |
| 4 | Skill text can't override AWS server instructions | Adopted: confirmed; recommendation switched to the SigV4 read-only proxy |
| 5 | Playwright flags may be invalid | Rejected: in the README options table |
| 6 | Sentry stdio may spend inherited LLM keys | Adopted: keys blanked (D10) |
| 7 | Exa `alwaysLoad` is a permanent token cost | Rejected: requested; measured (D6) |
| 8 | Tool `_meta` may override server `alwaysLoad: false` | Adopted as a probe: server `false` wins |

## Settled decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Sentry off by default | (a) Two companion plugins, `sentry-mcp` and `sentry-mcp-self-hosted`, each `defaultEnabled: false` |
| D2 | AWS auth and capability | (b) OAuth direct URL, `alwaysLoad: false`, `PreToolUse` guard hook on `run_script`, skills rewrite. The user chose this over the recommended read-only proxy. Slice D gets a security review |
| D3 | CodeGraph auto-init | (a) As specified |
| D4 | `~/.claude/CLAUDE.md` CodeGraph section | (a) Remove it at rollout |
| D5 | Context7 copies | (a) Uninstall `context7@claude-plugins-official` |
| D6 | Exa | (a) Bare URL with `alwaysLoad: true` |
| D7 | Playwright MCP home | (a) `efficient-web` |
| D8 | Graft | (a) Ignore for now |
| D9 | npx/uvx versions | (b) `@latest`. The user chose this over pinning; unreviewed upstream releases run at session start |
| D10 | Sentry self-hosted AI search | (a) Blank the LLM keys |

## Decision options (as presented)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Sentry off by default | (a) Two companion plugins with `defaultEnabled: false`. (b) Inside `sentry`, always on. (c) Inside `sentry` with a documented `/mcp` toggle | (a) |
| D2 | AWS auth and capability | (a) SigV4 proxy `--read-only --skip-auth`. (b) OAuth direct URL + `run_script` guard hook + skills rewrite. (c) OAuth direct with skill text only (failed smoke) | (a) |
| D3 | CodeGraph auto-init policy | (a) As specified. (b) Different cap. (c) No hook | (a) |
| D4 | `~/.claude/CLAUDE.md` CodeGraph section | (a) Remove. (b) Replace with auto-init wording. (c) Keep | (a) |
| D5 | Context7 copies | (a) Uninstall `context7@claude-plugins-official`. (b) Keep both. (c) Skill only, rely on connector | (a) |
| D6 | Exa URL and loading | (a) Bare URL + `alwaysLoad`. (b) `?tools=` narrowed, disconnect connector. (c) Bare URL, deferred | (a) |
| D7 | Playwright MCP home | (a) `efficient-web`. (b) `efficient-testing`. (c) `playwright-cli` | (a) |
| D8 | Graft | (a) Ignore. (b) Alongside CodeGraph. (c) Replace CodeGraph | (a) |
| D9 | npx/uvx versions | (a) Pin. (b) `@latest` | (a) |
| D10 | Sentry self-hosted AI search | (a) Blank LLM keys. (b) Inherit env. (c) `userConfig` provider and key | (a) |
