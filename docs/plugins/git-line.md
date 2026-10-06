# git-line

A Claude Code mod that draws a status line directly under the prompt, beneath the engine's hint line. It shows where the session is working and the state of its git repository. It adds no skills or commands.

Requires Claude Code 2.1.289 or later.

## What it shows

```
claude-plugins/plugins/git-line  ⎇ main ↑2 ↓1  !1 +3 ~2 ?2
```

| Part | Meaning | Color |
| --- | --- | --- |
| `repo/sub/dir` | Working directory, relative to the repository root's parent. Outside a repository, the absolute path | `permission` |
| `⎇ main` | Branch, or `(abc1234)` when HEAD is detached | `claude` |
| `↑2 ↓1` | Commits ahead of and behind the upstream; absent when zero or without an upstream | `success`, `warning` |
| `!1` | Unmerged (conflicted) paths | `error` |
| `+3` | Paths with staged changes | `success` |
| `~2` | Paths with unstaged changes | `warning` |
| `?2` | Untracked paths | `inactive` |
| `✓` | Clean working tree | `success` |

Colors are Claude Code theme keys, so the line follows `/theme`. A line longer than the terminal is cut with `…`.

## How it updates

The line refreshes on `session.start` and `session.measure`, which fires after each turn. It runs `git rev-parse --show-toplevel` and `git status --porcelain=v2 --branch` through `$.process.run`, with repo hooks off. Changes made outside the session, such as a commit in another terminal, show up after the next turn.

If git fails, the last line stays and the error is logged once.

## Install

```
claude plugin install git-line@adminhead
```
