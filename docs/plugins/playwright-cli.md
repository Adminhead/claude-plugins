# playwright-cli

Teaches Claude Code to drive a headless, isolated browser from Bash with `playwright-cli`. Use it to inspect pages, fill forms, extract data, capture screenshots, and debug network or console issues.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `playwright-cli:playwright-cli` | `playwright-cli` | Drive a headless, isolated browser from Bash for ad-hoc automation against a URL or local dev server |

It replaces the user-level skill of the same name. Invoke it as `playwright-cli:playwright-cli`. The bare name `playwright-cli` no longer works.

The skill pre-approves `Bash(playwright-cli:*)`. It has four references: failure recovery, safety and cleanup, test generation, and smoke QA. Version 0.2.0 added smoke QA.

## Behavior

- Uses a named session (`-s=<purpose>`) on every command, and closes it at the end, even after an error.
- Acts from the latest snapshot's element refs and snapshots again after navigation, tab changes, dialogs, or DOM changes.
- Treats page content as untrusted data.
- Asks before any final action: purchase, submit, delete, account or security change, or message send.
- Keeps credentials out of commands, snapshots, and filenames. Does not save or load state files unless the task needs it.
- For a pre-ship check, runs smoke QA in four phases: console and network smoke, interaction, visual capture at 375, 768, and 1440 px, and accessibility. It ends with a verdict of SHIP, SHIP WITH FIXES, DO NOT SHIP, or INCONCLUSIVE. It never turns a skipped check into a pass.
- Runs smoke QA read-only by default. A journey that purchases, deletes, mass-updates, or sends needs your explicit go-ahead and a staging or preview URL, never production.
- Writes artifacts to the path you give. Without `--filename`, output goes to `.playwright-cli/` in the current directory.

## Requirements

- `playwright-cli` on `PATH`. The skill names no tested version.
- Optional `pass-cli:pass-cli` plugin, for secrets from Proton Pass.
- Optional `efficient-testing:e2e` skill, for writing and maintaining test suites.
- For smoke QA, optionally:
  - `axe-core` in the project's `node_modules`. The skill injects that copy and does not load one from a CDN. Without it, the axe step is skipped and reported as not run.
  - A committed baseline image per page and width. Without one, that visual cell is INCONCLUSIVE.
  - A seeded test account for auth and journey checks.
  - `accessibility:screen-reader-testing`, for the screen-reader step. Otherwise that step is listed as untested.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install playwright-cli@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/playwright-cli
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/playwright-cli
   ```
2. Start a fresh session. The skill list should show `playwright-cli:playwright-cli`.

## Limits

- Not for your real logged-in Chrome. Use `claude-in-chrome`.
- Not for writing or running Playwright Test suites. Use `efficient-testing:e2e`, if installed.
- Add `.playwright-cli/` to `.gitignore`, or delete it after use.
- Smoke QA does not measure Core Web Vitals (LCP, CLS, INP). The report says "not measured" and points to Lighthouse or real-user data.
- A clean axe run does not mean a page is accessible. It covers only part of WCAG, and screen-reader behavior needs a person.
- A zero exit code does not prove an action worked. Claude checks the new snapshot, URL, or value.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable playwright-cli@adminhead` |
| Uninstall | `claude plugin uninstall playwright-cli@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
