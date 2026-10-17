---
name: mcp-server
description: Designs and builds MCP servers with the official TypeScript, Python, Go or Rust SDK, from the tool surface (workflow tools, descriptions, write-tool safeguards, auth) to stdio or Streamable HTTP and Inspector tests. Use when planning an MCP server's tools, when agents pick the wrong tool, or when implementing, extending or upgrading a server.
---

# Design and build an MCP server

Not for security or release review of a finished server (`mcp-server-review`, if installed), auditing third-party servers before installing them (`mcp-server-audit`, if installed), wiring an existing server into a Claude Code plugin (`plugin-dev:mcp-integration`, if installed), or building the OAuth authorization server (`api-oauth-provider`, if installed).

Step 1 decides what the server exposes; the rest implement it with the official SDK for the repo's language. One reference per SDK holds the install line, registration code, and transport setup.

The official SDKs changed shape with the 2026-07-28 protocol revision (new package names, renamed classes, transport options moved). Code from older tutorials and from model memory often fails to import. Check each SDK's current docs before writing against it. On 2026-10-17, 2026-07-28 was still the latest revision, and the references record the SDK versions they were checked against.

## Steps

1. **Design the tool surface.** Read the existing tool table or the repo's design notes. If none exists and the server has more than a few tools or any write tool, or agents keep picking the wrong tool, read [tool design](references/tool-design.md) and write the design first: 5 to 15 workflow tools rather than endpoint mirrors, descriptions written for tool selection, one risk tier and safeguards per write tool ([write safety](references/write-safety.md)), the transport and auth posture, and golden prompts. Stop there when the request is only a design.
2. **Pick the SDK.** Use the repo's existing language. For a new server with no constraint, pick the language the server's backing code already uses. Read the matching reference:
   - [TypeScript](references/typescript.md): read when the project is Node, Bun, Deno, or a web-standard runtime.
   - [Python](references/python.md): read when the project is Python.
   - [Go](references/go.md): read when the project is Go.
   - [Rust](references/rust.md): read when the project is Rust.

   Use an official SDK because it handles protocol negotiation, schema validation, and transport framing. A hand-rolled server tends to miss one of those, and the gaps compound.
3. **Define schemas first.** Write each tool's input type (and output type when callers parse results) before the handler. The SDKs derive the JSON Schema from the types, validate arguments before your handler runs, and advertise the schema to clients. Don't re-validate what the schema already guarantees, but do add bounds (length, range, enum) in the schema.
4. **Keep server logic independent of transport.** Build the server in a factory function that registers tools, resources, and prompts, and attach a transport in the entry point. The same factory then serves stdio, HTTP, and in-process tests. For HTTP, the 2026-07-28 revision serves each request statelessly. The TypeScript and Rust SDKs call the factory per request, the Python server object is built once at module level and its lifespan runs once, and the Go handler's getter can return a shared server or build one per request. Create connection pools and caches once at module scope and capture them in the factory.
5. **Choose the transport.**
   - **stdio** for a server a client launches as a child process. The server owns no port and takes credentials from its environment.
   - **Streamable HTTP** for a shared or hosted server: one endpoint (conventionally `/mcp`) that accepts POST. Bind to `127.0.0.1` unless you front it with a proxy. Some SDK HTTP handlers (the TypeScript one, for example) neither authenticate nor check `Host` and `Origin`, so put token validation and those checks in front. The spec requires the Origin check against DNS rebinding.
   - Don't start new work on the legacy HTTP+SSE transport. It is deprecated, and the Rust SDK ships no implementation of it.
6. **Keep stdout clean on stdio.** stdout carries the protocol, so a stray print corrupts the stream and the client reports a parse error or hangs. Send logs, banners, and tracing to stderr. Configure the logging library's writer explicitly, because several default to stdout.
7. **Return errors the model can use.** A failure the model can fix (bad title, upstream timeout, no match) is a tool result with `isError: true` and a clear message. A malformed request or a server fault is a protocol error. Each SDK has its own split, listed in its reference. Never return an error message as ordinary success text, because the model and the client UI then treat it as the answer. Don't leak stack traces or internal paths in either form.
8. **Make tools safe to retry.** Prefer idempotent tools, accept an idempotency key on writes, and keep state in your own store under an explicit handle that a tool returns, since there is no protocol session to hold it. Apply the safeguards the design assigns to each risk tier.
9. **Pin versions.** Pin the SDK in the lock file and read its release notes on upgrade. The TypeScript (2.x), Python (2.x), and Rust (3.x) SDKs have all had recent breaking major releases, and a floating range would pick one up silently.
10. **Test it.**
    - Call tools in-process through the SDK's client or test helper. Assert on `tools/list` (names, schemas) as well as results, so a description or schema change shows up as a diff.
    - Exercise the failure paths: invalid arguments, a missing record, an upstream error. Assert that `isError` is set and the message is readable.
    - Run the server under the MCP Inspector. Its CLI mode scripts one request per run:

      ```bash
      npx @modelcontextprotocol/inspector@2.11.0 --cli <command> <args> --method tools/list
      ```

      Inspector 2.11.0 needs Node 22.19 or later, which is newer than the TypeScript SDK's Node 20 minimum. Add `--format json` to parse the output, and note that a `tools/call` that returns `isError: true` exits with code 5. Run it only against a server you own, and use the web UI (omit `--cli`) to explore.
    - To try the server in Claude Code, `claude mcp add <name> -- <command> <args>` registers a stdio server and `claude mcp add --transport http <name> <url>` registers an HTTP one. Both write Claude Code settings, so ask first. Packaging a server inside a plugin is `plugin-dev:mcp-integration`, if installed.
11. **Hand off.** Run `mcp-server-review` (if installed) before release.

## Optional: interactive UI

MCP Apps lets a tool return an interactive HTML view. Read [MCP Apps](references/mcp-apps.md) only when text and structured output cannot carry the job.

## Sources

- <https://modelcontextprotocol.io/docs/2026-07-28/sdk> (official SDK list and tiers)
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports> (stdio, Streamable HTTP)
- <https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli> (Inspector CLI, exit codes)
- Per-language and design sources are listed in each reference.
