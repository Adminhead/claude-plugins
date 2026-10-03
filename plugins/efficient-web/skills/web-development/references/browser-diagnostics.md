# Browser diagnostics

Read this when the changed journey needs live browser evidence or a failure needs diagnosis.

## Tools

- **Playwright MCP (efficient-web, if installed).** Interactive inspection: navigate to a page, take accessibility snapshots, click and type, capture console and network logs, and take screenshots at a set viewport. For scripted repeatable evidence, use `playwright-cli:playwright-cli` (if installed). For the user's real logged-in browser, use the claude-in-chrome skill. For journeys covered by tests, use the repo's e2e runner (see `efficient-testing:e2e`, if installed).
- **`playwright-cli:playwright-cli` (if installed).** A scriptable headless or headed browser. Use it for repeatable navigation, screenshots at set viewports, console and network capture, and accessibility snapshots when you need the exact same run each time.
- **claude-in-chrome skill.** Drives the user's real Chrome. Use it when the journey needs their session, extensions, or a state that is hard to script.
- **The repo's own e2e runner.** Use it when a test already covers the journey.

Use whichever is available. Don't add a dependency just to diagnose.

## Procedure

1. Reproduce the exact journey. Record the browser and version, viewport, network condition, and steps. Capture only the artifacts the environment permits, and redact credentials, tokens, and personal data.
2. Capture console messages and the request and response for the affected action, including method, URL, status, relevant headers, and body shape. Record the accessibility semantics and focus behavior that matter. Capture narrow or zoomed renders when relevant, and a performance trace only when performance is in scope.
3. Correlate timestamps and the visible outcome with server logs or test artifacts. Tool output is an observation, not a cause. Confirm a hypothesis at an independent boundary, through a controlled reproduction, or with a targeted change.
4. Classify the cause before editing. It is browser or runtime behavior, client integration, the server contract or authorization, the test harness, or unavailable infrastructure. Remove temporary instrumentation afterward.
