# Batch mcp: report

## Plugins created

| Name | Type | Description (= plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `mcp-server` | S | MCP server skill: design the tool surface (workflow tools, descriptions, write-tool safeguards, auth) and build it with the official TypeScript, Python, Go or Rust SDK over stdio or Streamable HTTP, tested with the Inspector. | archive mcp/skills/build (spine) + mcp/skills/design (step 1, body moved to `references/tool-design.md`; `write-safety.md`, `mcp-apps.md` kept), archive mcp evals | none |
| `mcp-server-review` | S | MCP server review skill: static security review of server or client source and a release QA pass over one real local protocol session, with OWASP MCP Top 10 checks. | archive mcp/skills/review (+ references security.md, release-qa.md) | none |
| `mcp-server-audit` | S | MCP server audit skill: checks configured or third-party MCP servers for tool poisoning, shadowing, rug pulls, SSRF and unauthenticated exposure, with offline description scanning and hash pinning. | 3rd-party Anthropic-Cybersecurity-Skills `auditing-mcp-servers-for-tool-poisoning` (Apache-2.0; LICENSE + NOTICE shipped) | none |
| `grep-app` | P | grep.app MCP server (remote HTTP, no API key): literal and regex code search across about a million public GitHub repositories. | archive code-search/.mcp.json (`grep-app` entry only) + README.md | none |

## Validation and tests

- `claude plugin validate --strict plugins/<name>` passed for all four.
- `python3 -B -I -m unittest discover -s plugins/mcp-server-audit/skills/mcp-server-audit/scripts -p 'test_*.py'`: 7 tests OK. The file is `test_*.py`, so `claude plugin test` does not pick it up.
- `mcp_audit.py scan` run on grep.app's live `tools/list`: one benign flag (`oversized:1537`), no false poisoning hits.
- grep.app endpoint: POST `initialize` and `tools/list` to `https://mcp.grep.app` returned 200 (SSE), protocol 2025-06-18, one tool `searchGitHub`.
- Old-name grep (`codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `mcp:`, `api:`, `code-search:`): clean (only `rmcp::` Rust paths matched).
- jq one-liners in `claude-code-config.md` run against `~/.claude.json` and the archive code-search `.mcp.json`.

## Version facts checked (2026-10-17)

- MCP protocol: 2026-07-28 still `LATEST_PROTOCOL_VERSION` (Context7, spec repo schema); `server/discover`, per-request `_meta`, `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` confirmed.
- Registries: `@modelcontextprotocol/server` 2.3.1 (Node >=20), codemod 2.3.1, Inspector 2.11.0 (Node >=22.19), PyPI `mcp` 2.3.0, `rmcp` 3.5.1, go-sdk v1.8.0 (unchanged). The references and pinned commands were updated to match.
- Context7: TS v2.3.1 docs (`serveStdio`, `registerTool` with `zod/v4`) and Python v2 (`MCPServer`, `ToolError` path, `run()` transport options) unchanged; Inspector CLI flags and exit codes (5 = tool isError, 3 auth, 4 unreachable) confirmed.
- Not rechecked in depth: the Rust and Go API text (versions only). Each reference says so.
- `mcp-scan`: renamed to **Snyk Agent Scan**. The PyPI package and CLI are `snyk-agent-scan` (0.6.8, repo github.com/snyk/agent-scan). `mcp-scan` 0.4.3 is a redirect package. `scan` now needs `SNYK_TOKEN` and uploads descriptions, config and skill text to Snyk (redacted). `inspect` is local. Proxy and whitelist/pinning commands are gone from the docs. The skill states all of this.
- Claude Code MCP config paths: `~/.claude.json` (user `mcpServers`, local `projects[path].mcpServers`), project `.mcp.json`, plugin `.mcp.json`/`plugin.json mcpServers`, `managed-mcp.json` paths and `managedMcpServers` (code.claude.com via Context7); plugin install paths from `~/.claude/plugins/installed_plugins.json` (local install).

## Deviations

- `mcp-server-audit`: upstream `scripts/agent.py` dropped as instructed. It is replaced by a new stdlib-only offline `scripts/mcp_audit.py` (`scan`, `pin`, `verify`) with tests. The script reads a saved `tools/list` JSON and never launches or contacts a server. It does hash pinning itself because Snyk Agent Scan no longer documents pinning.
- The upstream "attempt SSRF" step is limited to an owned local test instance with consent, otherwise written up as tests, matching mcp-server-review's no-probing rule. Proxy mode dropped.
- ECC mcp-dependency-review pin classification was not folded in; the skill cross-references `agent-config-audit` (if installed) for it.
- Evals: the archive design and build evals now grade `mcp-server:mcp-server`. The old `not-build` negatives became meaningless after the merge, so they became `not-review` hard negatives. Route eval renamed `build-routing`. New trigger evals were added for `mcp-server-review` and `mcp-server-audit`. None were run (`claude plugin eval` not run).
- grep-app: the archived grep-app skill is not ported (plan: server instructions cover it). Its usage guidance is in the README. The `.mcp.json` uses the `mcpServers` wrapper.
- `plugin-dev:mcp-integration` kept as an "if installed" external reference (claude-plugins-official plugin).

## Unverified / TODO

- Trigger evals not run.
- `${CLAUDE_SKILL_DIR}` in the audit skill's `allowed-tools` follows the pattern in round-1 skills (adr-writing, docs-audit, helm). It was not tested live.
- OWASP MCP Top 10 IDs (MCP01/MCP03:2025) carried from upstream. The skill tells the reader to confirm an ID before citing it.

## Suggested follow-ups

- Register all four. `mcp-server-audit` fits next to `agent-config-audit`/`plugin-vetter` in docs; `grep-app` under Tools.
- Run `claude plugin eval` on the three skills, especially `mcp-server` vs `mcp-server-review` vs `mcp-server-audit` routing.
