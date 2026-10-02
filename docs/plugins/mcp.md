# mcp

Adds three skills for Model Context Protocol servers: design the tool surface, build the server with an official SDK, and review it before release. They are checked against the 2026-07-28 protocol revision.

## What it adds

| Skill | Purpose |
| --- | --- |
| `mcp:design` | Design what a server exposes to agents: 5 to 15 workflow tools, descriptions and parameters, risk tiers and safeguards for write tools, resource-server auth, and versioning of the tool surface |
| `mcp:build` | Build a server with the official TypeScript, Python, Go, or Rust SDK: schema-first tools, transport-independent logic, stdio or Streamable HTTP, structured tool errors, and Inspector testing |
| `mcp:review` | Review a server before release in two passes: static security review of the source, and release QA that runs one real protocol session and checks that source, runtime, metadata, and docs agree |

The usual order is design, then build, then review. `mcp:build` runs `mcp:design` first when no design exists and the server has more than a few tools or any write tool. It hands off to `mcp:review` before release.

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

- No CLI is required for `mcp:design`.
- `mcp:build` needs the toolchain of the SDK you choose. It also tests with the MCP Inspector (`npx @modelcontextprotocol/inspector@2.9.0`), which needs Node 22.19 or later.
- `mcp:review` reads source. Its release QA pass starts the candidate server locally. Dependency audit commands (`npm audit`, `pip-audit`, `cargo audit`) are optional.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install mcp@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/mcp
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/mcp
   ```
2. Start a fresh session. The skill list should show `mcp:design`, `mcp:build`, and `mcp:review`.

## Safety

`mcp:review` is the skill with hard limits:

- It never sends attack payloads, fuzzing, or exploit probes to any running server, whether live, shared, staging, or your own local one. It describes each security test (input, safe result, unsafe result) so you can run it in an isolated test environment.
- Release QA starts only a fresh local process of the candidate build, with test configuration, and only after you agree. Its probes check protocol conformance (malformed JSON, unknown method, missing argument), not exploits.
- It never calls a mutation-capable tool against production data. It uses fixtures or a sandbox, or stops and names the missing safe environment.
- It redacts secrets: environment variable names, never values, and no tokens, cookies, or authorization headers.
- It asks before running package-manager audit commands, because they send dependency names to a registry.
- It does not edit the server unless you ask for fixes.

`mcp:build` asks before registering a server with `claude mcp add`, because that writes Claude Code settings. It also runs the Inspector only against a server you own.

`mcp:design` treats tool annotations as hints, not controls. It requires write safeguards to live on the server and disables irreversible or deployment-triggering tools by default.

## Limits

- The protocol and the SDKs move. The skills record the revision (2026-07-28) and, for `mcp:build`, the SDK versions checked on 2026-10-02. Code from older tutorials often fails to import, so check current SDK docs.
- Findings that depend on deployment config, identity-provider state, or logs the reviewer cannot see are marked `NEEDS INVESTIGATION`, not guessed.
- Wiring an existing MCP server into a Claude Code plugin is out of scope. Use `plugin-dev:mcp-integration`, if installed. Building the OAuth authorization server belongs to `api:oauth-provider`, if installed.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable mcp@adminhead` |
| Uninstall | `claude plugin uninstall mcp@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
