# usage-band: plan and context usage above the prompt

Status: Slice 1 implemented, 2026-10-03 (uncommitted). Slice 2 deferred.
Engine: Claude Code mods, minimum 2.1.289 (mods shipped in 2.1.287; 2.1.289 has `ui.render` stability fixes).

## Goal

A mod that draws a dark, minimal, information-dense band directly above the prompt input:

- Context usage as one bar, segmented and colored by category (system prompt, tools, MCP tools, agents, memory files, skills, messages), plus free space and the autocompact point
- 5-hour and weekly plan limits with percent used and time to reset
- Collapsible to a single line

Reference: the screenshot in the request, restyled. No sentence-style narration ("Healthy… Nothing to do"). Numbers and bars carry the meaning.

## Mechanism

Verified in the Phase 0 spike against 2.1.289 and the declarations it writes to `.claude-plugin/types/claude-code/index.d.ts`.

| Need | Source |
| --- | --- |
| Draw above the prompt | `on('ui.render', { component: 'AbovePrompt' }, …)` returning a tree from `$.ui.resolve(e)` (`Box`, `Text`, `Button`). Props: `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns` (width less the engine's 5-cell `[-]`), `scroll`, `view` |
| Data | `$.session.usage({ breakdown: 'summary' })`: local estimate, no API call. `'full'` counts with the token-count API like `/context`; not needed |
| When to refresh | `session.start` (seed) and `session.measure` (after each turn, and when a limit moves a whole point). `e` on measure never carries the breakdown, so call `usage()` from the hook |
| Redraw | `$.ui.invalidate('ui.render')`, throttled by the engine |
| Colors | `Text color` takes a theme key or a raw color. Each breakdown category carries the theme key `/context` uses (`promptBorder`, `inactive`, `permission`, `claude`, `warning`, …) |

Live payload (`context.breakdown`):

- `categories[]`: `{ name, tokens, color, kind }`, with `kind` one of `used`, `free`, `buffer`, `deferred`. Rows seen: System prompt, System tools, MCP tools, MCP server instructions, Custom agents, Memory files, Skills, Messages, Autocompact buffer, Free space, plus deferred tool rows outside the window
- `totalTokens`, `maxTokens`, `rawMaxTokens`, `percentage`, `autoCompactThreshold`, `isAutoCompactEnabled`, `autocompactSource`, `model`, and per-item lists (`agents`, `memoryFiles`, `skills`, `mcpTools`, `slashCommands`)
- `percentage` is present before the first turn; `context.percent` is not
- `rateLimits[]`: `{ kind: 'five_hour' | 'seven_day', percentUsed, resetsAt }` (ISO)

Rejected: `statusLine`. It draws below the input, a plugin can't ship it, and it gets no breakdown.

## Design (default, for reaction)

Dark terminal, muted chrome, color only on data. Colors are Claude Code theme keys, so the band follows `/theme`: with an ANSI theme it uses the terminal's own 16-color palette.

Collapsed (1 row, the default; context and 5h only):

```
ctx ▕██▆▆▄▄▂▂░░░░░░░░░░░░░░░░░░▏ 4% · 956k free   5h ━━━━━━━━──── 38% ↻1h29m
```

Expanded (4 rows, fits `maxRows`):

```
context  ▕██▆▆▄▄▂▂░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┊░░▏  44k / 1M · 4% · compacts at 967k
         ● sys 2k  ● tools 33k  ● mcp 0  ● agents 281  ● memory 3k  ● skills 6k  ● msgs 1k
5h       ━━━━━━━━━━━━━━━━━━━━━━──────────────────────────────────────────  38%  ↻ 1h 29m
weekly   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━────────────────────────  62%  ↻ 1d 7h
```

- Labels `dimColor`. Numbers bright. Free space and track in near-background gray.
- Category colors: each row's own `color` key from the breakdown, so the bar matches `/context`. Free space and track use `inactive`.
- Limit bars change by threshold, through theme keys: `success` under 60%, `warning` under 85%, `error` above.
- Collapsed shows context and 5h only. Weekly appears in the expanded view.
- Compact/expanded is the mod's own toggle, a small `Button` at the end of the row. The engine's `[-]` (ctrl+x ctrl+a) hides the whole band behind a "plugin panel hidden" line, so it can't serve as the compact view.
- While Claude is working (`e.props.isWorking`), the band drops to the compact line, then returns to the chosen view when the turn ends.
- Yield to surveys: when `e.props.hasSurvey`, pass with `next(e)`.
- Cost is not shown.
- `┊` marks `autoCompactThreshold` when `isAutoCompactEnabled`.
- Bars scale to `e.props.bodyColumns`. Below about 80 columns, drop the legend tokens before the bars.
- Each category gets at least one cell when it's non-zero, so small categories stay visible.

## Phases

### Phase 0 — spike (done, 2026-10-03)

A throwaway mod loaded with `--plugin-dir` in an interactive session under tmux:

1. A user-loaded mod draws in `AbovePrompt`. The engine adds its `[-]` at the right.
2. The breakdown reaches third-party mods through `$.session.usage({ breakdown })` (documented in the declarations, not internal). The autocompact threshold is present.
3. Theme keys render through the active theme (256-color codes under the default dark theme).
4. `view` names which transcript is on screen, not collapse state. The engine's collapse hides the band entirely.

Also seen: `isWorking` flips live during a turn, and `percentage` updated after the turn.

### Slice 1 — live band (ships)

- `plugins/usage-band/` mirroring `plugins/example`: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`. The snapshot and the expanded flag live in module variables, as in the spike. Ponytail: no `$.state` or `types/index.d.ts` until the flag needs to survive a hot reload
- Pure function `renderBand(snapshot, columns, view) → tree`, kept separate from the hook wiring so it's testable
- Collapsed (default) and expanded layouts as above, collapsing automatically while working
- Empty states:
  - Before the first turn: draw from `breakdown.percentage`
  - No `rateLimits` (API key users, or before the first response): omit the limit rows. Don't show placeholders
  - `usage()` throws: keep the last snapshot and surface the error once with `$.ui.log`
- `tests/usage-band.test.tsx` run by `claude plugin test` with `$.ui.mount` on the `terminal` surface: segment widths sum to bar width, non-zero categories get ≥1 cell, narrow-width fallback, limits-absent layout, toggle button switches views, compact while working
- Marketplace entry and README row, same as recent plugin releases

Done: `claude plugin validate --strict` passes, tests pass, and in a live session the band updates after a turn and after `/compact` and the toggle switches views.

### Slice 2 — pacing (optional, later)

The screenshot's "10.8%/h", "about 54% by reset", and "~29%/day" need timestamped samples, across sessions for the weekly window.

- Ring buffer in `$.store` (shared by every session on the machine) keyed by window and `resetsAt`, cleared when `resetsAt` changes
- Show projected percent at reset plus burn rate, next to each limit bar
- Done: projections survive a restart and agree across two concurrent sessions

Ponytail: slice 2 waits until slice 1 has been in daily use and the projections still seem worth the store code.

## Risks

| Risk | Effect | Response |
| --- | --- | --- |
| Mods API changes between releases | Band breaks after an update | Pin 2.1.289 in the README; `claude plugin validate` on upgrade |
| Band height competes with surveys and `maxRows` | Clipped rows | Yield on `hasSurvey`; fall back to compact when `maxRows` is short |
| Theme keys outside the default themes | Odd colors | Keys come from the engine's own breakdown; only the limit colors are ours |

## Decisions (2026-10-03)

- Palette: match the theme, through Claude Code theme keys
- Default view: collapsed, showing the context bar and the 5h bar
- While working: collapse
- Name: `usage-band`
- Cost: not shown
