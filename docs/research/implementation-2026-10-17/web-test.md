# Batch web-test report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `e2e-testing` | skill | Write, run and diagnose browser end-to-end tests (Playwright, Cypress) for critical user journeys, with accessible locators, condition-based waits and flake triage. | archive/plugins/testing/skills/e2e (+ evals/testing-vs-e2e-browser) | none |
| `playwright-cli` | skill | Drive a headless, isolated browser from Bash with playwright-cli: inspect pages, fill forms, take screenshots, debug console and network errors, and run smoke QA. | archive/plugins/playwright-cli/skills/playwright-cli | none |
| `screen-reader-testing` | skill | Plan, run with the user and report manual screen-reader and keyboard tests of a built web journey (NVDA, JAWS, VoiceOver, Orca, TalkBack). | archive/plugins/accessibility/skills/screen-reader-testing | none |
| `web-design` | skill | Extend an existing product's visual system: hierarchy, responsive, state and accessibility intent, DESIGN.md, and review of the rendered UI against it. | archive/plugins/web/skills/web-design | none |
| `browser-tester` | agent | Agent that verifies a running web app in a real browser against acceptance criteria with playwright-cli, returning pass, fail or blocked per criterion with evidence. | archive/plugins/crew/agents/browser-tester.md (rewritten) | `playwright-cli` |
| `web-perf-auditor` | agent | Agent that audits a web app's performance: a static source scan marked not measured, or a deep audit from Lighthouse, PageSpeed or CrUX data, with no fabricated numbers. | 3rd-party/agent-skills (aeac41d) agents/web-performance-auditor.md + web parts of skills/performance-optimization and references/performance-checklist.md, MIT | none |

## What changed per plugin

- **e2e-testing**: renamed skill to `e2e-testing`, removed "Efficient" heading, cross-refs now `unit-testing`, `web-development`, `react`, `playwright-cli`, `browser-tester`; "Not for" moved to body; Context7 line made conditional. Evals: archive `testing-vs-e2e-browser` moved in as `evals/route-e2e-vs-unit` (graders use `(?:[\w-]+:)?e2e-testing` / `unit-testing`), plus new hard negative `evals/route-adhoc-browser-not-e2e`.
- **playwright-cli**: `testing:e2e` -> `e2e-testing`, `accessibility:screen-reader-testing` -> `screen-reader-testing`, dropped `git:worktree` and `pass-cli:pass-cli` (not in this marketplace; replaced with generic "secret manager's CLI"), smoke-QA Web Vitals line points to `web-perf-auditor`, Smoke QA rule points to `browser-tester`. `allowed-tools` changed from `Bash(playwright-cli:*)` to `Bash(playwright-cli *)`. Added an install note (`@playwright/cli`, `install-browser`).
- **screen-reader-testing**: ported as is; refs -> `accessibility-review`, `playwright-cli`, `web-development`, `react`, `web-design`; "Not for" moved to body.
- **web-design**: per uiux-design.md section 5: heading fixed, description rewritten without frontend-design/ui-ux-pro-max/ui-styling/prototype, body bullets for `ui-styling`/`ui-ux-pro-max` removed, "no system" points to color-oklch and `ui-direction`, section 8 delegates rendered critique to `ui-critic` in "existing system" mode, `uiux-lookup` citation line added, refs re-pointed (`react`, `tanstack`, `playwright-cli`, `accessibility-review`, `screen-reader-testing`). references/color-oklch.md and rendered-review-checklist.md stripped of ui-ux-pro-max and Playwright MCP mentions.
- **browser-tester**: rewritten from Playwright MCP to the playwright-cli Bash workflow; `tools: Read, Bash, Glob, Grep`; `skills: [playwright-cli:playwright-cli]`; named session `-s=bt-<run>`, artifacts under `/tmp/browser-tester-<run>/`, readiness via bounded curl loop, per-criterion console/requests clear, final-action stop, 3-attempt bound, cleanup of own session/PID only; output table pass/fail/blocked with evidence, escalate line.
- **web-perf-auditor**: trimmed from 184 lines plus folded checklist to 113; quick mode = scorecard all `not measured`, findings `potential impact`; deep mode parses Lighthouse JSON / PSI / CrUX with exact field paths; Chrome DevTools MCP references dropped (agent has no MCP tools); runs Lighthouse only when the brief allows network (pinned `npx lighthouse@13`); backend items (N+1, indexes, pools, caching) left out except a one-line pointer. Attribution comment in the body; `LICENSE` (MIT, Addy Osmani) in plugin.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all six: passed.
- grep for codegraph, claude-mem, coding-core:, github:, Efficient, testing:, web:, coding-js:, accessibility:, design:, ui-ux-pro-max, ui-styling, mcp__plugin, pass-cli, git: : no hits except the intended `playwright-cli:playwright-cli` skill preload in browser-tester.
- No scripts or mods in this batch, so no `claude plugin test`/`bun test`. Evals were not run (`claude plugin eval` costs money).

