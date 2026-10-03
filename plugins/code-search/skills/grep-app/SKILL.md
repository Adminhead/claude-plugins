---
name: grep-app
description: Search public GitHub code with grep.app's searchGitHub MCP tool to see how real projects use an API, library option, config key, or error string. Use when you need real-world usage examples, want to know how others call or configure something, check whether a flag or API is actually used in the wild, or see how others hit or fix an exact error message. Not for library docs or API reference (`code-search:context7`), your own repo (`code-search:codegraph` or `code-search:ripgrep`), private repos, issues, or PRs (the github plugin's MCP server or `gh search code`, if installed), or broad cited research (efficient-core:research, if installed).
---

# grep.app

`mcp__plugin_code-search_grep-app__searchGitHub` searches literal code across about a million public GitHub repos. It returns matching snippets with repo and path. It does not cover all of GitHub and has no private code.

## When to use

- How an unfamiliar API is called in practice: `X(` call sites, which options get passed.
- How others hit or fix an exact error string.
- Config file patterns: GitHub Actions YAML, Dockerfile, tsconfig keys.
- Cross-library integration, where two libraries meet in one file.
- Checking that an API or flag is used in the wild before relying on it.

For anything else, route elsewhere: docs and API reference to `code-search:context7`, your own repo to `code-search:codegraph` or `code-search:ripgrep`, private code, issues, and PRs to the github plugin or `gh search code`, cited research to `efficient-core:research`.

## Parameters

| Name | Meaning |
|---|---|
| `query` | Required. A literal code pattern, not keywords or a question. |
| `useRegexp` | `true` treats `query` as a regex. Prefix `(?s)` to let it span lines. |
| `language` | String array, e.g. `["TypeScript","TSX"]`, `["Python"]`, `["YAML"]`. |
| `repo` | Partial match on `owner/name`, e.g. `"vercel/"`. |
| `path` | Partial match on file path, e.g. `"/route.ts"`. |
| `matchCase`, `matchWholeWords` | Booleans, both off by default. |

## How

- Search text that would appear in a file: `useState(`, `getServerSession(`, `uses: actions/checkout@`. A natural-language question returns nothing useful.
- Start narrow with `language` plus one distinctive token. Broaden only if results are thin.
- Use `repo` and `path` to aim at canonical projects or file types.
- Regex support is limited. Bounded repeats such as `{0,200}` are rejected. With `(?s)`, `.*` and `.*?` can run past the call you meant, so check that each hit matches where you expect.
- Each call returns about 10 files, not a total count. Narrow the query rather than paging.
- Read several results. Prefer well-maintained repos, and note that old code may use removed APIs.
- Check what you find against current docs before relying on it.

## Examples

How a Next.js route handler uses next-auth:

```json
{"query": "getServerSession(authOptions", "language": ["TypeScript"], "path": "/route.ts"}
```

Real `setup-node` caching in workflows:

```json
{"query": "cache: pnpm", "language": ["YAML"], "path": ".github/workflows"}
```

An exact error string:

```json
{"query": "Error: read ECONNRESET"}
```

A call that spans lines:

```json
{"query": "(?s)new QueryClient\\(\\{.*staleTime", "useRegexp": true, "language": ["TypeScript", "TSX"]}
```

## Cautions

- Results are public code of unknown quality, license, and age. Do not copy large blocks verbatim. Write your own, and cite repo and path when quoting.
- Queries go to a third-party service. Never put secrets, private code, or internal names in a query.
