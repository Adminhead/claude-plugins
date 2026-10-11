# coremods

A home for the core Claude Code mods: a git status line, a usage band, and an agent status line. Each mod is a section below. None adds skills or commands.

Requires Claude Code 2.1.289 or later. Mods shipped in 2.1.287, and 2.1.289 has the `ui.render` fixes the usage band relies on.

The mods share one hooks module, so they draw together. Above the prompt, the usage band replaces the engine's row and the agent line stacks beneath it. The git line sits under the prompt, in the engine's hint line.

## git-line

A Claude Code mod that draws a status line directly under the prompt, beneath the engine's hint line. It shows where the session is working and the state of its git repository. It adds no skills or commands.

### What it shows

```
claude-plugins/plugins/coremods  ⎇ main ↑2 ↓1  conflict 1 staged 3 mod 2 new 2  lines +13 -2
```

| Part | Meaning | Color |
| --- | --- | --- |
| `repo/sub/dir` | Working directory, relative to the repository root's parent. Outside a repository, the absolute path | `permission` |
| `⎇ main` | Branch, or `(abc1234)` when HEAD is detached | `claude` |
| `↑2 ↓1` | Commits ahead of and behind the upstream; absent when zero or without an upstream | `success`, `warning` |
| `conflict 1` | Unmerged (conflicted) paths | `error` |
| `staged 3` | Paths with staged changes | `success` |
| `mod 2` | Paths with unstaged changes | `warning` |
| `new 2` | Untracked paths | `inactive` |
| `✓` | Clean working tree | `success` |
| `lines +13 -2` | Lines added and deleted in tracked files since the last commit, staged and unstaged together; absent when both are zero | `success`, `error` |

Labels are dimmed and the numbers take the listed colors. Colors are Claude Code theme keys, so the line follows `/theme`. A line longer than the terminal is cut with `…`.

### How it updates

The line refreshes on `session.start` and `session.measure`, which fires after each turn. It runs `git rev-parse --show-toplevel`, `git status --porcelain=v2 --branch`, and `git diff HEAD --numstat` through `$.process.run`, with repo hooks off. Changes made outside the session, such as a commit in another terminal, show up after the next turn.

If git fails, the last line stays and the error is logged once.

## usage-band

A Claude Code mod that draws a band directly above the prompt. It shows context usage by category and the 5-hour and weekly plan limits. It adds no skills or commands.

### What it shows

Compact, the default (one row):

```
ctx ██▆▆▄▄░░░░░░░░░░░░░░ 30% · 108k free  5h ━━━━━━━━──── 38% ↻1h29m  +
```

Expanded (press the `+` button; fits `maxRows`):

```
context  ██████▆▆▄▄░░░░░░░░░░░░░░░░░░┊░░░░  59k / 200k · 30% · compacts at 167k  −
         ● sys 8k  ● tools 33k  ● mcp 2k  ● agents 2k  ● memory 4k  ● skills 10k
5h       ━━━━━━━━━━━━━━──────────────────  38%  ↻ 1h 29m
weekly   ━━━━━━━━━━━━━━━━━━━━━━──────────  62%  ↻ 1d 8h
```

- Each context category uses the theme color `/context` gives it, so the band follows `/theme`. Free space and the autocompact buffer use `inactive`.
- Limit bars are `success` under 60%, `warning` under 85%, and `error` above.
- While Claude is working, the band shows the compact row whatever the chosen view.
- The band yields to surveys, and falls back to the compact row when `maxRows` is short.
- Users without rate limits (API keys) see no limit parts.
- Cost is not shown.

The band refreshes on `session.start` and `session.measure` from `$.session.usage({ breakdown: 'summary' })`, a local estimate with no API call. If that call fails, the last snapshot stays and the error is logged once.

## agent-status

A Claude Code mod that draws a line above the prompt while subagents or teammates are live. It shows each agent's name, its status, and how long it has held that status, plus the session's done/total task count. It adds no skills or commands.

### What it shows

```
agents explorer running <1m · reviewer idle 3m · fixer waiting 12m  tasks 2/5
```

| Part | Meaning | Color |
| --- | --- | --- |
| `explorer` | The agent's name, else its description, else its type. Cleaned of control characters and cut at 24 characters | default |
| `running` | Status: `running`, `waiting`, `idle`, or `pending`. Finished agents (`completed`, `failed`, `killed`) are not shown | `success`, `warning`, `inactive` |
| `<1m`, `3m`, `1h2m` | Time since the agent entered its current status | dimmed |
| `+2 more` | Live agents beyond the first four | dimmed |
| `tasks 2/5` | Completed and total tasks; absent until a task exists | `success` |

The line is absent when no agent is live. A line longer than the terminal is cut with `…`. It stands aside for the engine's survey prompt.

### How it updates

`$.agent.list()` carries no timestamps, so the mod records when it first saw each agent in its current status. A status change restarts that clock. It polls every 5 seconds, after each Task tool call, and after each agent spawn, and it redraws only when the drawn content changes. Durations under a minute read `<1m` for that reason.

Task counts come from `tool.call`. `TaskCreate` adds a task, `TaskUpdate` sets its status or removes it when the status is `deleted`, and `TaskList` replaces the whole set. Calls that report failure change nothing. The count starts at zero when the mod loads, so tasks created earlier appear after the next `TaskList`.

If reading the agent list fails, the last line stays and the error is logged once.

## Install

```
claude plugin install coremods@adminhead
```

## git-tools

Three read-only tools for subagents, served from the same hooks module: `mcp__coremods__git_log` (`rev`, `path`, `max_count` up to 100, default 20), `mcp__coremods__git_blame` (`path`, `rev`, `start_line`, `end_line`) and `mcp__coremods__git_show` (`rev`, `path`). Explore lists them in place of a shell.

Each call runs `git` through `$.process.run` as an argument vector, never a shell, with `--no-pager`, `--no-lazy-fetch` (a partial clone can't fetch from a remote mid-call), `--literal-pathspecs`, `--no-show-signature` on log and show, `--no-ext-diff`, `--no-textconv`, `core.fsmonitor=false`, an empty `diff.external`, and `GIT_CONFIG_NOSYSTEM=1`. Revisions must match a strict pattern and never start with `-`. Paths must stay inside the session's working directory (checked lexically, so `../` and outside absolute paths fail) and follow `--`. Blame always names a revision (default `HEAD`), so it never reads the worktree. Output is cut at 100,000 characters with a note. Bad input and git failures come back as an `error: ...` result, never as a thrown error.

The helper in `hooks/git-tools/git.ts` builds and validates the argv. The tools are registered on `session.start`, so they appear from the first prompt.
