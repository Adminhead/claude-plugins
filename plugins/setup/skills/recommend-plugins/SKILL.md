---
name: recommend-plugins
description: Inspect the current project and propose the adminhead plugins that fit it, then install the ones you confirm at local or project scope. Manual command (/setup:recommend-plugins).
disable-model-invocation: true
argument-hint: "[local|project]"
allowed-tools: Bash(claude plugin list *), Bash(claude plugin marketplace list *)
---

# Recommend plugins

Propose adminhead plugins for this project, each with a one-line reason, and install only what the user confirms. Installs go through the normal permission flow.

## 1. Target

The target is the session's launch directory, where Claude Code binds project and local installs. If its path contains `.claude/worktrees/`, stop and tell the user to run this from the main checkout.

The scope is `$ARGUMENTS` (`local` or `project`), default `local`. Say which settings file will change: `.claude/settings.local.json` (gitignored) for local, `.claude/settings.json` (committed) for project.

## 2. Catalog

Find `adminhead` in `claude plugin marketplace list --json` and read `<installLocation>/.claude-plugin/marketplace.json` for each plugin's name, description, and `dependencies`. If `adminhead` isn't registered, stop and point to `scripts/install.sh` or `claude plugin marketplace add <clone>`. Don't use `claude plugin list --available`, which omits installed plugins. The catalog is the only source of plugin names.

## 3. Inventory

Run `claude plugin list --json` across all marketplaces. A plugin is effective here if it is installed at user scope, or at project or local scope with `projectPath` equal to the target.

- Skip effective adminhead plugins.
- Report disabled ones and suggest `claude plugin enable`.
- Flag official `gopls-lsp`, `pyright-lsp` and `typescript-lsp` that would duplicate a proposed language plugin. Don't remove them.
- Offer to repair an installed `coding-<lang>` whose LSP dependency isn't installed at the same scope.

## 4. Inspect

List files with `git ls-files --cached --others --exclude-standard`, or outside git `fd --type f --max-depth 4`. Read `package.json` and `pyproject` dependencies for framework markers. Discount `node_modules`, `vendor`, `examples`, `fixtures` and `testdata`.

Markers are hints. The catalog descriptions decide which plugin fits.

- `go.mod`: coding-go
- `pyproject`, `requirements*`: coding-python
- `package.json`, `tsconfig`: coding-js, plus web for React, Vue or Vite
- `Cargo.toml`: coding-rust
- `*.sh`: coding-shell
- `sdkconfig`, `idf_component.yml`: coding-esp
- Terraform, OpenTofu (`*.tf`) or Ansible: infra
- Dockerfile, Kubernetes manifests, Helm charts, Argo CD or Flux config: deploy
- VLAN, WireGuard, router or DNS config for a home network: homelab
- `.github/workflows`, `.github/dependabot.yml`: github-admin
- Sentry config or `@sentry/*`: sentry-core
- `devenv.nix`: devenv
- `.chezmoi*`: chezmoi
- migrations, `schema.sql`, Prisma: db
- auth libraries: auth
- security-sensitive code (secrets, crypto, input parsing): security
- test runner config or test files: testing
- OpenAPI, proto, GraphQL: api
- Prometheus or Grafana: observability
- `.pre-commit-config`, `.editorconfig`: tooling
- MCP SDK: mcp
- CDK or SAM: aws

Never propose `baseline`, `crew`, `coremods` or `example`. `baseline` is the user-scope default set (`scripts/install.sh` installs it with its members), and the others are user-scope or template plugins, not per-project ones.

## 5. Confirm

Rank matches by evidence. With zero matches, say "nothing to add" and stop.

Ask with AskUserQuestion, multiSelect, at most 4 options per question and 4 questions. Each label is the plugin name. Each description is a one-line reason citing the evidence path. If matches exceed 16, list the rest in text. If nothing is selected or the user cancels, change nothing.

## 6. Install

From the target directory, run `claude plugin install <p>@adminhead --scope <s>` for each selection. Then install each of its `dependencies` as `<dep>@<marketplace> --scope <s>`, so `prune` keeps them. If `claude-code-lsps` isn't registered, skip those and tell the user how to add it. Never add a third-party marketplace yourself.

## 7. Report

Read back `claude plugin list --json`. Report each plugin as installed or failed, with the CLI message, and tell the user to run `/reload-plugins`.

For project scope, say that `.claude/settings.json` changed and should be committed deliberately, and that collaborators need the `adminhead` marketplace.
