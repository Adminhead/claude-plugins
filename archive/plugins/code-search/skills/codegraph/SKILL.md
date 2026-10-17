---
name: codegraph
description: Understand or locate code through CodeGraph's prebuilt symbol graph, where one `codegraph_explore` call returns the relevant symbols' source plus the call paths between them. Use when asked how something works, where a symbol is defined or called, what a change would affect, or before editing unfamiliar symbols in a repo with a `.codegraph/` index. Not for literal text, regex, config, or Markdown searches (`code-search:ripgrep`), public GitHub code (`code-search:grep-app`), or library docs (`code-search:context7`).
---

# CodeGraph

CodeGraph keeps a SQLite graph of a repo's symbols, edges, and files in a `.codegraph/` directory. `codegraph_explore` answers a code question with the relevant symbols' verbatim source, the call paths between them, and a blast-radius summary. One call usually replaces a Grep and Read loop.

The tool may appear as `mcp__codegraph__codegraph_explore` (user-level server) or `mcp__plugin_code-search_codegraph__codegraph_explore` (this plugin). Use whichever is connected.

## When to use

- How something works, end to end.
- Where a symbol is defined, and what calls it.
- What a change would affect.
- Before editing unfamiliar symbols.

Use `rg` instead for literal text, regex, config files, Markdown, and any repo without an index, or while the index is still building. For library docs use `code-search:context7`. For public GitHub code use `code-search:grep-app`.

## How

- Always pass `projectPath`, the absolute path of the project or any directory inside it. CodeGraph uses the nearest `.codegraph/` at or above it.
- Query with symbol and file names, such as `OrderService saveOrder repository.ts`, or with a short question. Name the symbols that span the flow.
- Treat the returned source as already read. Do not open those files again.
- When the output carries a staleness banner, read the files it names directly. The index is behind for those files.
- A nested worktree resolves to the parent repo's index.

## CLI fallback

When the tools are not connected, the same output is available from the shell.

| Command | Result |
|---|---|
| `codegraph explore "<symbols or question>"` | Same as `codegraph_explore` |
| `codegraph node <name>` | One symbol's source plus caller and callee trail, or a file with line numbers |
| `codegraph status` | Whether an index exists and how fresh it is |

## Indexing

Do not run `codegraph init`, `index`, or `uninit` unless the user asks. This plugin's SessionStart hook indexes git repos in the background, so a new repo may have no index for the first minute. Use `rg` until `codegraph status` shows one.
