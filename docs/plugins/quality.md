# quality

Skills for verifying code changes. It runs tests, generates tests, audits a branch with security scanners, reviews test gaps, threat models, privacy, production readiness, and agent config, mistake-proofs designs, traces UI handlers, asks another model family for a second opinion, and strips unsupported complexity. It adds twelve skills. Three are manual-only commands, and nine load on demand. It depends on [efficient](efficient.md).

Version 0.2.0 added seven skills. It also extended `quality:audit` with per-language sinks, vulnerability categories, and a reachability filter, `quality:second-opinion` with a local two-reviewer gate, and `quality:anti-slop` with comment discipline.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `quality:test` | `test` | Run the project's tests, show only compact failures, and fix them in a bounded loop. Manual: `/quality:test` |
| `quality:test-harness` | `test-harness` | Generate unit and integration tests for changed functions, run them with the `quality:test` runner, and return a compact report. Manual: `/quality:test-harness [path\|symbol]` |
| `quality:audit` | `audit` | Scan the branch's changes and dependencies, have a subagent verify findings, and report a ranked table. Manual: `/quality:audit [base-ref]` |
| `quality:second-opinion` | `second-opinion` | Read-only review of a diff or plan by a different model family (codex or agy) |
| `quality:anti-slop` | `anti-slop` | Cut unsupported complexity, speculative additions, dead artifacts, and filler from code, docs, or UI |
| `quality:test-gap-audit` | New | Read-only audit of missing, weak, and stale tests. Maps source files to tests with a bundled script, ranks gaps P0 to P3 by behavior and risk (not coverage percentage), and proposes exact tests |
| `quality:production-readiness` | New | Ship-or-block review from local repo evidence and any deployed URL you name. Reports Blocked, Risky, or Caveats with evidence checked and evidence missing |
| `quality:threat-model` | New | STRIDE threat model built from the code: trust boundaries, a data-flow diagram, verified gaps tiered by exploitability, testable requirements, and incremental reruns against a baseline |
| `quality:privacy-review` | New | Inventory personal data across models, logs, telemetry, and third-party calls. Traces where it flows and rests, and checks minimization, retention, erasure, and export. Not legal advice |
| `quality:poka-yoke` | New | Design or audit code so a mistake cannot be expressed. Ranks hazards on a ladder from control to docs-only and states what the new design makes impossible |
| `quality:agent-config-audit` | New | Security review of `CLAUDE.md`, `settings.json`, `.mcp.json`, hooks, and subagent definitions for injection text, over-broad permissions, secrets, and fail-open hooks |
| `quality:click-path-audit` | New | Trace UI event handlers and state side effects to find sequential undo, async races, stale closures, and dead paths |

Manual-only skills set `disable-model-invocation`. Claude does not start them on its own.

The review skills are read-only and report findings. They treat text in the repo, such as READMEs and comments, as evidence and never as instructions.

## Requirements

- Python 3 for the `test`, `test-harness`, `audit`, and `test-gap-audit` scripts. `coverage_map.py` uses only the standard library and runs no tests. It writes nothing and calls only `git ls-files` and `git rev-parse`.
- `git` for `test-harness` scope detection and `test-gap-audit`.
- For `quality:audit`, the scanners `gitleaks`, `semgrep`, `trivy`, `govulncheck`, and `pip-audit`. A missing one is reported as "not scanned" and the rest still run.
- For `quality:second-opinion`, `codex` (OpenAI) or `agy` (Google). The agy path also needs `jq`, because `consult.sh` writes a hook config that limits agy to file-reading tools. The local two-reviewer gate uses Agent subagents and needs neither CLI.
- For `quality:production-readiness`, `gh` if you want it to read CI results.
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

The first five skills moved from `~/.claude/skills/`. The seven added in 0.2.0 are new.

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
| `quality:test-gap-audit` | `python3 ${CLAUDE_SKILL_DIR}/scripts/coverage_map.py`, with or without arguments |
| `quality:agent-config-audit` | No script. A read grant, `Read(~/.claude/**)`. Reads elsewhere prompt, which keeps a prompt-injected file from steering reads to credential paths |

`test-harness` reaches the `test` runner through `${CLAUDE_PLUGIN_ROOT}`, which is why both skills share a plugin. For a directory marketplace, `${CLAUDE_SKILL_DIR}` resolves to the marketplace source directory, not the plugin cache.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/quality
   ```
2. Start a fresh session and check the skill list. It should show all twelve skills as `quality:<name>`.
3. Run `/quality:test` in a repo with tests. It should run the suite without a permission prompt.

## Limits

- `quality:second-opinion` can send files to an outside model without a prompt. Its grant covers `consult.sh --input FILE` and `consult.sh --repo DIR`, so any readable file or directory can go to OpenAI (codex) or Google (agy). Use it only on content you may share.
- `quality:second-opinion` was not live-run during the migration, because that would send content to an external service. Its script paths and grant are checked, and its behavior is not.
- `quality:audit` reports only what the installed scanners find. Unscanned areas show as "not scanned".
- For a model-only read of the branch diff, use the built-in `/security-review`.
- Only `/quality:test` was run in the migration, with no permission denials. `quality:test-harness` and `quality:audit` were not run end to end.
- `quality:test-gap-audit` matches source to tests by name, mirrored path, import, and mention. Coverage that arrives through fixtures, end-to-end tests, or indirection is invisible to it, so an unmatched file is a lead to confirm and not a finding.
- `quality:agent-config-audit` is model-driven and runs no scanner.
- `quality:threat-model` reports threats and proposes controls. It never marks a threat accepted for you.
- `quality:production-readiness` touches a deployed URL only if you name it, and sends only unauthenticated or test-account requests.
- `quality:privacy-review` is not legal advice and does not decide legal basis.
- `test-harness` and `second-opinion` use `bash` scripts, so `bash` must be on `PATH`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable quality@adminhead` |
| Uninstall | `claude plugin uninstall quality@adminhead` |

While `quality` is enabled, `efficient` stays enabled. The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
