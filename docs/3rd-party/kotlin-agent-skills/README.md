# kotlin-agent-skills

Source: https://github.com/Kotlin/kotlin-agent-skills · License: Apache-2.0 · Last commit: 2026-10-20 (`087f5689`, "Add support for Kotlin documentation MCP server and update plugin version to 1.1.0"; pinned for the port) · Catalog: [catalog.md](catalog.md)

## Purpose

JetBrains' incubator collection of Agent Skills for Kotlin projects. Ten skills, nine in the `tooling` category (Java-to-Kotlin conversion, AGP 9 migration, native build performance, CocoaPods and SPM migration, and Kotlin Toolchain authoring and migration) and one in `backend` (JPA entity mapping). Naming convention: `kotlin-<category>-<functional-name>`.

## Layout

- `skills/<name>/`: `SKILL.md` with frontmatter, plus `references/` where present.
- `plugins/kotlin-agent-skills/`: the Claude Code and Codex plugin that wraps the skills. Its manifest also enables the Kotlin documentation MCP server (`https://mcp.kotlinlang.org/mcp`).
- `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`: marketplace and plugin manifests at the root.
- `CATEGORIES/`, `CONTRIBUTING.md`, `.github/`: contribution and category rules.
- No agents, commands or hooks.

## Counts

- 1 marketplace, 1 plugin (Claude and Codex manifests), 10 skills.

## Quality notes

- Skill count is small but the skills are specific and version-aware (AGP 9, Kotlin Toolchain, immutable collections 0.5.x migration).
- The MCP server in the plugin manifest is upstream's and is not part of the skills. Ports must not carry it.
- Incubator status: upstream says it is an incubator, so the skills may change shape.

## Use in this marketplace

Port source for the Kotlin leaves in `docs/plans/android-meta.md`. Nothing in `plugins/` installs these skills directly. The clone is pinned at `087f5689` for the port; `3rd-party/kotlin-agent-skills` is gitignored.
