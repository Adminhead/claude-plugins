# Aspire CLI

Checked against the aspire.dev CLI reference for Aspire 13.6 (2026-10). Run `aspire <command> --help` for the installed version; commands marked preview change between releases.

## Common options

Most commands take `--apphost <path>` (skip the AppHost picker), `--non-interactive` (no prompts or spinners; use it in scripts and from an agent), `-l, --log-level <level>`, `--nologo`, `--wait-for-debugger`.

## Create and configure

| Command | Use |
|---|---|
| `aspire new [<template>] [-n name] [-o dir]` | New app. Templates: `aspire-starter` (ASP.NET Core/Blazor), `aspire-ts-cs-starter` (ASP.NET Core/React), `aspire-py-starter` (FastAPI/React), `aspire-ts-starter` (Express/React), `aspire-empty` (C# AppHost), `aspire-ts-empty` (TypeScript AppHost). `aspire new <template> --help` lists template options |
| `aspire init` | Add an AppHost to an existing repo (`--language typescript` for a TypeScript AppHost) |
| `aspire add [<integration>] [--version v]` | Add a hosting integration package to the AppHost; a partial name searches NuGet |
| `aspire restore` | Restore AppHost packages and regenerate SDK code (TypeScript AppHost `.aspire/modules/`) |
| `aspire update` (preview) | Update Aspire packages and templates in the project; `aspire update --self` updates the CLI |
| `aspire config get/set/list/delete` | CLI settings and feature flags |
| `aspire secret set/get/list/delete/path` | AppHost user secrets (parameter values) |
| `aspire certs trust` / `aspire certs clean` | HTTPS dev certificates |
| `aspire cache clear` | Clear the CLI cache |
| `aspire doctor` | Check SDK, container runtime and certificates |
| `aspire docs search/list/get` | Search and read aspire.dev docs from the terminal |

## Run and inspect

| Command | Use |
|---|---|
| `aspire run [--detach] [--isolated] [--no-build] [-- args]` | Run the AppHost. Foreground by default; `--detach` returns once started; `--isolated` randomizes ports and secrets so two copies can run |
| `aspire start` | Start in the background and exit at a stable running state (same options as `run --detach`) |
| `aspire ps` | List running AppHosts |
| `aspire stop` | Stop a running AppHost |
| `aspire describe [<resource>] [--follow] [--format Json]` | Resource state, health, endpoints; `--follow --format Json` streams NDJSON |
| `aspire wait <resource> [--status healthy\|up\|down] [--timeout s]` | Block until a resource reaches a status (default `healthy`, 120 s) |
| `aspire logs [<resource>] [-f] [-n N]` | Console logs, all resources or one |
| `aspire resource <name> <command>` | Run a resource command such as start, stop or restart |
| `aspire otel logs/spans/traces` (preview) | Structured logs and traces from the terminal |
| `aspire export` | Package telemetry and resource data from a running AppHost |
| `aspire mcp tools` / `aspire mcp call` | List or call MCP tools exposed by running resources |
| `aspire dashboard run` (preview) | Standalone dashboard |

CI pattern:

```bash
aspire start --non-interactive
aspire wait api --timeout 300
aspire wait db --status healthy
# ... run checks ...
aspire stop
```

## Publish and deploy (preview)

| Command | Use |
|---|---|
| `aspire publish [--environment env]` | Write target artifacts (compose file, Helm chart, Bicep) to `aspire-output/`, leaving parameters unresolved |
| `aspire deploy [--environment env]` | Generate, resolve parameters and apply to the target |
| `aspire do <step>` | Run one pipeline step and its dependencies (for example `aspire do publish`) |
| `aspire destroy` | Tear down an environment created by `aspire deploy` |

## Agent integration

`aspire agent init` installs Aspire's own agent skills into `.claude/skills/` (and other agent folders) and can optionally configure an MCP server; `aspire agent mcp` runs that server. Only run these when the user asks: they write into the repo.

## dotnet equivalents

`dotnet run --project <AppHost>` runs a C# AppHost and `dotnet test` runs Aspire tests; the Aspire CLI adds detached runs, inspection, `add`, `publish` and `deploy`. There is no `aspire build` or `aspire test`.
