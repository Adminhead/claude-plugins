# Step files and artifacts

Checked against termwright 0.2.0 and the upstream source at commit [`50fd170`](https://github.com/fcoury/termwright/tree/50fd1703af2b7ebf8904e51f7bcd416785dce050). Confirm details with `termwright info steps <name>`.

## Session

A step file is YAML or JSON with `steps`, plus optional `session` and `artifacts`.

- `session` is required when termwright starts the process. `session.command` is either a string with `args`, or an array whose first item is the executable (then `args` is ignored).
- Optional fields are `cwd`, `env`, `cols`, `rows` (default 80×24), `noDefaultEnv`, and `noOscEmulation`.
- The command runs directly, not through a shell. Add a shell wrapper only when needed.
- `termwright run-steps --connect SOCKET FILE` reuses a running daemon. `session` is then unused, its `cwd` and `env` don't apply, and the runner leaves the daemon open.

## Steps

| Group | Steps |
| --- | --- |
| Wait | `waitForText`, `waitForPattern`, `waitForIdle` (`idleMs` required), `waitForTextGone`, `waitForPatternGone` |
| Input | `press`, `type`, `hotkey` |
| Assert | `expectText`, `expectPattern`, `notExpectText`, `notExpectPattern` |
| Capture | `screenshot` |

- `expectText` and `expectPattern` wait for a match (optional `timeoutMs`).
- `notExpectText` and `notExpectPattern` check the current screen once. They don't wait for text to disappear. Use `waitForTextGone` or `waitForPatternGone` for that.
- Check a destination is absent before navigating, so the test can't pass on a screen that already showed it. Prefer text unique to the destination over a label that may stay visible.

## Artifacts and trace

- `artifacts.mode` is `onFailure` (default), `always`, or `off`. `artifacts.dir` defaults to `termwright-artifacts`. Each run gets a timestamped subdirectory.
- `always` saves screen text and JSON after every step. `onFailure` saves them after the failing step.
- A `screenshot` step saves a PNG whenever a run directory exists, including on success under `onFailure`. It fails when no run directory exists.
- `--trace` writes `trace.json` with step labels, timings, screen hashes, and errors. It creates the run directory even with `mode: off`.
- Artifact mode is therefore not a privacy boundary.
- Screenshot names aren't sanitized at the pinned commit. Use a plain basename, never `/`, `..`, or an absolute path.
