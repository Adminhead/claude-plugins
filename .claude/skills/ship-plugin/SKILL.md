---
name: ship-plugin
description: Releases one plugin from this marketplace after a change. It validates the plugin, checks that its version, docs page, and README row agree, runs the plugin's own tests, commits to local main, and updates the installed copy. Use when a plugin change in this repo is done and should go live locally, or when the user says "ship <plugin>". Not for pushing (`github:ship`, only when the user asks) or for other repos.
argument-hint: "<plugin-name>"
---

# Ship a plugin

Run these steps in order for the plugin named in the argument. Stop at the first failure and report it with the command's output, because a later step can't fix an earlier one.

## 1. Validate

Run `claude plugin validate --strict plugins/<name>`, then `claude plugin validate --strict .`.

## 2. Check that the records agree

- The `version` in `plugins/<name>/.claude-plugin/plugin.json` matches the plugin's entry in `.claude-plugin/marketplace.json`.
- The version is higher than the published one (`git show origin/main:plugins/<name>/.claude-plugin/plugin.json`), or the plugin is new there. An unchanged version means installed copies won't update.
- `README.md` has a row for the plugin that links to its docs page. That page is `docs/plugins/<name>.md` or a family page shared with related plugins (such as `coding.md` or `github.md`).
- The linked page exists and names every skill under `plugins/<name>/skills/`.

Fix drift in these records yourself. Ask before changing anything else.

## 3. Run the plugin's tests

Run whichever exist, and report each result:

- `plugins/<name>/**/tests/check.sh`
- `pytest` for `plugins/<name>/**/tests/test_*.py`, through `uv run --with pytest pytest` when pytest isn't installed
- `claude plugin test plugins/<name>` when the plugin has `hooks/register.ts` or `register.tsx` (a mod)

New routing evals cost money, so mention them and run `claude plugin eval plugins/<name> --case <case> --trust-plugin` only when the user asks.

## 4. Commit

Commit the plugin's changes to local `main` following `git:commit` (if installed). Stage explicit paths.

## 5. Update the installed copy

The `adminhead` marketplace is a folder source pointing at this repo, so the local commit is enough. A push isn't needed.

1. `claude plugin marketplace update adminhead`
2. Find every install of the plugin in `~/.claude/plugins/installed_plugins.json`. One plugin can be installed at user scope and in several project or local scopes, and `claude plugin update` changes one scope per run.
3. For each install, run `claude plugin update <name>@adminhead --scope <scope>` from its project directory (any directory for user scope). Use `claude plugin install <name>@adminhead` when it isn't installed anywhere yet.

Then tell the user to run `/reload-plugins`.

## 6. Report

List the version shipped, the checks and their results, the commit, and whether the update succeeded. Push only when the user asks, through `github:ship` at push level.
