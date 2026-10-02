# How Claude Code loads instruction files

Read this before deciding where an instruction goes or how to handle `AGENTS.md`. Source: Claude Code memory docs (https://code.claude.com/docs/en/memory), checked 2026-09-30. Recheck when behavior seems off, since this area changes between versions.

## Locations and order

Files load broadest first, so more specific content appears later in context. Nothing overrides anything else; everything is concatenated.

| Scope | Location | Notes |
| --- | --- | --- |
| Managed | `/etc/claude-code/CLAUDE.md` (Linux) | Can't be excluded |
| User | `~/.claude/CLAUDE.md`, `~/.claude/rules/` | Every project |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md`, `.claude/rules/` | Committed and shared |
| Local | `./CLAUDE.local.md` | Personal; add to `.gitignore` |

- **Ancestors** of the working directory load at launch. Within one directory, `CLAUDE.local.md` comes after `CLAUDE.md`.
- **Subdirectory** `CLAUDE.md` files load on demand, the first time Claude reads a file in that directory.
- **Rules** in `.claude/rules/**/*.md` without frontmatter load at launch with `.claude/CLAUDE.md` priority. A rule with a `paths:` list of globs loads only when Claude reads a matching file. `paths` is the only frontmatter field rules support.
- **Block HTML comments** (`<!-- … -->`) are stripped before injection, except inside code blocks.
- **Size:** target under 200 lines per file; Claude Code warns at startup when a file or the combined set runs long.
- **Compaction:** the root `CLAUDE.md` is re-read after `/compact`; nested files and path rules reload when their files are touched again.
- **Monorepos:** `claudeMdExcludes` in settings skips other teams' files by glob.

## Imports

- `@path/to/file` anywhere outside code spans and fenced blocks imports that file at launch.
- Relative paths resolve from the importing file. Imports can nest up to four hops.
- Escape spaces with backslashes; a quoted path doesn't import.
- To mention a path without importing it, wrap it in backticks.
- A project file importing something outside the repo triggers a one-time approval dialog.
- Imports help organization but don't reduce context, because imported files load at launch. Use path-scoped rules to actually defer content.

## AGENTS.md

Claude Code v2.1.277+ can read `AGENTS.md` directly, through the built-in `agents-md` plugin.

| The repo has | Claude reads (default setting) |
| --- | --- |
| `AGENTS.md`, no `CLAUDE.md`/`CLAUDE.local.md` at or above the working directory | `AGENTS.md` |
| `AGENTS.md` and a `CLAUDE.md` or `CLAUDE.local.md` | Only the `CLAUDE.md` files |
| `CLAUDE.md` that imports `@AGENTS.md` | Both, through the import, never twice |

- `~/.claude/CLAUDE.md`, managed files, and `.claude/rules/` don't count for that check.
- Adding a `CLAUDE.local.md` silently stops `AGENTS.md` from loading under the default setting.
- The user can change this with `/config` → **Project instructions** (`claude-md-or-agents-md` by default, or `claude-md-and-agents-md`, `claude-md`, `managed-only`). The setting lives in user settings, not the repo, so don't rely on it for teammates.
- Not read: `AGENTS.local.md`, `AGENTS.override.md`, and anything under `.agents/`.
- Older versions, some provider setups, and sessions with the plugin disabled read `CLAUDE.md` only.

Because of those gaps, the robust shared-file pattern is a `CLAUDE.md` next to `AGENTS.md` that begins with `@AGENTS.md` and adds any Claude-specific notes below it. A `CLAUDE.md` symlink to `AGENTS.md` also works but breaks on Windows clones, and Edit/Write refuse to write through it. A `CLAUDE.md` that only says "read AGENTS.md" in words is unreliable; replace it with the import.

## Diagnostics

- `/context` and `/memory` list the files that actually loaded.
- `/doctor prompt-audit` looks for stale or conflicting instructions across CLAUDE.md, AGENTS.md, rules, and skills (v2.1.283+).
- The `InstructionsLoaded` hook can log what loads and why.
