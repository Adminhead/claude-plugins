# claude-skills

Source: https://github.com/Jeffallan/claude-skills · License: MIT · Last commit: 2026-10-16 (`chore: release v0.4.20 (#260)`) · Catalog: [catalog.md](catalog.md)

## Purpose

A single Claude Code plugin, `fullstack-dev-skills` (v0.4.20), that bundles 67 role-based expert skills for full-stack work (languages, frameworks, infra, testing, security, data/ML) plus 10 project-workflow commands for epic planning, Jira execution and retrospectives. Skills are model-invoked: each `SKILL.md` description tells Claude when to load it.

## Layout

- `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` define one marketplace entry and one plugin.
- `skills/<name>/SKILL.md` (67 dirs): frontmatter (`name`, `description`, `metadata.triggers`, `related-skills`) plus a body with a core workflow, examples and constraints.
- `skills/<name>/references/*.md` (all 67 skills have one): deep-dive topic files loaded on demand (progressive disclosure).
- `commands/` : `common-ground/COMMAND.md`, `project/{discovery,planning,execution,retrospectives}/*.md` with `.yaml` manifests, `intake/*.yaml`, and `workflow-manifest.yaml`.
- `scripts/` (validate-skills.py, build-plugin-dist.sh, update-docs.py), `.github/workflows/` (ci, validate, release, publish-plugin), `site/` (Astro docs site), `docs/`, `assets/`.
- No executable code ships inside any skill directory: no `scripts/`, no non-Markdown files under `skills/`.

## Counts

| Item | Count |
|---|---|
| Plugins / marketplaces | 1 / 1 |
| Skills (`SKILL.md`) | 67 |
| Skill reference files | 371 (4 to 11 per skill) |
| Reference lines total | ~140k (per skill 321 to 5,648) |
| `SKILL.md` lines total | ~10.7k (typically 100 to 200 each) |
| Commands (runnable `.md`) | 10 (1 common-ground + 9 project) |
| Intake commands | 3, `.yaml` only, `status: planned` |

## Categories

Grouped by theme (my mapping; the repo has no official grouping beyond its README's rough language/framework split).

| Category | Count | Examples |
|---|---|---|
| Languages | 12 | python-pro, typescript-pro, golang-pro, rust-engineer, cpp-pro, sql-pro |
| Backend frameworks | 10 | nestjs-expert, django-expert, fastapi-expert, spring-boot-engineer, rails-expert |
| Frontend & mobile | 7 | react-expert, nextjs-developer, vue-expert, angular-architect, flutter-expert |
| Architecture & full-stack | 8 | fullstack-guardian, architecture-designer, api-designer, graphql-architect |
| Infrastructure & SRE | 7 | devops-engineer, kubernetes-specialist, terraform-engineer, sre-engineer |
| Data & AI | 7 | pandas-pro, spark-engineer, ml-pipeline, rag-architect, prompt-engineer |
| Databases | 2 | postgres-pro, database-optimizer |
| Testing & debugging | 4 | test-master, playwright-expert, debugging-wizard, code-reviewer |
| Security & docs | 4 | secure-code-guardian, security-reviewer, code-documenter, the-fool |
| Requirements | 1 | feature-forge |
| Platform & specialist | 5 | atlassian-mcp, cli-developer, game-developer, embedded-systems, salesforce-developer |

## Install / use

From the README Quick Start:

```bash
/plugin marketplace add jeffallan/claude-skills
/plugin install fullstack-dev-skills@fullstack-dev-skills
```

Skills then activate from the request text (the README example: "Implement JWT authentication in my NestJS API" activates NestJS Expert). Workflow commands need an Atlassian MCP server (`docs/ATLASSIAN_MCP_SETUP.md`).

## Highlights

- `skills/postgres-pro/SKILL.md` - EXPLAIN-driven tuning workflow with a worked slow-query example.
- `skills/postgres-pro/references/jsonb.md` - JSONB operators, indexing and pitfalls in SQL.
- `skills/react-expert/references/` - seven topic files (server components, hooks, state, testing, React 19).
- `skills/the-fool/SKILL.md` - structured devil's-advocate, pre-mortem and red-team modes with output templates.
- `skills/feature-forge/references/ears-syntax.md` - EARS requirement syntax and acceptance-criteria templates.
- `skills/spec-miner/SKILL.md` - reverse-engineering workflow for undocumented legacy code.
- `skills/test-master/SKILL.md` - strategy-to-report testing loop with flaky-test triage.
- `commands/project/execution/execute-ticket.md` - Jira ticket to implementation-plan execution phases.
- `commands/common-ground/COMMAND.md` - surfaces hidden assumptions for user confirmation (`--list`, `--check`, `--graph`).
- `scripts/validate-skills.py` - validates frontmatter and count consistency across skills.

## Quality notes

- Consistent structure: every skill has frontmatter, a "When to Use" section, a core workflow and a `references/` folder; progressive disclosure keeps `SKILL.md` short.
- Depth varies. Sampled bodies (postgres-pro, test-master, the-fool, feature-forge) are concrete and procedural, but the reference files are the heavy part (the large ones are migration guides).
- Skills are prose only: no bundled scripts or assets, so nothing here executes; the value is instructions.
- Documentation drift: the README says "6 frontend/mobile" and "12 language experts" but the counts above are 7 and 12; `intake:*` commands are planned, with no `.md` bodies yet.
- Version is 0.4.20 (pre-1.0), and the latest commit is one day old, so expect churn.
- CI and validators exist in the upstream repo; this local copy was not re-run.

## Relevance to adminhead

- Useful as a reference for skill authoring: the frontmatter fields and the `SKILL.md` plus `references/` split are a worked example of progressive disclosure.
- Candidate skills for plugin work in this marketplace: `python-pro`, `typescript-pro`, `test-master`, `the-fool` (plan and design critique).
- The workflow commands target Jira and Confluence, so they are unlikely to fit this repo unless Atlassian is in use.
- MIT licence allows vendoring with the copyright notice; keep it as a reference, not a dependency, since the marketplace itself has no skills-plugin slot.
