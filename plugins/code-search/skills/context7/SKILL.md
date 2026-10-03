---
name: context7
description: Look up current, version-specific documentation for a library, framework, SDK, or CLI with Context7's `resolve-library-id` and `query-docs` tools. Use when writing or fixing code against a specific library API, checking an option, config key, signature, or migration step, or when the installed version may be newer than training data. Not for real-world usage across public GitHub (`code-search:grep-app`), your own repo (`code-search:codegraph` or `code-search:ripgrep`), or broad cited research (`efficient-core:research`, if installed).
---

# Context7

Context7 serves current documentation and code snippets for a library, indexed by version. Two tools do the work: `resolve-library-id` turns a name into a Context7 ID, and `query-docs` returns documentation for an ID and a topic. The plugin's copy is `mcp__plugin_code-search_context7__resolve-library-id` and `mcp__plugin_code-search_context7__query-docs`.

If those tools are missing but another Context7 server is connected (the claude.ai connector, or a separately installed plugin), use its tools the same way.

## When to use

- Writing or fixing code against a library's API, where an option, signature, or default matters.
- Checking a config key or CLI flag.
- A migration step between major versions.
- The installed version may be newer than your training data.

For anything else, route elsewhere: how projects use something in practice to `code-search:grep-app`, your own repo to `code-search:codegraph` or `code-search:ripgrep`, broad cited research to `efficient-core:research`.

## How

1. Read the installed version from the lockfile or manifest (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, `go.mod`, `Cargo.lock`). Docs for the wrong major version mislead.
2. Skip `resolve-library-id` when you already know the ID. IDs look like `/vercel/next.js`. Add a version segment when the library has one, such as `/vercel/next.js/v15.1.8`.
3. Otherwise call `resolve-library-id` with the library name and your question. Pick the match with the closest name, the most snippets, and a high source reputation.
4. Call `query-docs` with the ID and one focused topic per query, such as "field_validator with mode=before". Run another query for another topic.
5. Check what comes back against the installed version. Note deprecations and renamed options.
6. Do not call either tool more than three times per question. If the answer is still missing, say so and fall back to the library's own docs site.

## Cautions

- Queries go to a third-party service. Never put secrets, private code, or internal names in a query.
- Docs are a snapshot of the indexed version. They can lag the newest release.
- An optional `CONTEXT7_API_KEY` in the environment raises rate limits. Without it the server answers anonymously.
