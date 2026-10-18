# grep-app

Adds [grep.app](https://grep.app)'s hosted MCP server, which searches code across about a million public GitHub repositories. It is a remote Streamable HTTP server at `https://mcp.grep.app` and needs no API key or account.

## Install

```
/plugin install grep-app --marketplace Adminhead/claude-plugins
```

## Tool

`mcp__plugin_grep-app_grep-app__searchGitHub` takes a literal code pattern, not keywords or a question (`getServerSession(`, `uses: actions/checkout@`), and returns matching snippets with repo and path, about 10 files per call.

| Parameter | Meaning |
| --- | --- |
| `query` | Required. Code text as it appears in a file. |
| `useRegexp` | Treat `query` as a regex; prefix `(?s)` to span lines. |
| `language` | Array such as `["TypeScript", "TSX"]`, `["Python"]`, `["YAML"]`. |
| `repo` | Partial `owner/name` match, e.g. `vercel/`. |
| `path` | Partial file path match, e.g. `/route.ts`. |
| `matchCase`, `matchWholeWords` | Booleans, off by default. |

Good uses: how an unfamiliar API is called in practice, how others hit or fix an exact error string, real config patterns (Actions YAML, Dockerfiles, tsconfig keys), and checking that a flag is used in the wild. The server's own tool description carries usage guidance, so there is no companion skill. Check what you find against current docs, since old code may use removed APIs.

Not for: private code, issues or PRs (`gh search code`), your own repository (codebase-memory or ripgrep), or library reference docs (the `context7` plugin, which `programming-core` installs).

## Privacy and trust

Queries go to grep.app. Don't search for secrets, internal hostnames or proprietary code fragments. The server is third-party and can change its tool description at any time; `mcp-server-audit` (if installed) can pin and re-check it.

Checked 2026-10-17: `initialize` and `tools/list` over HTTPS returned one tool, `searchGitHub`, with protocol version 2025-06-18.
