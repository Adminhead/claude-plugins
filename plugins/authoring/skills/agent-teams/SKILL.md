---
name: agent-teams
description: Plan and run a Claude Code agent team, meaning several teammate sessions that share a task list and message each other. Covers when a team beats subagents, team size, one-owner-per-file splits, contract files, messaging rules, plan approval, and shutdown. Use when asked to spawn teammates, parallelize a feature across agents, or run a parallel review or competing-hypothesis debug. Not for scripted orchestration (dynamic-workflows:dynamic-workflows, if installed) or a single delegated helper (the Agent tool directly).
---

# Agent Teams

Agent teams are experimental in Claude Code and off by default. They use far more tokens than one session, so form a team only when teammates gain from working in parallel and talking to each other. Checked against the Claude Code agent teams docs, 2026-10-02 (Claude Code 2.1.x). Re-check the docs for setting names before relying on a detail here.

## Choose the mechanism

| Situation | Use |
| --- | --- |
| A focused helper whose result is all you need | A subagent through the Agent tool |
| A fixed, scripted fan-out with stages and budgets | `dynamic-workflows:dynamic-workflows` (if installed), after the user opts in |
| Parallel work where workers must share findings, challenge each other, or hand off at interfaces | An agent team |
| Sequential steps, same-file edits, or many dependencies | One session |

Good team work is parallel review, research across independent questions, new modules with separate files, debugging with competing hypotheses, and changes that cross frontend, backend, and tests.

## Enable and start

1. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `1` in the environment or in the `env` block of `settings.json`. Only the user changes settings, so ask before editing them. The flag has a side effect: while it is on, any subagent Claude names launches as a teammate with no confirmation, so teams can form during ordinary delegation. Enable it for the session or project that needs a team and set it to `0` afterwards. Passing `isolation` on an Agent call keeps that spawn a plain subagent.
2. Teams need an interactive session. In `-p` mode Claude does not spawn teammates.
3. Describe the task and the teammates you want in plain language, with a name for each so later messages can address it. Claude may use subagents instead of a team, so ask again explicitly when it does.
4. Choose a display mode with `teammateMode` in `~/.claude/settings.json`: `in-process` (the default), `auto`, `tmux`, or `iterm2`. Split panes need tmux or iTerm2 with the `it2` CLI.

## Size the team

Start with three to five teammates and use fewer when the work has fewer independent parts. Token cost grows linearly with each teammate, and coordination cost grows faster. Size tasks so each yields one clear deliverable, such as a function, a test file, or a review. Five or six tasks per teammate keeps everyone busy and leaves room to reassign.

Common compositions are in `references/team-patterns.md`. Read it when choosing roles for a review, debug, feature, or migration team.

## Split the work

1. **One owner per file.** Two teammates editing one file overwrite each other. Assign ownership by directory, module, or layer, and give barrel and index files to one owner.
2. **Contract files.** When teammates meet at an interface, write the types or schema first, give the lead ownership, and let teammates read it but not change it. A contract change goes through the lead.
3. **Vertical or horizontal.** A vertical slice (UI, API, tests for one feature) is easier to test alone. A horizontal layer keeps patterns consistent but adds integration points and makes later layers wait. Mix the two when shared infrastructure exists.
4. **Land slices one at a time.** When slices live in separate worktrees, read `references/slice-landing.md` for the contract-file template and the locked rebase-check-fast-forward script.
5. **Brief completely.** A teammate loads CLAUDE.md, MCP servers, and skills, but it does not inherit the lead's conversation. Put the goal, files owned, contract files, and how to report back in the spawn prompt.

## Communicate

- Message one teammate by name. There is no broadcast type, so reaching everyone costs one message per recipient. Reserve that for a blocker or a changed contract.
- Message at interface-ready points ("the endpoint is ready for the form"), not for routine status. Use the shared task list to record progress.
- A teammate cannot approve a permission prompt for the user, and it cannot relay a denied action to another teammate to get around the check.
- Check in at milestones. Leaving a team unattended for long raises the chance of wasted work, and a lead that starts implementing itself should be told to wait for its teammates.

## Plan approval and shutdown

- A teammate spawned while the lead is in plan mode works read-only until its plan is ready. The lead's session approves the plan on arrival without a review, so enforce real review gates with the `TeammateIdle`, `TaskCreated`, and `TaskCompleted` hooks, which can exit with code 2 to send feedback.
- To end a teammate, ask the lead to shut it down by name. The teammate may approve or decline with a reason. Teammates finish the current request first, so shutdown can lag.
- The team directory is removed when the session ends, and the task list stays on disk for resumed sessions. `/resume` does not restore in-process teammates, so spawn new ones after resuming.

## Limits to remember

One team per session, no nested teams, and a fixed lead. A teammate's model is fixed at spawn. Teammates inherit the lead's permission mode (except `dontAsk`), and you can change one teammate's mode after spawning but cannot set modes per teammate at spawn time. Permission prompts surface in the lead's session. Task status can lag, so verify that the work is done before unblocking dependents by hand.

## Done when

- Every file has exactly one owner and every contract file has a stated owner.
- Each task has a deliverable that someone verified, and not only a status flag.
- The lead has synthesized the results, and the diff has been reviewed by an agent that did not write it.
