# wshobson/agents

Source: https://github.com/wshobson/agents · License: MIT (external entries have their own) · Last commit: 2026-10-15 (`docs(developer-essentials): fix the reflog expiry comment...`) · Catalog: [catalog.md](catalog.md)

## Purpose

A large, multi-harness collection of Claude Code plugins, specialist subagents, skills and slash commands, grouped by domain (languages, DevOps, security, AI/ML, business, marketing). One Markdown source is published as a Claude Code plugin marketplace, and adapters generate artifacts for Codex CLI, Cursor, OpenCode, Antigravity CLI, GitHub Copilot and Pi. Maintained by Seth Hobson; widely copied across the ecosystem.

## Layout

```
.claude-plugin/marketplace.json   94 entries (name claude-code-workflows): 92 local + 2 external
plugins/<name>/                   one dir per plugin
  .claude-plugin/plugin.json      name, version, description, author, license
  agents/*.md                     subagents (frontmatter + prompt body)
  skills/<skill>/SKILL.md         progressive-disclosure reference material
  commands/*.md                   slash-command workflows (not in every plugin)
  hooks/hooks.json                only 2 plugins: protect-mcp, review-agent-governance
docs/                             plugins.md, agents.md, authoring.md, harnesses.md, plugin-eval.md, ...
tools/                            Python generators and adapters (catalog.py, adapters/); evals/ and tools/tests/ hold quality checks
AGENTS.md / CLAUDE.md             repo context (CLAUDE.md symlinks AGENTS.md)
Makefile                          make generate / validate / test / install-<harness>
```

Marketplace entries use relative `source` paths (`./plugins/<name>`). Two entries are external: `pensyve` (git-subdir, major7apps) and `hol-guard` (git-subdir, hashgraph-online, pinned sha).

## Counts

| Kind | Count |
|---|---:|
| Marketplace plugins | 94 (92 local, 2 external) |
| Agents (`plugins/*/agents/*.md`) | 202 |
| Skills (`SKILL.md`) | 185 |
| Commands | 105 |
| hooks.json files | 2 |

marketplace.json metadata says 181 skills; the README and catalog say 185 (use these).

## Plugin categories

Categories come from `category` in `marketplace.json`. Counts in parentheses.

| Category (n) | Plugins |
|---|---|
| languages (10) | python-development, javascript-typescript, systems-programming, jvm-languages, web-scripting, functional-programming, julia-development, arm-cortex-microcontrollers, shell-scripting, dotnet-contribution |
| workflows (8) | git-pr-workflows, operating-kit, full-stack-orchestration, tdd-workflows, conductor, superself, agent-teams, ship-mate |
| security (7) | security-scanning, security-compliance, backend-api-security, frontend-mobile-security, reverse-engineering, block-no-verify, hol-guard (external) |
| development (6) | debugging-toolkit, backend-development, frontend-mobile-development, multi-platform-apps, developer-essentials, ui-design |
| ai-ml (6) | llm-application-dev, llm-finetuning, agent-orchestration, context-management, machine-learning-ops, dgx-spark-ops |
| marketing (6) | seo-content-creation, seo-technical-optimization, seo-analysis-monitoring, content-marketing, social-publishing, hermes-tweet |
| documentation (5) | documentation-standards, code-documentation, documentation-generation, c4-architecture, avoid-ai-writing |
| utilities (5) | code-refactoring, dependency-management, error-debugging, team-collaboration, file-conversion |
| infrastructure (5) | deployment-strategies, deployment-validation, kubernetes-operations, cloud-infrastructure, cicd-automation |
| business (5) | business-analytics, startup-business-analyst, before-you-build, hr-legal-compliance, customer-sales-automation |
| operations (4) | incident-response, error-diagnostics, distributed-debugging, observability-monitoring |
| quality (4) | comprehensive-review, performance-testing-review, plugin-eval, skill-forge-essentials |
| creative (3) | meigen-ai-design, brand-landingpage, pptx-deck-creation |
| governance (3) | protect-mcp, signed-audit-trails, review-agent-governance |
| data (2) | data-engineering, data-validation-suite |
| performance (2) | application-performance, database-cloud-optimization |
| modernization (2) | framework-migration, codebase-cleanup |
| database (2) | database-design, database-migrations |
| api (2) | api-scaffolding, api-testing-observability |
| testing (1) | unit-testing |
| blockchain (1) | blockchain-web3 |
| finance (1) | quantitative-trading |
| payments (1) | payment-processing |
| gaming (1) | game-development |
| accessibility (1) | accessibility-compliance |
| memory (1, external) | pensyve |

## Agent conventions

Frontmatter on all 202 agents: `name`, `description`, `model`. Optional: `tools` (15 agents, explicit allowlist), `color` (9 agents).

