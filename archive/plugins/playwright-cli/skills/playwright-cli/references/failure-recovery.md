# Failure Recovery and Diagnostics

Use this reference when a command fails, the page differs from expectation, or diagnostic evidence is requested. Preserve the observed error and current state before changing the workflow.

## Recover in order

1. **Stop before a side effect.** Do not retry a click or submit-like action if it may already have completed. Inspect the current page and URL first.
2. **Refresh the target.** Capture `snapshot` and choose a ref from that output. Refs are invalid after page or DOM changes; do not retry a stale ref. For large pages, use `find <text>` or `find --regex <pattern>`, then take a focused snapshot if needed.
3. **Check browser context.** Run `tab-list`, select the intended tab with `tab-select <index>`, and snapshot it. Review a dialog before `dialog-accept` or `dialog-dismiss`.
4. **Collect bounded evidence.** Use `console` and `requests` for the relevant failure. Use `request <index>`, headers, or body commands only when the selected request is relevant and its contents may be handled safely. Capture one explicit screenshot or snapshot when it demonstrates the issue.
5. **Change one condition and retry once.** For example, use the current ref, correct the selected tab, or navigate to the known URL. Re-verify after the retry. If it still fails, report the command, error, URL, snapshot/artifact path, and observed state rather than guessing.

Avoid arbitrary sleeps. If the task requires a specific readiness condition not represented by the CLI, use a narrow `run-code` wait only after confirming it is necessary and safe.

## Diagnostic recording

For a reproducible browser problem, begin recording before the reproduction and stop it even if a step fails:

```bash
playwright-cli -s=debug tracing-start
# reproduce the smallest failing sequence
playwright-cli -s=debug tracing-stop
```

Use `video-start [filename]` and `video-stop` only when visual motion is needed. Both traces and videos can contain sensitive data and consume disk space. Use explicit artifact filenames where the command supports them, report the resulting path, and remove unneeded files as authorized.

## Stuck or unavailable sessions

- Use `playwright-cli list` to identify the owned session. If a normal command cannot reach it, close that named session and reopen it; this loses in-memory state.
- If the browser process is genuinely stale, `kill-all` is a last resort because it terminates every CLI browser session. Obtain authorization first and report the impact.
- If a CLI command or option is not recognized, run `playwright-cli --help` (or `playwright-cli --help <command>`) and retain only its documented syntax. Do not substitute Playwright Test commands.

## Conditional tools

- **Routes:** Use the smallest mock necessary; inspect `route-list` and remove the route after the check. See [safety and cleanup](safety-cleanup.md).
- **Custom code:** `run-code` executes a Playwright JavaScript function with a `page` argument. Keep it short, task-specific, and free of secrets. Do not use it to bypass authorization or page safeguards.
- **Persistent state:** Reopening a browser may discard in-memory state. Do not save state solely for recovery; see [safety and cleanup](safety-cleanup.md) when state handling is explicitly required.
