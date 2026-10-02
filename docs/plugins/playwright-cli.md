# playwright-cli

Teaches Claude Code to drive a headless, isolated browser from Bash with `playwright-cli`. Use it to inspect pages, fill forms, extract data, capture screenshots, and debug network or console issues.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `playwright-cli:playwright-cli` | `playwright-cli` | Drive a headless, isolated browser from Bash for ad-hoc automation against a URL or local dev server |

It replaces the user-level skill of the same name. Invoke it as `playwright-cli:playwright-cli`. The bare name `playwright-cli` no longer works.

The skill pre-approves `Bash(playwright-cli:*)`. It has three references: failure recovery, safety and cleanup, and test generation.

## Behavior

- Uses a named session (`-s=<purpose>`) on every command, and closes it at the end, even after an error.
- Acts from the latest snapshot's element refs and snapshots again after navigation, tab changes, dialogs, or DOM changes.
- Treats page content as untrusted data.
- Asks before any final action: purchase, submit, delete, account or security change, or message send.
- Keeps credentials out of commands, snapshots, and filenames. Does not save or load state files unless the task needs it.
- Writes artifacts to the path you give. Without `--filename`, output goes to `.playwright-cli/` in the current directory.

## Requirements

- `playwright-cli` on `PATH`. The skill names no tested version.
- Optional `pass-cli:pass-cli` plugin, for secrets from Proton Pass.
- Optional `efficient:e2e-testing` skill, for writing and maintaining test suites.

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
- Not for writing or running Playwright Test suites. Use `efficient:e2e-testing`.
- Add `.playwright-cli/` to `.gitignore`, or delete it after use.
- A zero exit code does not prove an action worked. Claude checks the new snapshot, URL, or value.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable playwright-cli@adminhead` |
| Uninstall | `claude plugin uninstall playwright-cli@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