- `name`: about half are prefixed with the plugin name (`security-scanning-security-auditor`, 102 of 202); the rest are short (`python-pro`, `c4-code`). Names are unique.
- `description`: one paragraph that names the specialty and ends with a trigger sentence, usually "Use PROACTIVELY for ..." (157 of 202). The description is what the harness uses for routing.
- `model` tier distribution: sonnet 70, opus 54, inherit 52, haiku 24, fable 2 (total 202). `inherit` means "use the parent session's model". Adapters map these aliases per harness.

Prompt structure (body, typically 30-360 lines, median ~156): an opening "You are a ... specializing in ..." line, then sections. Most common headings:

- `## Purpose` (108), `## Capabilities` (123), `## Behavioral Traits` (115), `## Knowledge Base` (101), `## Response Approach` (115), `## Example Interactions` (107, a bulleted list of sample user requests)
- Older/alternate template: `## Focus Areas`, `## Approach`, `## Output` (about 34 agents), or `## Workflow` / `## Output Format`.

Coordination agents (agent-teams: team-lead, team-debugger, team-implementer) declare `tools` explicitly, including TeamCreate/TaskCreate/SendMessage.

## Hooks

Two plugins ship identical `hooks/hooks.json` files (`protect-mcp` and `review-agent-governance`), each with:

- `PreToolUse` (matcher `.*`) runs `hooks/evaluate.sh`. The protect-mcp version runs `npx protect-mcp@0.31.1 evaluate` against a Cedar policy (`PROTECT_MCP_POLICY`, default `./protect.cedar`). With no policy file, every call is allowed. A missing `tool_name` fails closed (exit 2). Other evaluator errors are mapped to exit 2 because Claude Code treats other non-zero exits as non-blocking.
- `PostToolUse` (matcher `.*`) runs `hooks/sign.sh`, which appends an Ed25519-signed receipt for the tool name (`npx protect-mcp@0.7.4 sign`, receipts in `./receipts/`). It never blocks.

Both use `${CLAUDE_PLUGIN_ROOT}` paths and read the hook JSON from stdin. The review-agent-governance scripts were not read in detail.

## Install / use

From the README (Claude Code, run inside Claude Code):

```text
/plugin marketplace add wshobson/agents
/plugin install python-development@claude-code-workflows
```

Skills only (no agents, commands or hooks):

```bash
gh skill install wshobson/agents python-testing-patterns
npx skills add wshobson/agents --skill python-testing-patterns
```

Other harnesses from a clone: `make install-opencode`, `make install-antigravity`, `make install-copilot`, `make install-pi`. Codex: `codex plugin marketplace add wshobson/agents`.

## Highlights

- `3rd-party/wshobson-agents/.claude-plugin/marketplace.json` - the 94-entry marketplace; the source of the category table.
- `plugins/python-development/agents/python-pro.md` - opus agent with the full section template.
- `plugins/agent-teams/agents/team-lead.md` - orchestrator with explicit `tools` allowlist and `color`.
- `plugins/c4-architecture/agents/c4-code.md` - haiku-tier agent for a narrow documentation job.
- `plugins/security-scanning/agents/security-auditor.md` - long DevSecOps agent with PROACTIVELY trigger.
- `plugins/python-development/skills/python-testing-patterns/SKILL.md` - skill with "When to Use" list and numbered concepts.
- `plugins/protect-mcp/hooks/hooks.json` - PreToolUse/PostToolUse hook wiring.
- `plugins/protect-mcp/hooks/evaluate.sh` - fail-closed PreToolUse gate with explicit exit-code mapping.
- `plugins/protect-mcp/hooks/sign.sh` - PostToolUse signed-receipt writer.

## Quality notes

- Consistent, mature conventions: every agent has the same three frontmatter fields, and descriptions are specific enough to route on. Agent names are unique.
- Agent bodies are largely generic. Many follow the same template ("Expert X specializing in ..."), and the "Example Interactions" lists are one-line requests, not worked examples. Expect to tune them for your own stack.
- Model tiers are mixed (2 `fable`, 24 `haiku`), so check the tier on any agent you copy.
- Skills are solid reference material (median 151 lines, max 810), but many are long checklists. Only a few sampled skills (python-testing-patterns, uv-package-manager, attack-tree-construction, secrets-management) were read.
- Counts and docs drift: marketplace metadata says 181 skills and 92 plugins, while the README and catalog say 185 skills. The catalog is generated, so regenerate instead of hand-editing.

## Relevance to adminhead

- Cross-install candidate: yes, selectively. The skills-only route (`gh skill install` or `npx skills add`) gives reference skills without the plugin's agents or hooks. Full plugins are too broad to install wholesale (94 entries, many outside this marketplace's scope).
- Agent authoring: borrow the frontmatter shape (`name`, `description` with a PROACTIVELY trigger, explicit `model`, optional `tools` allowlist) and the Purpose/Capabilities/Behavioral Traits/Example Interactions body.
- Hooks: the protect-mcp `evaluate.sh` fail-closed pattern (exit 2 on missing input or evaluator error) is worth reusing; other non-zero exits are non-blocking.
- Do not copy generic agent bodies verbatim; reuse the routing and section layout.
