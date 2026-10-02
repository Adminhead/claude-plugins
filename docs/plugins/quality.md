# quality

Skills for verifying code changes. It runs tests, generates tests, audits a branch with security scanners, asks another model family for a second opinion, and strips unsupported complexity. It adds five skills. Three are manual-only commands, and two load on demand. It depends on [efficient](efficient.md).

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `quality:test` | `test` | Run the project's tests, show only compact failures, and fix them in a bounded loop. Manual: `/quality:test` |
| `quality:test-harness` | `test-harness` | Generate unit and integration tests for changed functions, run them with the `quality:test` runner, and return a compact report. Manual: `/quality:test-harness [path\|symbol]` |
| `quality:audit` | `audit` | Scan the branch's changes and dependencies, have a subagent verify findings, and report a ranked table. Manual: `/quality:audit [base-ref]` |
| `quality:second-opinion` | `second-opinion` | Read-only review of a diff or plan by a different model family (codex or agy) |
| `quality:anti-slop` | `anti-slop` | Cut unsupported complexity, speculative additions, dead artifacts, and filler from code, docs, or UI |

Manual-only skills set `disable-model-invocation`. Claude does not start them on its own.

## Requirements

- Python 3 for the `test`, `test-harness`, and `audit` scripts.
- `git` for `test-harness` scope detection.
- For `quality:audit`, the scanners `gitleaks`, `semgrep`, `trivy`, `govulncheck`, and `pip-audit`. A missing one is reported as "not scanned" and the rest still run.
- For `quality:second-opinion`, `codex` (OpenAI) or `agy` (Google).
- The `efficient` plugin. `plugin.json` declares it in `dependencies` as `["efficient"]`, a bare name resolved from the same `adminhead` marketplace. While `quality` is enabled, `efficient` stays enabled.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install efficient@adminhead
claude plugin install quality@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/quality
```

## Migrating from user-level skills

These skills moved from `~/.claude/skills/`.

- Old bare names no longer resolve. `/test` is now `/quality:test`, and likewise for `test-harness` and `audit`.
- Agent files that preload `second-opinion` must use `quality:second-opinion`.
- `anti-slop` points to `avoid-ai-writing:avoid-ai-writing` for prose cleanup, "if installed".

## Script permissions

Each skill that runs a script grants it in `allowed-tools`, so it runs without a permission prompt while the skill is active.

| Skill | Granted command |
| --- | --- |
| `quality:test` | `python3 ${CLAUDE_SKILL_DIR}/scripts/run_tests.py *` |
| `quality:test-harness` | `${CLAUDE_SKILL_DIR}/scope.sh`, and `python3 ${CLAUDE_PLUGIN_ROOT}/skills/test/scripts/run_tests.py *` |
| `quality:audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/scan.py`, with or without arguments |
| `quality:second-opinion` | `${CLAUDE_SKILL_DIR}/scripts/consult.sh *` |

`test-harness` reaches the `test` runner through `${CLAUDE_PLUGIN_ROOT}`, which is why both skills share a plugin. For a directory marketplace, `${CLAUDE_SKILL_DIR}` resolves to the marketplace source directory, not the plugin cache.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/quality
   ```
2. Start a fresh session and check the skill list. It should show `quality:test`, `quality:test-harness`, `quality:audit`, `quality:second-opinion`, and `quality:anti-slop`.
3. Run `/quality:test` in a repo with tests. It should run the suite without a permission prompt.

## Limits

- `quality:second-opinion` can send files to an outside model without a prompt. Its grant covers `consult.sh --input FILE` and `consult.sh --repo DIR`, so any readable file or directory can go to OpenAI (codex) or Google (agy). Use it only on content you may share.
- `quality:second-opinion` was not live-run during the migration, because that would send content to an external service. Its script paths and grant are checked, and its behavior is not.
- `quality:audit` reports only what the installed scanners find. Unscanned areas show as "not scanned".
- For a model-only read of the branch diff, use the built-in `/security-review`.
- Only `/quality:test` was run in the migration, with no permission denials. `quality:test-harness` and `quality:audit` were not run end to end.
- `test-harness` and `second-opinion` use `bash` scripts, so `bash` must be on `PATH`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable quality@adminhead` |
| Uninstall | `claude plugin uninstall quality@adminhead` |

While `quality` is enabled, `efficient` stays enabled. The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
