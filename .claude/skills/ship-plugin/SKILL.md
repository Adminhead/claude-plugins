---
name: ship-plugin
description: Releases one plugin from this marketplace after a change. It validates the plugin, runs the structure and catalog check, runs the plugin's own tests, commits to local main, and updates the installed copy, asking to push first when the marketplace is installed from GitHub. Use when a plugin change in this repo is done and should go live locally, or when the user says "ship <plugin>". Not for pushing on its own (`github:ship`, only when the user asks) or for other repos.
argument-hint: "<plugin-name>"
---

# Ship a plugin

Run these steps in order for the plugin named in the argument. Stop at the first failure and report it with the command's output, because a later step can't fix an earlier one.

## 1. Validate

Run `claude plugin validate --strict plugins/<name>`, then `claude plugin validate --strict .`.

## 2. Check that the records agree

- The `version` in `plugins/<name>/.claude-plugin/plugin.json` matches the plugin's entry in `.claude-plugin/marketplace.json`.
- The version is higher than the published one (`git show origin/main:plugins/<name>/.claude-plugin/plugin.json`), or the plugin is new there. An unchanged version means installed copies won't update.
- `python3 scripts/plugins.py check` passes. It checks the one-component and meta-plugin rules, the `plugin.json` and marketplace entry match, and the README catalog is current. Run `python3 scripts/plugins.py catalog` to regenerate a stale catalog.
- When the change added the plugin to a meta plugin, that meta plugin's version is bumped too, so installs pick up the new dependency.

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

First check where the `adminhead` marketplace reads from: `jq '.adminhead.source' ~/.claude/plugins/known_marketplaces.json`.

- **A folder source** (a local path to this repo): the local commit is enough.
- **A GitHub or git source** (`"source": "github"`, `"repo": "Adminhead/claude-plugins"`): the update reads the pushed `main`, so the commit must be on `origin/main` first. If `git log --oneline origin/main..main` lists commits, stop here. Report that the update needs a push and ask whether to push. Push only on a yes, then continue. Without the push, `claude plugin update` reports the old version as the latest.

Then:

1. `claude plugin marketplace update adminhead`
2. Find every install of the plugin in `~/.claude/plugins/installed_plugins.json`. One plugin can be installed at user scope and in several project or local scopes, and `claude plugin update` changes one scope per run.
3. For each install, run `claude plugin update <name>@adminhead --scope <scope>` from its project directory (any directory for user scope). Use `claude plugin install <name>@adminhead` when it isn't installed anywhere yet.
4. Confirm each install's `version` in `installed_plugins.json` is the version from step 2. "Already at the latest version" with the old number means the marketplace didn't see the commit.

Then tell the user to run `/reload-plugins`.

## 6. Report

List the version shipped, the checks and their results, the commit, whether it was pushed, and the installed version per scope. Push only when the user asks: for a GitHub source that is the question in step 5; otherwise use `github:ship` at push level.
