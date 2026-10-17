---
name: recommend-plugins
description: Inspects the current project, proposes the adminhead meta plugins, bundles and focused plugins that fit it from the live catalog, and installs the ones you confirm at local or project scope. Manual command.
disable-model-invocation: true
argument-hint: "[local|project]"
allowed-tools: Bash(claude plugin list *) Bash(claude plugin marketplace list *)
---

# Recommend plugins

Propose adminhead plugins for this project, each with a one-line reason, and install only what the user confirms. Installs go through the normal permission flow. The live catalog is the only source of plugin names: never propose a name you didn't read from it in this run.

## 1. Target and scope

The target is the session's launch directory, where Claude Code binds project and local installs. If its path contains `.claude/worktrees/`, stop and tell the user to run this from the main checkout.

The scope is `$ARGUMENTS` (`local` or `project`), default `local`. Say which settings file will change: `.claude/settings.local.json` (gitignored) for local, `.claude/settings.json` (committed) for project.

## 2. Read the catalog

1. Find `adminhead` in `claude plugin marketplace list --json`. If it isn't registered, stop and give the add command: `claude plugin marketplace add Adminhead/claude-plugins` (or a local clone path).
2. Read `<installLocation>/.claude-plugin/marketplace.json` for each plugin's `name`, `description`, `category` and `source`. Then read `<installLocation>/<source>/.claude-plugin/plugin.json` for its `dependencies`: a bare string is an adminhead plugin, an object `{"name", "marketplace"}` is a cross-marketplace dependency.
3. If the target is a clone of this marketplace, the `README.md` table between `<!-- catalog:start -->` and `<!-- catalog:end -->` gives the same data grouped into meta plugins, core bundles and focused plugins. Prefer the installed marketplace when the two disagree; it is what `install` resolves against.

Don't use `claude plugin list --available`, which omits installed plugins.

Sort the catalog into four kinds:

- **Meta plugins** (`baseline`, the `*-meta` plugins): deps-only sets. Their dependency lists say what they install.
- **Core bundles** (`*-core`, described as a core bundle): deps-only sets that metas list. Propose a bundle on its own only when no meta that lists it fits.
- **Focused plugins**: everything else; each ships one skill, agent, hook config or MCP server.
- **Cross-marketplace dependencies**: entries with a `marketplace` other than `adminhead` (for example LSP plugins from `claude-code-lsps`). They install with the plugin that lists them; never propose them separately.

## 3. Inventory

Run `claude plugin list --json`. A plugin is effective here if it is installed at user scope, or at project or local scope with `projectPath` equal to the target.

- Expand each effective meta and bundle through its dependency list. Skip every plugin already effective, directly or through a set.
- Report disabled ones and suggest `claude plugin enable <id> --scope <scope>`.
- Flag official LSP plugins (`pyright-lsp`, `gopls-lsp`, `typescript-lsp` and similar from `claude-plugins-official`) that would duplicate an LSP a proposed meta installs. Don't remove them.
- Report an effective plugin whose dependency isn't installed at a scope that covers it, and offer to install the missing one.

## 4. Inspect the project

List files with `git ls-files --cached --others --exclude-standard`, or outside git `fd --type f --max-depth 4`. Read `package.json`, `pyproject.toml`, `go.mod` and `Cargo.toml` for framework and library markers. Discount `node_modules`, `vendor`, `examples`, `fixtures` and `testdata`.

Markers are hints; the catalog descriptions decide which plugin fits.

| Evidence | Area to look for in the catalog |
| --- | --- |
| `pyproject.toml`, `requirements*.txt`, `setup.py` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `package.json`, `tsconfig.json` | Node.js and TypeScript; web front end when React, Vue, Vite or similar is a dependency |
| Design tokens, Figma links, component libraries, UI-only repos | design |
| `*.tf`, Ansible playbooks, Dockerfiles, many `*.sh` | infrastructure as code |
| Kubernetes manifests, Helm charts, Argo CD or Flux config | Kubernetes |
| `.github/workflows`, `.github/dependabot.yml`, GitHub remote | GitHub workflows |
| Migrations, `schema.sql`, Prisma, an ORM | databases |
| OpenAPI, `.proto`, GraphQL schemas | API design |
| Sentry, Prometheus, Grafana, OpenTelemetry | observability |
| MCP SDK dependency | MCP servers |
| Auth libraries, secrets handling, crypto | auth or security |
| CDK, SAM, AWS SDK | AWS |
| `.pre-commit-config.yaml`, `devenv.nix`, `.chezmoi*` | repo tooling |

Prefer a meta over its members: when a meta matches, propose the meta and list only focused plugins it doesn't already cover. Propose `orchestration-meta` only when the user asks for orchestrated or multi-agent sessions.

## 5. User-scope suggestions

These are never installed at local or project scope. Mention each once, with its command, only if it isn't already effective:

- `baseline` is the user-scope default set: `claude plugin install baseline@adminhead --scope user`.
- `avoid-ai-writing` is a direct upstream install, not an adminhead plugin: `claude plugin marketplace add conorbronsdon/avoid-ai-writing`, then `claude plugin install avoid-ai-writing@conorbronsdon-skills --scope user`.

## 6. Confirm

Rank matches by evidence. With zero matches, say "nothing to add" and stop.

Ask with AskUserQuestion, multiSelect, at most 4 options per question and 4 questions. Each label is the plugin name. Each description is a one-line reason citing the evidence path, and for a meta, what it installs. If matches exceed 16, list the rest in text. If nothing is selected or the user cancels, change nothing.

## 7. Install

1. If a selected plugin, or any set it pulls in, depends on another marketplace that `claude plugin marketplace list --json` doesn't show, say which before installing and give the add command (`claude plugin marketplace add boostvolt/claude-code-lsps` for `claude-code-lsps`). Never add a marketplace yourself. Ask whether to install anyway or wait.
2. From the target directory, run `claude plugin install <p>@adminhead --scope <s>` for each selection. Dependencies install automatically at the same scope and stay marked as dependencies, so `claude plugin prune` can remove them later. Don't install them by hand.

## 8. Report

Read back `claude plugin list --json`. Report each selected plugin and its dependencies as installed or failed, with the CLI message, and tell the user to run `/reload-plugins`.

For project scope, say that `.claude/settings.json` changed and should be committed deliberately, and that collaborators need the `adminhead` marketplace (and any cross-marketplace one a meta uses).
