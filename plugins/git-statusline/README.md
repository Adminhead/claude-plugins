# git-statusline

A mod that adds one git line under the prompt hint (terminal only):

## Install

```
/plugin install git-statusline --marketplace Adminhead/claude-plugins
```

`baseline` installs it for you.

```
repo/hooks  ⎇ wt:feature main ↑2 ↓1  conflict 1 staged 3 mod 2 new 2  lines +13 -2  stash 2
```

- Place: `repo/sub/dir` inside a repository, else the absolute cwd.
- `wt:<name>` when the cwd is a linked worktree (its git dir differs from the common git dir).
- `↑N` is green, then amber at the warning threshold and red at the critical one (`push_warning_threshold`, default 5; `push_critical_threshold`, default 20; 0 turns a level off). Set them with `/config` or `pluginConfigs["git-statusline"].options`.
- `✓` when clean; otherwise conflict, staged, modified and untracked counts, lines changed against HEAD, and the stash count.

It refreshes on session start and on each `session.measure`, running `git rev-parse`, `git status --porcelain=v2 --branch`, `git diff HEAD --numstat` and `git stash list` as argv (no shell). It stacks under whatever the engine and other plugins draw at the hint, by rendering `await next(e)` first. A failing git keeps the last line and logs once to the debug log.

Needs git 2.31 or later (`rev-parse --path-format=absolute`).

Ported from the archived `coremods` git-line mod; worktree, push-threshold and stash ideas from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT; no code copied).

Test: `claude plugin test plugins/git-statusline`.
