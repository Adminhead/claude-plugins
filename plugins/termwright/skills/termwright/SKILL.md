---
name: termwright
description: Drive and test terminal UI (TUI) apps with the termwright CLI through YAML step files, one-shot screen or PNG capture, or a daemon session for step-by-step interaction. Use when you need to see or interact with a TUI or full-screen terminal program (menus, curses, ratatui apps) from Bash. Not for browser automation (playwright-cli:playwright-cli, if installed) or for developing termwright's Rust library.
---

# termwright

termwright runs a program in a pseudo-terminal, sends real keystrokes, reads the screen, and saves artifacts. This skill was checked against termwright 0.2.0. Run `termwright --help` and `termwright info steps|keys|protocols|capabilities` when the installed version differs.

## Safety

- Termwright types into a real process. Confirm the executable, arguments, and working directory, and prefer a disposable environment.
- Ask with AskUserQuestion before input that saves, submits, deletes, purchases, or sends anything, and before driving an app holding real accounts or user data.
- Keep credentials out of step files. Screen text, JSON, traces, and screenshots can hold sensitive content.
- If termwright is missing, report it rather than installing or swapping tools.

## Choose a mode

| Need | Mode |
| --- | --- |
| Repeatable check of a state change | `termwright run-steps file.yaml` |
| One look at a screen | `termwright run --wait-for "Ready" -- ./app` (add `--format json`) |
| One PNG | `termwright screenshot --wait-for "Ready" -o shot.png -- ./app` |
| Explore step by step | daemon plus `termwright exec` |

One-shot `run` and `screenshot` kill the process after capture. Use Read on a PNG to see it.

## Step files

Assert the transition, not just that text exists. Check the destination is absent first, then present after input:

```yaml
session:
  command: ./build/my-tui
  args: []
  cwd: .
  cols: 100
  rows: 30
steps:
  - waitForText: {text: "Main menu", timeoutMs: 5000}
  - notExpectText: {text: "Settings"}
  - press: {key: Down}
  - press: {key: Enter}
  - expectText: {text: "Settings", timeoutMs: 2000}
  - screenshot: {name: settings}
artifacts:
  mode: onFailure
  dir: ./termwright-artifacts
```

Run it with `termwright run-steps ./test.yaml`. Add `--trace` only when trace output is acceptable. Read [step files and artifacts](references/steps-and-artifacts.md) for the schema, assertion semantics, artifact behavior, and `--connect`.

## Daemon sessions

Start the daemon on a fresh socket in a private directory, then send one `exec` request at a time and read each JSON reply before the next:

```bash
D=$(mktemp -d); SOCK="$D/tw.sock"
termwright daemon --socket "$SOCK" --background -- ./build/my-tui
termwright exec --socket "$SOCK" --method wait_for_text --params '{"text":"Main menu","timeout_ms":5000}'
termwright exec --socket "$SOCK" --method press --params '{"key":"Down"}'
termwright exec --socket "$SOCK" --method screen --params '{"format":"text"}'
termwright exec --socket "$SOCK" --method close
```

`exec` exits 0 even when the reply holds an `error`, so always inspect the JSON. Read [daemon and capture](references/daemon-and-capture.md) before using the daemon.

## Verify and report

A zero exit or a sent keystroke doesn't prove the app reached the intended state. Check the screen or artifacts. Report what you observed, artifact paths (not their sensitive contents), cleanup, and unresolved failures.

## Failure handling

- **Parse, step, or key errors.** Check `termwright info steps <name>` or `info keys` instead of retrying the same input.
- **Timeouts.** Inspect the screen and trace and confirm the app started. Prefer a readiness wait (`waitForText`, `waitForIdle`) over a longer fixed delay.
- **Assertion failures.** Re-read the observed state before any retry that could repeat an external effect.
- **Daemon trouble.** Confirm the socket is the one you started. Close only sessions you own.
