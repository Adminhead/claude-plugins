# Batch usage-band

## Plugins created

| Name | Type | Description (as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `usage-band` | mod (`hooks/hooks.json` -> `./register.tsx`) | A band above the prompt with context fill by category and rate-limit windows coloured by pace, a toast when a window turns amber or red or resets, plus session cost, cache hit rate, compactions and effort. | `archive/plugins/coremods/hooks/usage-band/band.tsx`, its wiring in `archive/plugins/coremods/hooks/register.tsx`, `archive/plugins/coremods/tests/usage-band.test.tsx`; enhancements from plan decision 8 and `docs/research/claude-hud.md` section 2 | none |

Files: `.claude-plugin/plugin.json` (with `userConfig`), `hooks/hooks.json`, `hooks/register.tsx` (all the `$` code), `hooks/band.tsx` (rendering, pure), `hooks/pace.ts` (grading + toast de-dup, pure), `hooks/format.ts`, `hooks/options.ts`, `tests/band.test.tsx`, `tests/pace.test.ts`, `README.md`.

## What changed from the archive

- It has its own `register.tsx`. The AbovePrompt hook draws the band first and stacks `await next(e).catch(() => undefined)` beneath it, so another mod's content (agent-status or anything else) stays below. It no longer assumes agent-status. A survey (`hasSurvey`) passes straight through to `next(e)`.
- Decision 8 enhancements:
  1. **Pace colouring** (`pace.ts` `grade`): linear projection to reset, using a 5h or 7d window length. Amber at a projection of 90% or more, red with `▲` above 100%, quiet under 10% used, red at 100% or more. A window whose pace can't be read (no reset time, or `spend_limit`) falls back to 60/85. This replaces `limitColor`. The percentage text is coloured when the window is amber or red.
  2. **Toasts** (`checkAlerts`): one when a window first reaches amber, one on red, and one when a window that had alerted resets (a reset is `resetsAt` moving more than 5 min later, or a drop of 10 points or more when there are no reset times). The de-dup memo lives in `$.store` key `alerts`, so it is shared across sessions. A window that dips and climbs back doesn't toast again.
  3. **Weekly and spend in the collapsed row** at `weeklyThreshold` (default 80) or on amber or red. `spend_limit` gets its own row, and other kinds are shown under their own name. The bar clamps at 100 and the real percentage is printed.
  4. **Reset display:** `resetStyle` is `countdown` (default) or `clock` (`↻14:30`, `↻Thu 09:00`), plus a `$.clock.every(60_000)` repaint started once in `session.start`.
  5. **Session stats:** cost (`usage.cost.usd`), last-response cache hit rate (`breakdown.apiUsage`), compaction count (`session.compact` on the main conversation, `manual`/`auto`, not skipped) and an effort badge (from `turn.step` `e.effort` on the main loop, async generator hook). They show on the collapsed row (minus the compaction count) and on a `session` row in the expanded view. When space or rows run short they drop first.
  6. **Hide-until-threshold:** `limitsThreshold` (default 0 = always show). A window shows at or above it, or on a pace alert.
- Options are real plugin `userConfig` fields (`limitsThreshold`, `weeklyThreshold`, `resetStyle`, `alerts`, `sessionStats`), read from `register(on, options)` through `parseOptions`, which clamps and falls back to defaults.

## API surfaces checked in cc.d.ts

`SessionRateLimit {kind, percentUsed, resetsAt?}` (spend_limit can go past 100), `SessionUsage.cost?: SessionCost {usd}`, `SessionContextBreakdown.apiUsage: ContextApiUsage | null` (input/output/cache_creation/cache_read tokens), `SessionCompactInput {trigger, agentId?, messages}` / `SessionCompactResult` with `skip`, `SessionCompactTrigger`, `TurnStepInput.effort?: 'low'|'medium'|'high'|'xhigh'|'max'|number` and `agentId?`, `TurnStepResult`, `$.ui.toast(text, {timeoutMs})`, `$.clock.every`/`now`, `$.store.get`/`set`, `$.session.usage(args)`, `Register = (on, options: PluginOptions)` with `PluginOptions` being the manifest's `userConfig` values, and the AbovePrompt props (`hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`, `view`). The userConfig field shape (`type`, `title`, `description`, `default`, `options`) follows seo-cockpit's manifest. `min`/`max` on the number fields passed `validate --strict`, but I haven't confirmed the engine enforces them; `parseOptions` clamps anyway.

## Validation and tests

- `claude plugin validate --strict plugins/usage-band`: passed. It notes two facts, not failures: `session.compact` is a gating hook without `.catch` (the hook only observes, so that's fine), and `session.compact` hooks don't run under org-managed Claude Code for user-installed plugins. Under managed settings the compaction count stays 0.
- `claude plugin test plugins/usage-band`: 51 pass, 0 fail. These are the ported archive band tests (layout, toggle, widths at 160/100/79/50/34, survey, error logging), new tests through `$` (▲ and red colour, weekly joining the collapsed row, spend row, cost/cache/compactions/effort via `$.session.compact` and `$.turn.step`, a toast de-duplicated across measurements, the band stacking above another mod's AbovePrompt content, row widths with three windows plus stats) and pure tests of `pace.ts`, `format.ts`, `options.ts` and the option helpers in `band.tsx`.
- grep for old names (codegraph, claude-mem, coding-core:, github:, Efficient, coremods): none.

## Deviations

- The reset toast fires only for a window that had reached amber or red. Without that, every quiet 5h rollover would toast, which is noise. This is documented in the README.
- The alert memo is in `$.store` (shared across sessions), not per session, so one window toasts once even with several sessions open.
- The compaction count and effort badge are module variables. They reset on `/clear` (`session.end`) and on a plugin reload. I didn't add `$.state`, to avoid a `types/index.d.ts` contract.
- No claude-hud code was copied. Only its ideas are used, credited in the README, so the plugin ships no LICENSE file.

## Unverified / TODO

- Options can't be injected into the mod under test (inline test plugins can't close over the test file), so the non-default option paths are tested through the pure helpers (`isShown`, `inCollapsed`, `resetPart`, `parseOptions`) and not through a mounted band.
- `fmtClock` uses the sandbox's local time (`Date#getHours`). I haven't checked live that the mod sandbox's timezone matches the user's.
- Not run in a live session (`claude --plugin-dir plugins/usage-band`).

## Suggested follow-ups

- The coordinator registers `usage-band` in marketplace.json and `baseline`.
- A live check of the toasts, the clock style and the 60 s repaint.
- Optionally move the counts into `$.state` so they survive a hot reload.
