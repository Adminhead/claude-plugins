# agent-status

A Claude Code mod that draws a line above the prompt while subagents or teammates are live. It shows each agent's name, its status, and how long it has held that status, plus the session's done/total task count. It adds no skills or commands.

Requires Claude Code 2.1.289 or later.

## What it shows

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

## How it updates

`$.agent.list()` carries no timestamps, so the mod records when it first saw each agent in its current status. A status change restarts that clock. It polls every 5 seconds, after each Task tool call, and after each agent spawn, and it redraws only when the drawn content changes. Durations under a minute read `<1m` for that reason.

Task counts come from `tool.call`. `TaskCreate` adds a task, `TaskUpdate` sets its status or removes it when the status is `deleted`, and `TaskList` replaces the whole set. Calls that report failure change nothing. The count starts at zero when the mod loads, so tasks created earlier appear after the next `TaskList`.

If reading the agent list fails, the last line stays and the error is logged once.

## Install

```
claude plugin install agent-status@adminhead
```
