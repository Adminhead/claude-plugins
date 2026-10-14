# testing

Adds five testing skills: unit and regression tests, browser end-to-end tests, a test runner, a test harness, and a test-gap audit. `testing` is in the `baseline` set.

## What it adds

| Skill | Purpose |
| --- | --- |
| `testing:unit` | Decide, write, and run focused unit or regression tests for changed behavior |
| `testing:e2e` | Write, run, and diagnose browser end-to-end tests for critical journeys |
| `testing:run` | Run the project's tests, show only compact failures, and fix them in a bounded loop. Manual: `/testing:run` |
| `testing:harness` | Generate unit and integration tests for changed functions, run them with the `run` runner, and return a compact report. Manual: `/testing:harness [path\|symbol]` |
| `testing:gap-audit` | Read-only audit of missing, weak, and stale tests. Maps source files to tests with a bundled script, ranks gaps P0 to P3 by behavior and risk (not coverage percentage), and proposes exact tests |

`testing:harness` calls the `run` runner through `${CLAUDE_PLUGIN_ROOT}`, which is why the testing skills share a plugin.

`testing:run` and `testing:harness` set `disable-model-invocation`, so Claude does not start them on its own.

### Browser routing

For ad-hoc browser driving (interactive inspection, one-off clicks and captures), use the Playwright MCP server in `web`, if installed, `playwright-cli:playwright-cli`, if installed, or the claude-in-chrome skill. `testing:e2e` is for writing, running, and diagnosing repeatable test suites.

## Script permissions

Each skill that runs a script grants it in `allowed-tools`, so it runs without a permission prompt while the skill is active.

| Skill | Granted command |
| --- | --- |
| `testing:run` | `python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py *` |
| `testing:harness` | `${CLAUDE_SKILL_DIR}/scope.sh`, and `python3 ${CLAUDE_PLUGIN_ROOT}/skills/run/scripts/run_tests.py *` |
| `testing:gap-audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/coverage_map.py`, with or without arguments |

## Requirements

- Python 3 for the `run`, `harness`, and `gap-audit` scripts.
- `git` for `harness` scope detection and `gap-audit`.
- `coverage_map.py` uses only the standard library and runs no tests. It writes nothing and calls only `git ls-files` and `git rev-parse`.

## Install

`baseline` installs `testing`. To install it alone:

```
claude plugin install testing@adminhead --scope user
```

To try it without installing:

```
claude --plugin-dir plugins/testing
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/testing
   ```
2. Start a fresh session. The skill list should show `testing:e2e`, `testing:gap-audit`, `testing:harness`, `testing:run`, and `testing:unit`.
3. Run `/testing:run` in a repo with tests. It should run the suite without a permission prompt.

## Limits

- `testing:gap-audit` matches source to tests by name, mirrored path, import, and mention. Coverage that arrives through fixtures, end-to-end tests, or indirection is invisible to it, so an unmatched file is a lead to confirm and not a finding.
- `testing:harness` was not run end to end during the migration.
- The boundary between testing and language skills is routed by description only, and no routing eval covers it.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable testing@adminhead` |
| Uninstall | `claude plugin uninstall testing@adminhead` |

The plugin ships only skills and scripts, so both commands remove everything. Start a new session to be sure they are gone.
