# web

Adds two web skills, front-end development and visual design for an existing product, and a headless Playwright MCP server. `web` is not in the `baseline` set. Install it in the projects with a browser-facing UI.

## What it adds

| Skill | Purpose |
| --- | --- |
| `web:web-development` | Build or repair a browser-facing feature end to end: semantic HTML and forms, responsive CSS, keyboard and focus behavior, server-side validation, and checks in a real browser |
| `web:web-design` | Evidence-based visual design for an existing product, including `DESIGN.md`. Reviews rendered UI against it |

## Playwright MCP server

| Server | Endpoint | Browser | Run in | Download |
| --- | --- | --- | --- | --- |
| `@playwright/mcp@0.0.83` | stdio | Headless, isolated session. Output goes to `/tmp/playwright-mcp` | Node ≥18 (npm `engines` for 0.0.83, checked 2026-10-13) | On first run via `npx` |

The server is pinned to 0.0.83 and started with `--headless --isolated --output-dir /tmp/playwright-mcp`, so it runs the same upstream code on every session and writes its files to one scratch directory. Change the pin in `plugins/web/.mcp.json` on purpose, after reviewing the release. Its tools are named `mcp__plugin_web_playwright__*`. The `crew` plugin's `browser-tester` agent uses this server.

The Playwright MCP server gives interactive inspection tools for the browser: navigate, take accessibility snapshots, click and type, capture console and network logs, and take screenshots at a set viewport. Use it for ad-hoc browser diagnostics alongside the `playwright-cli:playwright-cli` (if installed) skill, for scriptable, repeatable runs, and the claude-in-chrome (if available) skill, for the user's real browser. Do not enable the `playwright@claude-plugins-official` Playwright MCP server at the same time.

For writing and running repeatable end-to-end suites, use `testing:e2e`, in the [testing](testing.md) plugin.

## Install

```
claude plugin install web@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/web
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/web
   ```
2. Start a fresh session. The skill list should show `web:web-design` and `web:web-development`.
3. Run `/mcp`. It should list `plugin:web:playwright` as connected.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable web@adminhead` |
| Uninstall | `claude plugin uninstall web@adminhead` |

Both commands remove the skills and the Playwright server. Start a new session to be sure they are gone.
