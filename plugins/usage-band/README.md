# usage-band

A mod that draws a band above the prompt showing how full the context window is and how much of each rate-limit window you've used.

## Install

```
/plugin install usage-band --marketplace Adminhead/claude-plugins
```

`baseline` installs it for you.

## What it shows

Collapsed (the default, one row):

```
ctx █████░░░░░ 30% · 108k free · $1.23 · cache 94% · ◑ high  5h ━━━━──── 60%▲ ↻2h30m  wk ━━━━━━── 85% ↻1d  +
```

- **Context bar.** Context fill split by category (system prompt, tools, MCP, memory, skills, messages), with the percentage used and the free tokens left.
- **Session stats.** Session cost (`SessionUsage.cost.usd`), the last response's prompt-cache hit rate (`cache_read / (input + cache_read + cache_creation)` from `breakdown.apiUsage`) and the main loop's effort level (read from `turn.step`).
- **Limit windows.** The 5h window is always shown unless `limitsThreshold` hides it. The weekly (`wk`) and `spend` windows join it once they reach the weekly threshold or their pace turns amber or red.
- **Narrow terminals.** When the row doesn't fit, parts drop in this order: session stats, then the extra windows, then the 5h window, then free tokens.

Expanded (`+`, ignored while a turn runs):

- the context bar with tokens used, the window size and where auto-compaction kicks in (`┊`)
- a legend of the categories
- one row each for `5h`, `weekly`, `spend` and any other window kind the engine reports
- a `session` row with cost, cache hit rate, how many times the main conversation has been compacted (`compacted ×2`) and the effort level

### Pace colouring

Each window is graded by how fast it's being used, not by fixed percentages. The used percentage is projected linearly to the window's reset (5h = 5 hours, weekly = 7 days):

| Projection at reset | Colour |
| --- | --- |
| under 90%, or under 10% used | green |
| 90% to 100% | amber |
| over 100% (it would run out before reset) | red, with `▲` after the percentage |

A window at 100% or more is red. A window whose pace can't be read (no reset time, or a `spend_limit` with no known length) falls back to amber at 60% and red at 85%. A `spend_limit` can go past 100%: the bar stays full and the real percentage is printed.

### Toasts

A toast appears when a window first turns amber, again if it turns red, and once more when a window that had alerted resets ("5h limit reset (it reached 92%)"). The red toast says when the window would run out at the current rate. A window that dips and climbs back before its reset doesn't toast again. The de-dup is kept in the plugin's `$.store` under `alerts`, which every session shares, so one window alerts once however many sessions are open.

### Staying current

The band refreshes on each usage measurement and repaints every 60 seconds, so an idle countdown and the pace colours stay up to date.

## Options

Set these in `/config` (the plugin's `userConfig`):

| Option | Default | Effect |
| --- | --- | --- |
| `limitsThreshold` | `0` | Hide-until-threshold: show a window only once it reaches this percentage or its pace turns amber or red. `0` always shows every window. |
| `weeklyThreshold` | `80` | Percentage at which the weekly and spend windows join the collapsed row (they also join on an amber or red pace). |
| `resetStyle` | `countdown` | `countdown` shows the time left (`↻1h29m`). `clock` shows when the window resets in local time (`↻14:30`, `↻Thu 09:00`). |
| `alerts` | `true` | Turns the limit toasts on or off. |
| `sessionStats` | `true` | Shows cost, cache hit rate, compaction count and effort. |

## Limits

The mods API doesn't give mods the real prompt-cache expiry, per-model weekly windows, the session name or the account plan, so the band doesn't show them. The compaction count and effort badge start over on `/clear` and when the plugin reloads.

## Credits

The pace projection (amber at a projected 90%, red past 100%, quiet under 10% used), the toasts and the hide-until-threshold option are ideas from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT). They are reimplemented here on the mods API; no claude-hud code is included.
