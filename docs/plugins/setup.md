# setup

Setup skills: recommend and install the adminhead plugins that fit the current project.

The plugin ships one skill, `recommend-plugins`, which is a manual command. Run it from a project with `/setup:recommend-plugins [local|project]`. Claude doesn't start it on its own.

## What it does

1. Picks the target. The target is the directory the session started in. Run it from the main checkout: inside `.claude/worktrees/` the skill stops.
2. Reads the catalog. It finds `adminhead` in `claude plugin marketplace list --json` and reads `marketplace.json` from that install location. If `adminhead` isn't registered, it stops and points to `scripts/install.sh` or `claude plugin marketplace add <clone>`.
3. Reads what is already installed, from `claude plugin list --json`. A plugin counts as installed if it is at user scope, or at project or local scope for the target directory.
4. Inspects the project's files for markers, such as `go.mod`, `package.json`, `Dockerfile` or `.github/workflows`. Catalog descriptions decide which plugin fits a marker.
5. Asks which matches to install, one checkbox per plugin, with the evidence path as the reason.
6. Installs each selection at the chosen scope, plus its dependencies.
7. Reads the list back and reports each install. It then tells you to run `/reload-plugins`.

Nothing installs until you confirm.

## Scope

The scope is `local` by default. The argument picks the other one.

| Scope | Settings file | Effect |
| --- | --- | --- |
| `local` (default) | `.claude/settings.local.json`, gitignored | Only this checkout, for you |
| `project` | `.claude/settings.json`, committed | Every collaborator who has the `adminhead` marketplace |

For `project`, commit the settings change on purpose. Collaborators still need the marketplace.

## What it never proposes

- `crew`, which is a user-scope plugin for orchestrated sessions.
- `coremods`, which is user-scope.
- `example`, which is a template.

It also skips plugins that are already effective for the target, and it reports disabled ones. It suggests `claude plugin enable` for those and doesn't enable them itself.

## Language servers

Five `coding-<lang>` plugins depend on an LSP plugin from `claude-code-lsps`. The skill handles that in three ways:

- It flags official `gopls-lsp`, `pyright-lsp` and `typescript-lsp` plugins that would duplicate a proposed language plugin. It doesn't remove them.
- It offers to repair an installed `coding-<lang>` whose LSP dependency isn't installed at the same scope.
- It installs each dependency at the same scope as the plugin. If `claude-code-lsps` isn't registered, it skips those dependencies and tells you how to add the marketplace. It never adds a third-party marketplace itself.

## Install

```
claude plugin install setup@adminhead --scope user
```

## Limits

- The model does the detection, using the marker list in the skill. The confirm step catches a wrong match.
- It runs in the main session, because the question step needs an interactive prompt.
- With zero matches it says "nothing to add" and changes nothing.
