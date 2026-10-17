# microsoft/skills

Source: https://github.com/microsoft/skills · License: MIT (Copyright Microsoft Corporation) · Last commit: 2026-10-16 (`8850874`, merge of #478 `sync/copilot-for-azure`) · Catalog: [catalog.md](catalog.md)

## Purpose

"Skills, custom agents, AGENTS.md templates, and MCP configurations for AI coding agents working with Azure SDKs and Microsoft AI Foundry." Most skills are SDK grounding sheets: install, client construction, current API shapes and DI registration for one Azure library in one language. The README marks the repo "Work in Progress" and itself warns against loading all skills at once ("context rot"). It claims 175 skills: Core 11, Foundry 11, Python 39, .NET 28, TypeScript 25, Java 25, Rust 7.

## Layout

- `.claude-plugin/marketplace.json`: marketplace named `skills`, 13 plugins (deep-wiki, azure, azure-sdk-python, azure-sdk-dotnet, azure-sdk-typescript, azure-sdk-java, azure-sdk-rust, azure-kusto-graph-skills, azure-local-skills, foundry-iq-skills, azure-cost, aks-skills, azure-advisor).
- `.github/plugins/<plugin>/skills/<name>/SKILL.md`: the canonical skill tree, 15 plugin directories (`microsoft-365-agents-toolkit` and `microsoft-foundry` are not in the marketplace).
- `.github/skills/`: mostly symlinks into the plugin tree, for Copilot's discovery path.
- `.github/agents/`: Copilot agents (backend, frontend, infrastructure, planner, presenter, scaffolder).
- `.github/prompts/`, `hooks/continual-learning/` (a Copilot-format hooks file that runs `learn.sh` on session start, every tool use and session end), `docs-site/`, `tests/` (eval scenarios and a Copilot SDK test harness).

## Counts

- 1 marketplace, 13 listed plugins (15 on disk).
- 212 SKILL.md files including nested sub-skills (README: 175).
- 9 agents, 18 prompts, 1 hooks file (the catalog's second "hooks.json" is docs-site data).

## Themes

| Theme | Skills |
|---|---|
| Azure SDK grounding per language | azure-sdk-python (39), azure-sdk-dotnet (29), azure-sdk-typescript, azure-sdk-java, azure-sdk-rust |
| Azure operations | azure (Copilot for Azure sync), azure-cost, azure-advisor, aks-skills, azure-local-skills, azure-kusto-graph-skills |
| Foundry and AI | foundry-iq-skills, microsoft-foundry, microsoft-365-agents-toolkit |
| General | deep-wiki, mcp-builder (with a C# section) |

The 29 .NET skills: AI (azure-ai-agents-persistent, azure-ai-document-intelligence, azure-ai-openai, azure-ai-projects, azure-ai-voicelive, m365-agents), messaging (azure-eventgrid, azure-eventhub, azure-servicebus), core (azure-identity, azure-security-keyvault-keys, azure-search-documents, azure-maps-search, webjobs authentication events) and 15 ARM management libraries (azure-mgmt-*, azure-resource-manager-*).

## Install / use

```bash
npx skills add microsoft/skills            # wizard; copies into the agent's skills dir
/plugin marketplace add microsoft/skills   # Claude Code; then /plugin install <plugin>@skills
```

Manual copy or symlink of single skill folders is also documented.

## Highlights

- `.github/plugins/azure-sdk-dotnet/skills/azure-identity-dotnet/`: current credential guidance (`ManagedIdentityCredential(ManagedIdentityId.SystemAssigned)`, credential-chain docs).
- `.github/plugins/azure-sdk-dotnet/skills/azure-servicebus-dotnet/`, `azure-ai-openai-dotnet/`: representative grounding sheets with `Microsoft.Extensions.Azure` registration.
- `hooks/continual-learning/`: an example of a Copilot hooks file that persists learnings across sessions.

## Quality notes

- The .NET sheets are accurate and current (237 to 505 lines each), but every one is Azure-SDK-specific. None covers general C# or .NET.
- The 15 ARM management skills add little over the SDK reference docs.
- Plugins are large (azure-sdk-dotnet lists 29 skills), so installing one adds many listing entries.
- The repo is a shallow clone here (one commit); the history was not reviewed.

## Relevance to adminhead

- Nothing to port for the .NET plugins (see the dotnet design). If a project uses Azure SDKs, install `azure-sdk-dotnet@skills` (or a single copied skill) directly at project scope; it is not allowlisted and should not become a dependency.
- `azure-identity-dotnet` is the only candidate for a short DefaultAzureCredential note if a .NET hosting or config skill ever needs one.
