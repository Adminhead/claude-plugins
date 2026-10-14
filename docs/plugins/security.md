# security

Adds three security skills: a STRIDE threat model built from the code, a privacy and data-handling review, and a manual audit of the branch's changes and dependencies. `security` is not in the `baseline` set. Install it in the projects that need it.

## What it adds

| Skill | Purpose |
| --- | --- |
| `security:threat-model` | STRIDE threat model built from the code: trust boundaries, a data-flow diagram, verified gaps tiered by exploitability, testable requirements, and incremental reruns against a baseline |
| `security:privacy-review` | Inventory personal data across models, logs, telemetry, and third-party calls. Traces where it flows and rests, and checks minimization, retention, erasure, and export. Not legal advice |
| `security:audit` | Scan the branch's changes and dependencies, have a subagent verify findings, and report a ranked table. Manual: `/security:audit [base-ref]` |

`security:audit` sets `disable-model-invocation`, so Claude does not start it on its own.

## Script permissions

| Skill | Granted command |
| --- | --- |
| `security:audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/scan.py`, with or without arguments |

The grant lets the skill run `scan.py` without a prompt. The script runs the scanners listed under Requirements.

## Requirements

- Python 3 for the `audit` script.
- For `security:audit`, the scanners `gitleaks`, `semgrep`, `trivy`, `govulncheck`, and `pip-audit`. A missing one is reported as "not scanned" and the rest still run. The plugin installs none of them.

## Install

```
claude plugin install security@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/security
```

Without `security`, use the built-in `/security-review` for a model-only read of the branch diff.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/security
   ```
2. Start a fresh session. The skill list should show `security:audit`, `security:privacy-review`, and `security:threat-model`.
3. Run `/security:audit` in a repo with the plugin installed. It should run `scan.py` without a permission prompt.

## Limits

- `security:audit` reports only what the installed scanners find. Unscanned areas show as "not scanned".
- `security:threat-model` reports threats and proposes controls. It never marks a threat accepted for you.
- `security:privacy-review` is not legal advice and does not decide legal basis.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable security@adminhead` |
| Uninstall | `claude plugin uninstall security@adminhead` |

The plugin ships only skills and scripts, so both commands remove everything. Start a new session to be sure they are gone.
