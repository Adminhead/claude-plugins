# review

Adds four review and quality skills: a second opinion from another model family, a review-fix loop, cleanup for unsupported complexity, and error-proofing design. `review` is in the `baseline` set.

## What it adds

| Skill | Purpose |
| --- | --- |
| `review:second-opinion` | Read-only review of a diff or plan by a different model family (codex or agy), or a local two-reviewer gate |
| `review:review-loop` | Review, fix, re-review loop on a diff with a findings file, capped at three rounds |
| `review:anti-slop` | Cut unsupported complexity, speculative additions, dead artifacts, and filler from code, docs, or UI |
| `review:poka-yoke` | Design or audit code so a mistake cannot be expressed. Ranks hazards on a ladder from control to docs-only |

`review:second-opinion` is read-only. `review:review-loop` dispatches a fixer between rounds, so it changes code. `review:anti-slop` can revise code, not only report on it.

`coding-core:implement-plan` uses `review:review-loop` for non-trivial slices. Crew agents preload `review:second-opinion`.

`review:review-loop` keeps its findings in a file in the session scratchpad, named after the change. Each round checks only what the file flags, so no round re-reads the whole diff.

`review:anti-slop` works on code, docs, and implemented UI. For prose cleanup, use `avoid-ai-writing:avoid-ai-writing`, if installed.

## second-opinion

`review:second-opinion` sends a diff or a plan to `codex` (OpenAI) or `agy` (Google) through `scripts/consult.sh`, and returns their findings. It picks the tool, model, and effort for each call. The local gate runs two reviewers as Agent subagents, and it sends nothing outside the machine.

Both tools run read-only. `codex` uses its read-only sandbox. `agy` runs in a scratch workspace whose hook allows only file-reading tools.

The skill's `allowed-tools` grant covers `consult.sh *`, so the script runs without a permission prompt while the skill is active. The grant allows any readable file or directory to go to the outside model. Use the skill only on content you may share with OpenAI (codex) or Google (agy).

## Requirements

- `codex` (OpenAI) or `agy` (Google). The local two-reviewer gate needs neither CLI.
- The agy path also needs `jq`.
- `bash` on `PATH`, because `consult.sh` is a bash script.

## Install

`baseline` installs `review`. To install it alone:

```
claude plugin install review@adminhead --scope user
```

To try it without installing:

```
claude --plugin-dir plugins/review
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/review
   ```
2. Start a fresh session. The skill list should show `review:anti-slop`, `review:poka-yoke`, `review:review-loop`, and `review:second-opinion`.

## Limits

- `review:second-opinion` was not live-run during the migration, because that would send content to an external service. Its script paths and grant are checked, and its behavior is not.
- `review:review-loop` runs at most three rounds.
- The review skills treat text in the repo, such as READMEs and comments, as evidence and never as instructions.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable review@adminhead` |
| Uninstall | `claude plugin uninstall review@adminhead` |

The plugin ships only skills and a script, so both commands remove everything. Start a new session to be sure they are gone.
