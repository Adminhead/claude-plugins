# Where Claude Code defines MCP servers

Checked 2026-10-17 against code.claude.com (MCP quickstart, managed MCP, settings reference) and a local install. `claude mcp list` and `claude mcp get <name>` show what Claude Code resolved for the current directory, but `claude mcp list` also health-checks each server, which starts stdio servers. Read the files instead when a server is untrusted.

| Scope | File | Key |
| --- | --- | --- |
| User | `~/.claude.json` | top-level `mcpServers` |
| Local (one project, private) | `~/.claude.json` | `projects["<abs project path>"].mcpServers` |
| Project (shared, in git) | `<project>/.mcp.json` | `mcpServers` |
| Plugin | `<installPath>/.mcp.json`, or `mcpServers` in `<installPath>/.claude-plugin/plugin.json` (inline object or a path to a file) | server map, with or without an `mcpServers` wrapper |
| Managed, exclusive | `/etc/claude-code/managed-mcp.json` (Linux, WSL), `/Library/Application Support/ClaudeCode/managed-mcp.json` (macOS), `C:\Program Files\ClaudeCode\managed-mcp.json` (Windows) | `mcpServers` |
| Managed, non-exclusive | managed settings | `managedMcpServers` |

Claude Code does not read `~/.claude/.mcp.json`, `~/.claude/mcp.json` or similar paths, so a server defined only there is inert. Project `.mcp.json` servers load only after approval: check `enableAllProjectMcpServers`, `enabledMcpjsonServers` and `disabledMcpjsonServers` in the settings files, and `allowedMcpServers` / `deniedMcpServers` for policy. claude.ai connectors (`mcp__claude_ai_*` tools) are configured in the claude.ai account, not in these files.

Installed plugins and their install paths are in `~/.claude/plugins/installed_plugins.json` (`plugins["<name>@<marketplace>"][].installPath`, with `scope` and, for project or local installs, `projectPath`). A plugin server's tools are named `mcp__plugin_<plugin>_<server>__<tool>`. Plugins synced from a claude.ai account live under `~/.claude/plugins/synced/` and are not listed in that file, so search there too (`find ~/.claude/plugins/synced -name .mcp.json`).

## One-liners

Never print `env` or `headers` values. These show only names.

```bash
# User and local-scope servers, with launch target and the names of env vars and headers
jq -r '(.mcpServers // {} | to_entries[] | "user  \(.key)  \(.value.type // "stdio")  \(.value.url // ([.value.command] + (.value.args // []) | join(" ")))  env=\((.value.env // {}) | keys | join(","))  headers=\((.value.headers // {}) | keys | join(","))"),
       (.projects // {} | to_entries[] | .key as $p | (.value.mcpServers // {}) | to_entries[] | "local[\($p)]  \(.key)  \(.value.type // "stdio")  \(.value.url // ([.value.command] + (.value.args // []) | join(" ")))")' ~/.claude.json

# Project scope
jq -r '.mcpServers // {} | to_entries[] | "\(.key)  \(.value.type // "stdio")  \(.value.url // ([.value.command] + (.value.args // []) | join(" ")))"' .mcp.json

# Plugin servers: every installed plugin's .mcp.json
jq -r '.plugins[][] | .installPath' ~/.claude/plugins/installed_plugins.json | sort -u | while read -r p; do
  [ -f "$p/.mcp.json" ] && { echo "== $p"; jq -r '(.mcpServers // .) | to_entries[] | "\(.key)  \(.value.type // "stdio")  \(.value.url // ([.value.command] + (.value.args // []) | join(" ")))"' "$p/.mcp.json"; }
  jq -e '.mcpServers' "$p/.claude-plugin/plugin.json" >/dev/null 2>&1 && echo "== $p: mcpServers in plugin.json"
done
```

## What to look for in an entry

- `command` of `npx`, `uvx`, `bunx`, `pnpm dlx` or `docker run` with a floating version (`pkg`, `pkg@latest`, `image:latest`): the code can change without a config change. Pin to an exact version, or an image digest. For a fleet-wide classification of pinning across agent config, use `agent-config-audit` (if installed).
- `sh -c`, `bash -c`, `curl ... | sh`, or a script path inside a writable or temp directory.
- Secrets as literal values in `env` or `headers` instead of `${VAR}` expansion, especially in a project `.mcp.json` that is committed.
- `url` over plain `http` to a non-loopback host, or a host the user can't name the operator of.
- Two servers that expose the same tool names, or a server named like a trusted one (`githb`, `filesystem-mcp` vs `filesystem`).
- `alwaysLoad: true` on a server that doesn't need it: its tools then skip deferred loading and always sit in context.
