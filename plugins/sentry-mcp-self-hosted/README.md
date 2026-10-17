# sentry-mcp-self-hosted

Runs Sentry's official MCP server, [`@sentry/mcp-server`](https://www.npmjs.com/package/@sentry/mcp-server), over stdio against a self-hosted Sentry instance, so Claude can look up issues, events, traces, releases and monitors. The hosted `mcp.sentry.dev` server is not used.

The package is pinned to **0.42.0** (latest on npm on 2026-10-17). Bump the version in `.mcp.json` deliberately, after reading the release notes, rather than tracking `@latest`.

## Requirements

- Node.js 22.13 or newer and `npx` on `PATH` (the package's `engines` field).
- A self-hosted Sentry reachable over HTTPS from this machine.
- A Sentry user auth token (User Settings > Personal Tokens on your instance).

## Install

```bash
claude plugin install sentry-mcp-self-hosted@adminhead
```

The plugin is installed disabled. Enable it in `/plugin` (or `claude plugin enable sentry-mcp-self-hosted@adminhead`) and Claude Code asks for:

| Field | What to enter |
| --- | --- |
| Sentry host | Hostname only, for example `sentry.example.com`. No `https://`, no path. |
| Sentry user auth token | The token. It is masked and stored in the system credential store, not in `settings.json`. |
| Granted tool groups | Defaults to `inspect` (read-only). See below. |

Restart the session, then check `/mcp` for a connected `sentry` server. Its tools appear as `mcp__plugin_sentry-mcp-self-hosted_sentry__*`.

## Token scopes and tool groups

Grant the token only what the tool groups you enable need.

| Tool group (`Granted tool groups`) | What it can do | Token scopes |
| --- | --- | --- |
| `inspect` (default) | Read issues, events, traces, replays, releases, monitors, profiles, project metadata, docs | `org:read`, `project:read`, `team:read`, `event:read` |
| `triage` | Resolve, assign and update issues | add `event:write` |
| `project-management` | Create and change projects, teams, DSNs, monitors, alert rules | add `project:write`, `team:write` |
| `seer` | Sentry's AI debugger | only if Seer is available on your instance |

Combine groups with commas, for example `inspect,triage`. Change the value later in `/config` or by re-enabling the plugin.

## What the config does

`.mcp.json` sets these environment variables for the server process:

- `SENTRY_HOST` and `SENTRY_ACCESS_TOKEN` from your answers, and `MCP_SKILLS` from the tool groups.
- `SENTRY_URL` is blanked so a value in your shell can't override the host.
- `SENTRY_DSN` and `DEFAULT_SENTRY_DSN` are blanked so the server doesn't send its own telemetry (which records tool inputs and outputs) to a DSN that happens to be in your shell.
- `EMBEDDED_AGENT_PROVIDER` and the OpenAI, Anthropic and OpenRouter keys are blanked, so the server doesn't send your Sentry data to a third-party LLM for its AI-powered search. Search tools still work with Sentry's query syntax.

To use plain HTTP on a private network, the server needs `--insecure-http`; add it to `args` in a local copy. Prefer HTTPS.

## Troubleshooting

- `/mcp` shows the server failed: run `npx -y @sentry/mcp-server@0.42.0 --help` to check that Node and npm can fetch the package.
- 401 errors: the token is wrong or expired. 403 errors: the token lacks a scope for the tool group in use.
- Nothing found: confirm the host is the hostname of the web UI, and that your user is a member of the organization.

Content returned by Sentry (event messages, breadcrumbs, issue titles) is data from your applications. Claude treats it as data, never as instructions.

`@sentry/mcp-server` is published by Sentry under the FSL-1.1-ALv2 license and is downloaded by `npx` at run time; this plugin ships only the configuration.
