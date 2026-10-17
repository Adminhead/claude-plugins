# Fetching and scanning a tool surface

Each command below starts the server (stdio) or contacts it (remote). Get consent per server, and run untrusted stdio servers in a disposable container or VM with no credentials or home directory mounted.

## MCP Inspector CLI (no account, nothing uploaded)

Checked 2026-10-17 against `@modelcontextprotocol/inspector` 2.11.0 (Node 22.19 or later) and its CLI docs.

```bash
# stdio: the positional words are the command to spawn. Put -- before any argument
# meant for the server (such as a server's own --flag), or the Inspector parses it.
npx @modelcontextprotocol/inspector@2.11.0 --cli node build/index.js --method tools/list --format json > tools.json

# Remote Streamable HTTP; --stored-auth-only stops it from starting an OAuth flow on 401
npx @modelcontextprotocol/inspector@2.11.0 --cli https://host.example/mcp --transport http \
  --stored-auth-only --method tools/list --format json > tools.json

# A server straight from a config file (an .mcp.json-shaped file)
npx @modelcontextprotocol/inspector@2.11.0 --cli --config ./.mcp.json --server notes-sync \
  --method tools/list --format json > tools.json
```

Also list `prompts/list` and `resources/list` (same flags, different `--method`): prompt and resource text reaches the model too, and the bundled checker reads any JSON with a `tools` array, so check those by eye. Pass env vars with `-e NAME=value` only for a test credential.

Exit codes worth branching on: 3 authentication required, 4 unreachable. On a non-zero exit the CLI writes one JSON error line to stderr.

## Snyk Agent Scan (formerly Invariant Labs `mcp-scan`)

Invariant Labs' `mcp-scan` was renamed when Invariant became part of Snyk. The PyPI package and CLI are now `snyk-agent-scan` (repo `github.com/snyk/agent-scan`); `mcp-scan` 0.4.3 on PyPI is only a redirect that installs it. Checked 2026-10-17 against `snyk-agent-scan` 0.6.8 and its README and CLI reference.

What changed from the old `mcp-scan` the upstream skill described:

- `scan` (the default command) needs a Snyk account and `SNYK_TOKEN`, and sends tool names and descriptions, server config and signatures, and skill text to Snyk's analysis API, after redacting secrets. Get the user's agreement before running it.
- `inspect` lists servers, tools, prompts, resources and skills locally with no analysis request.
- The runtime `proxy` mode and the tool-pinning (`whitelist`) commands of old `mcp-scan` are not in the current docs. Use `mcp_audit.py pin` / `verify` for rug-pull detection.
- It auto-discovers Claude Code (user, project and plugin servers and skills), Claude Desktop, Cursor, VS Code, Windsurf, Gemini CLI, Codex and others. Before contacting each discovered server it asks y/n in an interactive run. Never pass `--dangerously-run-mcp-servers` outside a sandbox: it skips that consent and starts every stdio server.
- v0.6 reports scored risk indicators (`prompt_injection_tool_desc`, `untrusted_content`, `private_data`, `destructive_capabilities`, and skill risks); output fields are marked experimental, so don't gate CI on exact names.

```bash
# Local listing only (consent prompt per server)
uvx snyk-agent-scan@0.6.8 inspect .mcp.json

# Full analysis, after the user agrees to the upload
SNYK_TOKEN=... uvx snyk-agent-scan@0.6.8 scan --json .mcp.json > agent-scan.json

# Skip skills when only MCP servers are in scope
uvx snyk-agent-scan@0.6.8 scan --no-skills ~/.claude.json
```

Pin the version (it is a security tool fetched at run time). Scan state is kept in `~/.mcp-scan` unless `--storage-file` is set.

## Reading descriptions by eye

The bundled `mcp_audit.py scan` shows invisible characters as `<U+200B>` in its excerpts. When reading raw JSON yourself, look for:

- Imperative text aimed at the model rather than the user: "you must", "before using this tool", "always call X first", "do not mention".
- Pseudo-markup: `<IMPORTANT>`, `<system>`, fake "Note to assistant" sections, or text after many blank lines.
- Requests to read or pass files, keys or conversation content in a parameter (often a vague `note`, `context` or `metadata` field).
- Descriptions of other tools' behavior, or claims that this tool replaces another (shadowing).
- Zero-width, bidi-control or Unicode tag characters (U+E0000 to U+E007F), homoglyphs, base64 or hex blobs.
- A description far longer than the tool's job needs.
