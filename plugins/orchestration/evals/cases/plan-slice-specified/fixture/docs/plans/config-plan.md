# Config key cleanup plan

## S1 (done)
Add `src/settings.py` with `load()`.

## S3: rename the `timeout` config key to `timeout_seconds`
Files: `src/settings.py`, `src/client.py`, `src/worker.py`, `config/default.toml`.
Do exactly this and nothing else:
- `src/settings.py`: change the default dict key `"timeout"` to `"timeout_seconds"`.
- `src/client.py`: change `cfg["timeout"]` to `cfg["timeout_seconds"]`.
- `src/worker.py`: change `cfg["timeout"]` to `cfg["timeout_seconds"]`.
- `config/default.toml`: change `timeout = 30` to `timeout_seconds = 30`.
Acceptance: `grep -rn '"timeout"' src` and `grep -n '^timeout ' config` print nothing; `pytest` passes.
No design choice is left open.
