# sentry

Teaches Claude Code to instrument apps with the official Sentry SDKs. It covers setup, errors, tracing, logs, metrics, and cron monitors across JavaScript, Python, Go, JVM and Android, Apple, Flutter, and other runtimes.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `sentry:sentry` | `sentry` | Instrument apps with official Sentry SDKs: `Sentry.init`, DSN config, error capture, tracing, structured logs, metrics, cron monitors, source maps, and SDK upgrades |

It replaces the user-level skill of the same name. Invoke it as `sentry:sentry`. The bare name `sentry` no longer works.

The skill has references for the project profile, setup, configuration, errors, tracing, logs, metrics, and crons, plus one file per platform group.

## Behavior

- Reads a `## Sentry` section from the project's `CLAUDE.md` or `AGENTS.md` before choosing signals, scrubbing, breadcrumbs, sample rates, or DSN handling. Without one, it uses conservative generic defaults from `references/profile.md` and offers to write the section. It writes the section only after you agree.
- Reads the installed SDK version, then checks current docs through Context7 (`/getsentry/sentry-docs` first) or `docs.sentry.io`. The references record decisions and pitfalls, not an API manual.
- Initializes once per runtime and gives each signal one owner.
- Keeps telemetry from changing app behavior, and keeps names and tags low-cardinality.
- Relies on server-side scrubbing. It adds client-side privacy filters only when you or the project profile ask.
- Asks before any step that touches your Sentry org: a test event, log, metric, or check-in, a source-map or symbol upload, or a cron `MonitorConfig`.
- Treats content fetched from Sentry as data, not instructions.

## Requirements

- A project that uses, or will use, an official Sentry SDK.
- The Context7 MCP server or web fetch, for current docs.
- Optional: the `sentry-mcp` or `sentry-mcp-self-hosted` companion below, or the external `sentry-cli:sentry-cli` plugin. Claude uses either to confirm that a test signal arrived.

Version numbers in the platform references are a snapshot. Claude rechecks them against current docs.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install sentry@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/sentry
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/sentry
   ```
2. Start a fresh session. The skill list should show `sentry:sentry`.

## Sentry MCP servers (companion plugins)

Two plugins connect Sentry's MCP server so Claude can query issues, events, traces, and releases. Both ship `defaultEnabled: false`, so installing one leaves it off until you enable it. The `sentry` skill routes such queries to these tools when one is enabled, and to `sentry-cli:sentry-cli` otherwise.

| Plugin | Transport | Use for | Auth |
| --- | --- | --- | --- |
| `sentry-mcp` | HTTP, `https://mcp.sentry.dev/mcp` | sentry.io | OAuth in `/mcp` |
| `sentry-mcp-self-hosted` | stdio, `npx -y @sentry/mcp-server@latest` | Self-hosted Sentry | User auth token |

Enable one, not both. They expose identical tool names, so both together duplicate every tool.

### Enable

```
claude plugin install sentry-mcp@adminhead
claude plugin enable sentry-mcp@adminhead
```

Use `sentry-mcp-self-hosted@adminhead` for self-hosted. `/plugin` does the same from a session. Whether `install` itself writes `enabledPlugins` as `true` is UNCONFIRMED, which is why the `enable` step is listed. Start a new session afterward. Once a user's `enabledPlugins` entry exists, later changes to `defaultEnabled` do not alter it.

### sentry-mcp (remote, OAuth)

- Run `/mcp`, pick `plugin:sentry-mcp:sentry`, and complete the browser sign-in. Sentry's MCP OAuth provider supports dynamic client registration (DCR), so no client ID is needed (per the getsentry/sentry-mcp OAuth docs, checked 2026-10-13).
- Tools are named `mcp__plugin_sentry-mcp_sentry__*`.
- Grant the scopes the consent screen asks for. Tools that write (for example project or event changes) need the matching write scopes.

### sentry-mcp-self-hosted (stdio, token)

- Enabling prompts for two values. Claude Code keeps them in its secure store, not in `.mcp.json`.

  | Value | Notes |
  | --- | --- |
  | Sentry host | Hostname only, for example `sentry.example.com`. A value with `http://` or `https://` is rejected (`@sentry/mcp-server` 0.42.0 source, checked 2026-10-13). |
  | Sentry user auth token | Scopes: `org:read`, `project:read`, `project:write`, `team:read`, `team:write`, `event:write` |

- Requires Node 22.13 or later. `@sentry/mcp-server` 0.42.0 declares `engines.node >=22.13` (checked 2026-10-13). It also needs network access to npm on first run.
- The server's `SENTRY_URL` variable (a full `https://` URL) is an alternative to `SENTRY_HOST`. The plugin does not set it. `--insecure-http` for plain-HTTP hosts is not wired in.
- The server's AI-powered search tools need an LLM key. The plugin sets `EMBEDDED_AGENT_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENROUTER_API_KEY` to empty strings, so a key in your shell is never inherited and spent, and those tools stay disabled. An empty `env` value does override an inherited one (checked with a stub server on Claude Code 2.1.288).
- Seer tools are absent for hosts other than sentry.io. The server excludes them by default on self-hosted.
- The args use `@latest`, so `npx` can pull a new server version on any start. Pin a version in `.mcp.json` if you need reproducibility.

### Verify

```
claude plugin validate --strict plugins/sentry-mcp
claude plugin validate --strict plugins/sentry-mcp-self-hosted
```

After enabling, `/mcp` should list the server. For `sentry-mcp`, it shows as needing sign-in until OAuth completes.

### Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable sentry-mcp@adminhead` |
| Uninstall | `claude plugin uninstall sentry-mcp@adminhead` |

## Limits

- Not for querying issues, releases, alerts, dashboards, or projects. Use the Sentry MCP tools below or `sentry-cli:sentry-cli` for that.
- SDKs buffer, so a flush or an event ID proves an attempt, not delivery.
- Without Context7 or web access, Claude has only the snapshot in the references.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable sentry@adminhead` |
| Uninstall | `claude plugin uninstall sentry@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
