---
name: manage-agent-instructions
description: Create, restructure, prune, or reconcile a repo's agent instruction files (CLAUDE.md, nested CLAUDE.md, .claude/rules/, CLAUDE.local.md, AGENTS.md) from verified repo evidence. Use when setting up or reorganizing project instructions, deciding root vs nested vs path-scoped rules, making CLAUDE.md and AGENTS.md coexist, or removing stale guidance. Not for a quick CLAUDE.md quality audit (claude-md-management:claude-md-improver, if installed) capturing session learnings (claude-md-management:revise-claude-md, if installed), or auditing the whole Claude Code setup for bloat (authoring:config-audit).
---

# Manage Agent Instructions

Produce a small, accurate instruction hierarchy that helps an agent work safely in the relevant paths. This is instruction maintenance, not a project overview and not an implementation change.

## How Claude Code loads instructions

Read `references/loading.md` before deciding placement or AGENTS.md handling. In short:

- `CLAUDE.md` (or `.claude/CLAUDE.md`) and `CLAUDE.local.md` load from the working directory and every ancestor at launch. Files in subdirectories load when Claude first reads a file there.
- `.claude/rules/*.md` without `paths:` loads at launch; with `paths:` globs, a rule loads only when Claude touches matching files.
- `@path` imports expand at launch (relative to the importing file, up to four hops deep). They organize but don't reduce context cost.
- By default Claude reads `AGENTS.md` only when no `CLAUDE.md` or `CLAUDE.local.md` exists in the working directory or above. A `CLAUDE.md` that starts with `@AGENTS.md` shares one file across tools and works in every session.
- All loaded files are concatenated, not overridden. Contradictions get resolved arbitrarily.

## Rules

- Gather repo evidence before writing. Don't infer commands, versions, ownership, or conventions from filenames alone.
- Preserve human-authored intent. Edit narrowly, and never replace a file wholesale or "sync" parallel files just because they differ.
- Keep the root file a concise map of shared constraints; target under 200 lines per file. Use a nested file or a path-scoped rule only for a real local difference.
- Put multi-step procedures in a skill (`authoring:create-skill`) and must-always-happen actions in a hook (the `update-config` skill), not in CLAUDE.md prose.
- Mark facts you couldn't verify as `UNCONFIRMED: <fact>; verify with <source or owner>`.
- When instructions conflict and authority is unclear, stop before a destructive edit and ask the owner.

## Workflow

1. **Discover.** Establish the target paths and the allowed write boundary. Find every instruction source in and above them: `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/`, `AGENTS.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, and CONTRIBUTING. Also find the config that backs claimed commands: package scripts, Makefile/justfile, CI workflows, devenv or flake files. Read the existing guidance before drafting. Delegate a wide sweep to an Explore subagent if the repo is large.

2. **Build an evidence ledger.** For each proposed rule or command, record its source path and line, the scope it applies to, and whether it is verified or `UNCONFIRMED`. Read `references/content-and-structure.md` when deciding what belongs in a file and how to phrase it.

3. **Decide the hierarchy.** Choose the fewest files that stay clear:
   - Root `CLAUDE.md` holds navigation, shared invariants, verified workflows, and pointers.
   - A nested `CLAUDE.md` or a `paths:`-scoped rule holds guidance for a subtree or file type that materially differs.
   - `CLAUDE.local.md` (gitignored) holds personal, uncommitted preferences.
   - When the repo also serves other agents, decide how `AGENTS.md` and `CLAUDE.md` relate. Read `references/hierarchy-and-maintenance.md` for the AGENTS.md patterns, nested-file criteria, reconciliation, and pruning.

4. **Draft or update narrowly.** Keep existing wording, headings, and local detail where they're still true. Make the smallest change that adds, corrects, moves, or removes a verified instruction. Include exact commands only when their source and working directory are verified. Don't add generated dates, technology inventories, directory listings Claude can derive, or generic coding advice. Use `<!-- … -->` block comments for maintainer-only notes, since Claude Code strips them from context.
   - When the repo repeats an agent mistake, or a high-risk rule has no check, read `references/enforcement-and-failure-memory.md` and move the rule into a script, hook, or CI check, with a failure note when one is warranted.
   - When rewording instructions, read `${CLAUDE_PLUGIN_ROOT}/skills/create-skill/references/writing-for-agents.md` for pointer wording, emphasis, and pruning.

5. **Reconcile overlaps.** Compare files rule by rule only where scopes overlap. Classify each overlap as compatible, complementary, duplicated, stale, or conflicting, and handle it as the hierarchy reference describes.

6. **Verify.** Re-read every changed file and every link or `@import` target. Run documented commands only when they're safe (no destructive, production, credential, or network side effects) and confirm the claimed result from real output. Otherwise mark them `UNCONFIRMED`. Check the diff for unrelated changes to human-authored text. Suggest the user run `/context` or `/memory` in a fresh session to confirm which files load.

7. **Report.** List changed files, the chosen hierarchy and why, `UNCONFIRMED` facts, and any conflict that needs a human decision.
