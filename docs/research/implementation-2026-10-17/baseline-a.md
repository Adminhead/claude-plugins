# Batch baseline-a report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `git-commit` | skill | Writes and creates Git commits in the repository's own message convention (Conventional Commits, release-please, commitlint) and names new branches to match it. | archive git/commit; branch-naming detection from archive git/branch | none |
| `git-history` | skill | Edits and repairs Git history safely without opening an editor: fixup and autosquash, rebasing onto the default branch or a new base, splitting commits, cherry-pick backports, bisect, and reflog recovery. | archive git/history (+ references/recovery-and-bisect.md unchanged); awesome-copilot rebase-current-branch (MIT); wshobson git-advanced-workflows (MIT) | none |
| `recommend-plugins` | skill, manual | Inspects the current project, proposes the adminhead meta plugins, bundles and focused plugins that fit it from the live catalog, and installs the ones you confirm at local or project scope. Manual command. | archive setup/recommend-plugins (rewritten) | none |
| `handoff` | skill, manual | Compacts the current conversation into a handoff document a fresh session can pick up, and with --bg launches that session as a background agent. Manual command. | mattpocock productivity/handoff + in-progress/claude-handoff (MIT) | none |

Destinations per plan: `git-commit`, `recommend-plugins`, `handoff` -> `baseline`; `git-history` -> direct install.

Files:
- plugins/git-commit/: plugin.json, skills/git-commit/SKILL.md, references/release-tooling.md
- plugins/git-history/: plugin.json, LICENSE (both MIT notices), skills/git-history/SKILL.md, references/recovery-and-bisect.md
- plugins/recommend-plugins/: plugin.json, skills/recommend-plugins/SKILL.md
- plugins/handoff/: plugin.json, LICENSE (MIT, Matt Pocock), skills/handoff/SKILL.md

## Validation

- `claude plugin validate --strict plugins/<name>`: passed for all four.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all four.
- SKILL.md lengths: 113, 97, 91, 47 lines. Skill descriptions are 160-350 chars.
- grep for codegraph, claude-mem, coding-core:, github:, git:, setup:, "Efficient ", coding-<lang>: no hits. (Remaining "worktree" mentions are the branch-name rule, `git rev-parse --git-path` for worktrees, and recommend-plugins' worktree guard; no worktree content.)
- No evals or scripts came with the sources, so there are no tests to carry.

## What changed vs the sources

- git-commit: release-please/commitlint/squash-merge detail moved to `references/release-tooling.md` (loaded when that config exists). New "Branch names" section with the convention detection order, default format, character rules, `check-ref-format`, and `--no-track` creation from the remote default. Branching strategies (GitFlow etc.) and rename/delete detail from git/branch dropped. Cross-refs: `github:ship` -> `ship` ("if installed"), `git:history` -> `git-history`.
- git-history: added rebase-current-branch's safety rules (detect default branch from remote HEAD, upstream remote first, never auto-stash, no `reset --hard` to finish or undo, never push, check for an in-progress rebase/merge/cherry-pick/bisect, never rebase the default branch or onto a stale local main) and an "Update a branch with the default branch" section. From wshobson: editor-free split-a-commit, `cherry-pick -n`, partial cherry-pick via `git restore --source`, merge-instead-of-rebase note. Autosquash with `GIT_SEQUENCE_EDITOR=true`, `bisect run` and `--force-with-lease` were already in the archive. Worktree material dropped.
- recommend-plugins: reads `marketplace.json` from the installed adminhead marketplace plus each plugin's `plugin.json` for `dependencies` (marketplace.json entries carry no dependencies), with README catalog markers as an alternative in a clone. No hard-coded plugin list; the marker table maps evidence to catalog areas. Sorts into metas, core bundles, focused plugins and cross-marketplace deps; prefers metas over their members; expands effective metas when skipping installed plugins; `baseline` and `avoid-ai-writing@conorbronsdon-skills` are user-scope suggestions with commands only; warns before install when `claude-code-lsps` isn't registered (add command `boostvolt/claude-code-lsps`, from examples/claude-settings). Keeps the `[local|project]` argument, default local.
- handoff: mattpocock body expanded into a section list (goal, state, next steps, open questions, references, suggested skills), `mktemp` in `$TMPDIR`. `--bg` parsed from `$ARGUMENTS`, launches `claude --bg --name "<name>" -- "$(cat <file>)"`.

## Deviations

- Archive recommend-plugins installed each dependency explicitly "so prune keeps them". The rewrite lets dependencies auto-install, so `claude plugin prune` can remove them after a meta is uninstalled, as the README describes. Flip back if you want explicit dep installs.
- The archive's dangling `scripts/install.sh` reference is replaced by the README's `claude plugin marketplace add Adminhead/claude-plugins`.
- git-history keeps the archive rule that a hard reset needs explicit approval, rather than an absolute ban: the skill never uses it on its own, and only runs it on an explicit user request after showing what it discards.

## Verified

- `claude --help` (local CLI, 2026-10-17): `--bg, --background`, `-n, --name <name>`, and the subcommands `agents`, `attach <id|name>`, `logs <id|name>`, `stop|kill <id>` exist. `claude plugin enable` takes `--scope`. `claude plugin install` has `--scope`, and `prune` removes auto-installed dependencies. `claude plugin marketplace list --json` returns `installLocation`; `claude plugin list --json` returns `scope`, `enabled`, `projectPath`.

## Unverified / TODO

- I haven't tested that `--` before the positional prompt works with `claude --bg` (the upstream skill uses it). I didn't launch a background agent.
- I haven't run trigger tests in a fresh session for git-commit or git-history.
- recommend-plugins assumes each plugin's `source` in marketplace.json is a relative path under `installLocation`, which is true for this marketplace today.

## Suggested follow-ups

- Add `git-commit`, `recommend-plugins` and `handoff` to `baseline`'s dependencies.
- Write trigger evals for git-commit and git-history: near-misses between commit and history requests, and "update my branch with main".
- If `shipper` depends on `git-commit`, check that its agent prompt points at the `git-commit` skill name.
