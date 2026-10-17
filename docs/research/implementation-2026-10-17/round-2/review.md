# Batch `review` (round 2)

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `poka-yoke` | skill | Poka-yoke skill: design or audit code so mistakes cannot be expressed, ranking hazards on a control, warning, detection and docs-only ladder, and sweeping for the hazard class after an incident. | archive/plugins/review/skills/poka-yoke (SKILL.md + references/hazard-catalog.md) | none |
| `review-loop` | skill | Review, fix and re-review loop: built-in /code-review finds issues, a fixer subagent fixes the flagged IDs, and a fresh re-reviewer checks only those IDs from a shared findings file, for up to three rounds. | archive review/skills/review-loop (rewritten), archive review/evals/review-loop-routing | none |
| `consult` | mod | A mod that registers the mcp__consult__consult tool: a read-only diff or plan review by the codex (OpenAI) or agy (Google Gemini) CLI, with a repo opt-out marker, a secret-file block, timeouts and a read-only agy hook gate. | archive review/hooks (hooks.json, register.tsx, consult/consult.ts), review/tests/consult.test.ts, review/scripts/consult.spec.ts, review/skills/second-opinion/scripts/agy-gate.sh + tests/agy-gate-check.sh | none |
| `second-opinion` | skill | Second-opinion skill: pick codex or agy, model, effort and pass size for a read-only outside review of a diff or plan through the consult tool, weigh the replies, or run a local two-reviewer gate. | archive review/skills/second-opinion (SKILL.md, references/consolidation.md, references/dual-review.md) | `consult` |

Layout of `consult`: `hooks/hooks.json`, `hooks/register.tsx` (`$` code), `hooks/consult/consult.ts` (pure), `scripts/agy-gate.sh`, `tests/consult.test.ts` (mod tests), `tests/consult.spec.ts` (bun spec), `tests/agy-gate-check.sh`, `README.md` (follows the `mcp-health` model).

## Validation and tests

- `claude plugin validate --strict plugins/{poka-yoke,review-loop,consult,second-opinion}`: all pass. consult shows `hooks: session.start, tool.call{tool=?}`, `gating hook with .catch: tool.call{tool=?}` (the matcher is the imported `TOOL_NAME` constant, so validate prints `?`).
- `claude plugin test plugins/consult`: 38 pass, 0 fail (the 36 archived tests plus a new pass-through test and a gate-path assertion).
- `bun test plugins/consult/tests/consult.spec.ts`: 13 pass. Run it by file path: `bun test plugins/consult/tests` also picks up `consult.test.ts`, which fails under bun because it imports `claude-code/testing`.
- `bash plugins/consult/tests/agy-gate-check.sh`: all passed.
- grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `review:`, `mcp__review`, `Efficient `, `coding-js`, `coding-python`, `db:` across the four plugins: none left.

## Changes and deviations

- **Tool name.** cc.d.ts (`$.tool.register`, `ToolSpec.name`) says the model calls a registered tool `mcp__<plugin>__<name>`, so with plugin `consult` and tool name `consult` it is `mcp__consult__consult`. `TOOL_NAME`, the skill, the tests and the "allow ... to run it unattended" message use it. `session.start` now logs if `$.tool.register` returns a different full name.
- **Gate path.** The mod now uses `$.plugin.root/scripts/agy-gate.sh`.
- **Fail closed.** The `tool.call` hook now matches `{ tool: TOOL_NAME }` instead of checking inside the body, and has `.catch(($, e, next) => next.called ? next(e) : { deny })`, per the mod-authoring house rule. The archived hook had no `.catch`.
- **agy effort.** agy 1.4's `--help` lists `--effort low|medium|high|xhigh|max`, so `xhigh` is now accepted for agy (before it was refused). The test now checks that agy accepts `xhigh` and refuses `ultra`.
- **Model names.** Checked against the installed CLIs, not the web: `codex debug models` (codex-cli 0.162.1) lists `gpt-6.1-sol` (latest workhorse), `gpt-6-astra` (frontier), `gpt-6-sol` (previous), `gpt-6-luna` (fast); `agy models` (agy 1.4.0) lists `gemini-4-argon-{low,medium,high}` and `gemini-3.8-flash-{low,medium,high}`. `gemini-3.1-pro-high` from the archive is gone. Matrix: luna/flash-medium for a borderline finding, `gpt-6.1-sol` / `gemini-3.8-flash-high` for a normal diff, `gpt-6-astra` / `gemini-4-argon-high` for risky diffs and plans. The skill also names the tiers generically and says to re-list with those commands when a name is refused. Also confirmed in `codex exec --help` / `codex exec review --help` that every flag the mod passes (`-s`, `-C`, `--skip-git-repo-check`, `--ephemeral`, `-c`, `-m`) still exists.
- **review-loop.** Rewritten so round 1 runs the built-in `code-review` skill (effort level + target, never `--fix`). Claude writes its output into the findings file with stable IDs, a fixer subagent (`coder` if installed) fixes only those IDs, and a fresh read-only re-reviewer (`reviewer` if installed) each round checks open IDs plus regressions in the fix diff, with a 3-round cap. If no subagents are available, it falls back to re-running `/code-review` on the fix diff. Eval graders renamed to `review-loop:review-loop` / `second-opinion:second-opinion`.
- **Descriptions** trimmed to under 350 characters; the "Not for ..." lists moved into the bodies. Cross-refs renamed (`typescript`, `python`, `golang`, `rust`, `db-schema-design`, `planning`, `implement-plan`, `review-loop`, `second-opinion`, each "if installed").
- The consult reply header still reads `second-opinion: <cli> <model>/<effort> ...`, and the agy temp dir and hook key still use the `second-opinion` prefix. These names are cosmetic and the tests check them, so I left them alone.
- No upstream attribution or license was needed: the archived review plugin was first-party.

## Unverified / TODO

- I did not run a live end-to-end consult call (codex or agy). Two things are confirmed only from the typings and are untested live: that the plugin-scoped tool really registers as `mcp__consult__consult` when installed from the marketplace, and that the `{ tool: TOOL_NAME }` matcher fires.
- I did not check that agy's `--effort xhigh` works with Gemini models; the flag only appears in `--help`.
- I did not run the review-loop routing eval (`claude plugin eval`).
- I did not look at how the built-in `/code-review` formats its output beyond its skill description. The findings-file step assumes it lists findings with file:line.

## Suggested follow-ups

- Run `claude plugin eval plugins/review-loop` once it is registered, and add a second-opinion routing eval (plan critique by another model family).
- Live smoke test: install `consult` and call `mcp__consult__consult` in plan mode with each CLI.
- `reviewer` is a natural fit for the review-loop re-reviewer role; it is already gated read-only by `readonly-agent-gate`.
