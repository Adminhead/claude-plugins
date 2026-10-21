# gradle-skills

Source: https://github.com/gradle/gradle-skills · License: Apache-2.0 · Last commit: 2026-09-30 (`86e4ee5`, "Repository errata (#29)"; pinned for the paired evals) · Catalog: [catalog.md](catalog.md)

## Purpose

Gradle's official skills for coding agents, in the Agent Skills format. Two skills: `gradle-best-practices` audits a build against the official Gradle best practices and reports findings ordered by impact, applying fixes only when asked; `gradle-wrapper-upgrade` upgrades an existing Gradle wrapper with a checksum pin and a configure check, rolling back to a smaller step when the build breaks. Each skill ships benchmark results under `evals/`.

## Layout

- `.claude-plugin/marketplace.json`: the `gradle-skills` marketplace, one plugin of the same name with `"source": "./"`.
- `skills/<name>/`: `SKILL.md`, `metadata.json` and `references/`.
- `evals/<name>/`: benchmark write-ups per skill version.
- No agents, commands, hooks, MCP servers or LSP declarations.

## Counts

- 1 marketplace, 1 plugin, 2 skills, nothing else.

## Use in this marketplace

`java-meta` depends on the `gradle-skills` marketplace (`gradle/gradle-skills`), which the settings examples and the install script register. The skills are upstream and are not copied into `plugins/`.
