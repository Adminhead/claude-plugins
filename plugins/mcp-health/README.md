# mcp-health

A mod that adds `mcp: <server> ✗` under the prompt hint (terminal only) while an MCP server's latest tool call errored. It is hidden while every server is fine, and a server's next successful call clears it. More than three failing servers collapse to `+N`.

## Install

```
/plugin install mcp-health --marketplace Adminhead/claude-plugins
```

`baseline` installs it for you.

With `toast_on_first_error` (default on) it also shows a toast the first time each server errors in a session. Turn it off with `/config` or `pluginConfigs["mcp-health"].options`.

How it works: a `tool.call` hook passes every call through (`await next(e)`) and only looks at the result. A result with `isError` marks the server failing; any other result clears it; a deny is ignored because it never reached the server. The server comes from the tool name `mcp__<server>__<tool>`, parsed only when the name is at most 256 characters. The record resets on `session.end` (including `/clear`). The segment stacks under whatever the engine and other plugins draw at the hint, by rendering `await next(e)` first.

`claude plugin validate` lists the hook as `gating hook without .catch`: it never denies, so a throw only skips the observer and the call goes through.

Known limit: a call the person interrupts also comes back with `isError`, so it marks the server until its next good call.

Idea from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT; no code copied).

Test: `claude plugin test plugins/mcp-health`.
