# termwright

Teaches Claude Code to drive and test terminal UI apps with the [termwright](https://github.com/fcoury/termwright) CLI. termwright runs a program in a pseudo-terminal, sends real keystrokes, reads the screen, and saves artifacts.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `termwright:termwright` | `termwright` | Drive and test TUI apps through YAML step files, one-shot screen or PNG capture, or a daemon session for step-by-step interaction |

It replaces the user-level skill of the same name. Invoke it as `termwright:termwright`. The bare name `termwright` no longer works.

The skill has two references: daemon and capture, and step files and artifacts.

## Modes

| Need | Mode |
| --- | --- |
| Repeatable check of a state change | `termwright run-steps file.yaml` |
| One look at a screen | `termwright run --wait-for "Ready" -- ./app` |
| One PNG | `termwright screenshot --wait-for "Ready" -o shot.png -- ./app` |
| Explore step by step | `termwright daemon` plus `termwright exec` |

## Requirements

- `termwright` on `PATH`. Claude reports it missing rather than installing it.
- Written against termwright 0.2.0. On another version, Claude checks `termwright --help` and `termwright info steps|keys|protocols|capabilities`.
- Optional `playwright-cli:playwright-cli` plugin, for browser work.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install termwright@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/termwright
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/termwright
   ```
2. Start a fresh session. The skill list should show `termwright:termwright`.

## Limits

- termwright types into a real process. Claude confirms the command and working directory, and asks before input that saves, submits, deletes, purchases, or sends.
- Screen text, JSON, traces, and screenshots can hold sensitive content. Keep credentials out of step files.
- `termwright exec` exits 0 even when the reply holds an error, so Claude reads the JSON.
- Not for browser automation (`playwright-cli:playwright-cli`) or for developing termwright's Rust library.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable termwright@adminhead` |
| Uninstall | `claude plugin uninstall termwright@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
