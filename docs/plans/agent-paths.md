# Agent paths: worktrees and plans

## Goal

- Worktrees live under `.claude/worktrees/`, are created with Claude Code's built-in tooling where possible, and `.claude/worktrees/` is gitignored.
- Agent work plans go to `.agents/plans/<slug>.md`. Spec and project plans stay in `docs/plans/`. A repo instruction overrides both.

## Findings

- Built-in worktrees are fixed at `.claude/worktrees/<name>` (`EnterWorktree`, Agent `isolation: "worktree"`, `claude --worktree`, workflows, background sessions). The only setting is `worktree.baseRef`.
- Moving them needs a `WorktreeCreate` hook, which replaces git behavior entirely. Claude Code then skips `.worktreeinclude`, keeps subagent and workflow worktrees instead of removing them, and prompts before `EnterWorktree` enters a path outside `.claude/worktrees/`. Rejected for that cost.
- The Claude Code docs tell you to add `.claude/worktrees/` to `.gitignore`.
- Current guidance that conflicts:
  - `plugins/git/skills/worktree/SKILL.md:40` defaults manual worktrees to `.worktrees/`, `worktrees/`, or a sibling directory.
  - `plugins/efficient-core/skills/planning/references/closing-review.md:26` saves every plan to `docs/plans/`. `modernize/SKILL.md:47` routes through it.
- Already correct: `agents/orchestration.md:50` and `implement-plan/SKILL.md:18` use `isolation: "worktree"`.
- Out of scope:
  - `claude-mem:make-plan` is third-party.
  - The test fixtures `check-land-slice.sh:23` and `code-search/scripts/tests/check.sh:127` build worktrees in temp dirs.
  - `second-opinion/scripts/consult.sh:128` writes `.agents/` inside a scratch workspace, not the repo.
- `.agents/` is safe as a name, because Claude Code reads nothing under it (`manage-agent-instructions/references/loading.md:46`).

## Rules the skills will state

Worktrees:

1. To isolate a subagent, use `isolation: "worktree"`. To move this session, use `EnterWorktree`, or `claude --worktree <name>` at launch.
2. Use `git worktree add` only for what the built-ins can't do, such as an existing branch, a detached inspection checkout, or a user-requested worktree. Default the path to `.claude/worktrees/<name>`, and honor an explicit path from the user.
3. Before creating the first worktree in a repo, check `git check-ignore -q .claude/worktrees/`. If the path isn't ignored, append `.claude/worktrees/` to `.gitignore` and say so.

Plans:

1. If the repo's `CLAUDE.md` or `AGENTS.md` names a plan location, use it. (This repo names `docs/plans/`.)
2. If the plan directs agent work (an implementation plan, slice plan, team contract file, or anything `implement-plan` will execute), save it to `.agents/plans/<slug>.md`.
3. Otherwise (a spec, roadmap, requirements, or project plan for people to read), save it to `docs/plans/<slug>.md`.
## Slices

| # | Slice | Files | Check |
| --- | --- | --- | --- |
| 1 | Worktree guidance | `plugins/git/skills/worktree/SKILL.md` (lines 12–14: built-ins first; line 40: `.claude/worktrees/<name>` default plus the ignore check). `plugins/authoring/skills/agent-teams/references/team-patterns.md:29`: replace "a `git worktree` created by hand" with a worktree at `.claude/worktrees/<slice>`, preferring `isolation: "worktree"` for subagent slices. | `claude plugin validate --strict` for `git` and `authoring`. `bash plugins/authoring/scripts/tests/check-land-slice.sh`. |
| 2 | Plan location | `planning/references/closing-review.md:26`: the three plan rules. `agent-teams/references/slice-landing.md:7`: contract file at `.agents/plans/<slug>-contract.md`. `implement-plan/SKILL.md:18`: a worktree subagent sees only committed files, so quote the slice in its brief when the plan file is uncommitted or ignored. | `claude plugin validate --strict` for `efficient-core` and `authoring`. Read through the result to confirm `modernize` still routes to the closing review. |
| 3 | This repo | `.gitignore`: add `.claude/worktrees/`. `CLAUDE.md:8` stays as is, since it is the repo override that keeps plans in `docs/plans/`. | `git check-ignore -q .claude/worktrees/` |
| 4 | Docs and release | `docs/plugins/git.md`, `docs/plugins/efficient.md`, `docs/plugins/authoring.md`. Bump the patch version of `git`, `efficient-core`, and `authoring` in `plugin.json` and `marketplace.json`. | `ship-plugin` for each of the three plugins |

Each slice is about 30 lines of prose, so a single `coder` can carry slices 1 to 3, followed by one `quick-review` pass.

## Done when

- No skill or agent tells Claude to create a worktree outside `.claude/worktrees/` unless the user names a path.
- The worktree skill sends subagent isolation and session moves to the built-in tools.
- The closing review saves an implementation plan to `.agents/plans/`, a spec to `docs/plans/`, and follows a repo instruction over both.
- Each skill that creates a worktree checks that `.claude/worktrees/` is ignored and adds the line when it's missing. No skill adds `.agents/plans/` to `.gitignore`.
- All three plugins validate and are shipped at their new versions.

## Status

Not started.
