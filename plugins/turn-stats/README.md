# turn-stats

A mod that shows a toast after a long main-loop turn:

```
3m12s 41k↑ 90%c
```

- duration: the turn's wall-clock length (`turn.complete` `durationMs`)
- output tokens: summed over the turn's API responses (`usage.output_tokens`)
- cache hit rate: cache reads over all input tokens (`cache_read / (input + cache_read + cache_creation)`)

The text is compact (duration, output tokens with `↑`, cache hit rate with `%c`) because the notification bar is shared with other notices and clips long lines. A turn that ended on an API error or a refusal says so at the end. A turn with no API response shows only its duration. Short turns and subagent turns get no toast; nothing stays on screen.

## Install

```
/plugin install turn-stats --marketplace Adminhead/claude-plugins
```

## Options

Set with `/config` or `pluginConfigs["turn-stats"].options`:

- `thresholdSeconds` (default 60): toast only for turns at least this long; 0 toasts after every turn.
- `includeAborted` (default off): also toast after a long turn you interrupted (marked `interrupted`).

How it works: one `turn.complete` hook calls `await next(e)` first, then toasts with `$.ui.toast` (8 s). It never changes the turn's result.

Idea from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT; no code copied).

Test: `claude plugin test plugins/turn-stats`.
