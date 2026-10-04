# usage-band

A Claude Code mod that draws a band directly above the prompt. It shows context usage by category and the 5-hour and weekly plan limits. It adds no skills or commands.

Requires Claude Code 2.1.289 or later. Mods shipped in 2.1.287, and 2.1.289 has the `ui.render` fixes the band relies on.

## What it shows

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

## Install

```
claude plugin install usage-band@adminhead
```
