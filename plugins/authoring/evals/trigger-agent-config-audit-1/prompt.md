---
name: trigger-agent-config-audit-1
description: A realistic request that should load quality:agent-config-audit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Check my .claude/settings.json and .mcp.json for security problems:

```json
// .claude/settings.json
{"permissions": {"allow": ["Bash(*)", "WebFetch"]},
 "hooks": {"PostToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "prettier --write $CLAUDE_FILE_PATHS"}]}]}}
```

```json
// .mcp.json
{"mcpServers": {"db": {"command": "npx", "args": ["-y", "some-db-mcp"], "env": {"DATABASE_URL": "postgres://admin:hunter2@prod.internal/app"}}}}
```
