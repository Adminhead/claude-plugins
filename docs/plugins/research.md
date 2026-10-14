# research

Adds the `research:research` skill for cited answers to external questions, and an Exa web search MCP server. `research` is in the `baseline` set.

## What it adds

| Skill | Purpose |
| --- | --- |
| `research:research` | Answer an external question from weighed sources with citations. Use it for comparisons, "is it true that" checks, current policy or state, and topics that need authoritative sources |

It doesn't handle a single library's API docs (use `code-search:context7`), public code examples (use `code-search:grep-app`), or implementation plans (use `coding-core:planning`). Those pointers say "if installed".

## Exa web search MCP server

The plugin ships an HTTP MCP server for Exa's web search API (`https://mcp.exa.ai/mcp`). It exposes `web_search_exa` (search the web), `web_fetch_exa` (read a URL), and `agent_run` for broad list-building and enrichment when exposed. `research:research` routes web search requests to these tools when connected, and falls back to WebSearch and WebFetch otherwise. A verification run on 2026-10-03 exposed only `web_search_exa` and `web_fetch_exa`.

The server's tools are named `mcp__plugin_research_exa__*`. Crew agents grant those names in their tool lists.

The server is always-loaded by default (`alwaysLoad: true`), which reserves roughly 600 tokens per request in the context window (measured on 2026-10-03 with cache reads). If you don't use the research skill, disable the server in `/mcp` (per project), disable the plugin with `claude plugin disable`, or set `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the `env` block of `~/.claude/settings.json` to disable all claude.ai connectors in Claude Code.

**OAuth sign-in:** The first request to an Exa tool may prompt a one-time OAuth sign-in for `plugin:research:exa` in `/mcp`. If the claude.ai Exa connector shadows the plugin copy, the connector's sign-in applies instead. UNCONFIRMED: a verification run connected without visible sign-in.

**Connector shadowing:** When a claude.ai Exa connector exists at the same URL (`https://mcp.exa.ai/mcp`), Claude Code uses the connector and silently drops the plugin copy, so `alwaysLoad` does not apply. To use the plugin copy instead, remove the Exa connector at claude.ai → Settings → Connectors, or set `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the `env` block of `~/.claude/settings.json` (disables all claude.ai connectors in Claude Code).

## Install

`baseline` installs `research`. To install it alone:

```
claude plugin install research@adminhead --scope user
```

To try it without installing:

```
claude --plugin-dir plugins/research
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/research
   ```
2. Start a fresh session. The skill list should show `research:research`. Run `/mcp`, and it should list `plugin:research:exa`.

## Limits

- Search results and snippets are leads, not support. The skill reads a source before it cites it.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable research@adminhead` |
| Uninstall | `claude plugin uninstall research@adminhead` |

Both commands remove the skill and the Exa server. Start a new session to be sure they are gone.