## Version-sensitive facts checked

- playwright-cli 0.1.22 installed at /usr/bin: every command and flag used (open --headed/--browser/--device/--mobile/--persistent/--profile, snapshot --depth/--filename, find --regex, console [level] --clear, requests --filter/--static/--clear, screenshot --filename/--full-page/--hires, resize, set-color-scheme, set-reduced-motion, tab-*, route/unroute, tracing, recording, install-browser, list/close-all/kill-all) confirmed via `playwright-cli --help`; bundled SKILL.md + references path confirmed.
- Playwright Test `--repeat-each` and `npx playwright show-trace` confirmed via Context7 (/microsoft/playwright).
- lighthouse latest is 13.5.0 (`npm view`), so `lighthouse@13` pin.
- PSI `loadingExperience.metrics.*.percentile` field names and CLS x100 scaling confirmed via the PSI API reference and DebugBear write-up. Lighthouse navigation runs not measuring INP (TBT as proxy) and the CrUX API `record.metrics.<m>.percentiles.p75` shape are from memory, not re-checked this session.

## Deviations

- web-perf-auditor: no `references/` file; the checklist is folded into the agent body because a plugin agent can't reliably locate plugin files (`${CLAUDE_PLUGIN_ROOT}` expansion in agent bodies unverified).
- web-perf-auditor: dropped the upstream "Positive observations / Recommendations" split into one "Done well" plus "Not covered"; dropped `/webperf` command and Composition section (no such command here).
- e2e eval case renamed `testing-vs-e2e-browser` -> `route-e2e-vs-unit`.
- Coordinator follow-up (applied): web-design's description no longer mentions handoff or acceptance criteria. It now triggers on redesigning a screen within an established system, extending tokens or components, and documenting design standards. The body's "Not for" line and section 7 send developer handoff specs to `design-handoff`. Design-plugin refs in web-design and screen-reader-testing use the bare names (`accessibility-review`); neither skill referenced `design-critique`, `design-system`, `design-handoff` or `ux-copy` before. A grep for `design:` finds nothing. Re-validated with --strict: passes.

## Unverified / TODO

- Neither agent invoked end to end (`@agent-browser-tester:browser-tester` against a dev server, `@agent-web-perf-auditor:web-perf-auditor` on a repo).
- The preload name `playwright-cli:playwright-cli` resolves only once both plugins are installed from the marketplace.
- Cross-refs to plugins from other batches (`accessibility-review`, `ui-direction`, `ui-critic`, `uiux-lookup`, `unit-testing`, `web-development`, `react`, `tanstack`) assume those names land.

## Suggested follow-ups

- Run `claude plugin eval plugins/e2e-testing` once registered.
- Add trigger evals for web-design vs ui-direction (hard negatives listed in uiux-design.md section 5).
- Smoke-run browser-tester against a local Vite app to check the readiness loop and cleanup.
