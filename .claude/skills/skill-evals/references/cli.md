# `claude plugin eval`: command, suite schema, report

Verified 2026-10-17 against Claude Code 2.1.302 (`claude plugin eval --help`, `claude plugin eval init --help`) and the official page https://code.claude.com/docs/en/plugin-evals (markdown at https://code.claude.com/docs/en/plugin-evals.md). Manifest field from https://code.claude.com/docs/en/plugins-reference. Quotes are from those sources. Anything not in them is marked "unverified".

## Requirements

- Claude Code v2.1.269 or later; git 2.31 or later if git is installed (an older git stops the run before any case).
- A plugin directory with `.claude-plugin/plugin.json` (or `plugin.json`), or a skills-directory plugin.
- The same credentials as normal sessions. "Every eval run and every judge grader is a real model call on your account."

## Where the suite lives

"An eval suite lives in a directory called `evals/` inside your plugin." In this repo that is `plugins/<name>/evals/`, and `.gitignore` already ignores `plugins/*/evals/results/`, which is where every run writes.

Another directory: `"experimental": { "evals": "quality/evals" }` in `plugin.json`, or `--eval-dir quality/evals` on both `eval` and `eval init`. The flag wins. Relative plain names only; absolute paths or `..` are rejected.

## Suite layout (from the docs' "Eval suite reference")

```text
evals/
├── <case>/                    # one directory per case; nest under a non-case directory to group
│   ├── prompt.md              # frontmatter: case and run fields; body: the prompt
│   ├── case.yaml              # optional: context.* fields, or the whole case in one file
│   ├── graders/<name>.md      # one grader per file; frontmatter: type and options; body: rubric
│   ├── mocks/                 # optional: per-case MCP mocks
│   └── <fixtures, scripts, transcripts referenced by case.yaml>
├── mocks/<server>/<tool>.md   # optional suite-wide MCP mocks (+ _server.md, _tools.json, fixtures/, .replay/)
└── results/<timestamp>/       # written by each run; gitignore it
    ├── aggregate-result.json
    ├── report.html
    └── mock-recordings/
```

"A directory counts as a case when it holds a `prompt.md` or a `case.yaml`, and a case without at least one grader fails to load." The agent under test cannot read the eval directory, so prompts and graders stay hidden from it.

## `prompt.md` frontmatter

"An unknown key is an error." Body = the exact user message. `@path` mentions are not expanded.

| Field | Default | Purpose |
|---|---|---|
| `schema_version` | `"1.1"`, set for you | Case format version |
| `name` | directory name | `--case` globs match it; the report keys on it |
| `description` | | For humans |
| `tags` | `[]` | `--tag` filtering; a case runs if any tag matches |
| `plugins` | nearest enclosing plugin | Plugin dirs under test, relative to the case dir, e.g. `["../.."]` |
| `runs` | `3` | Runs per arm, 1 to 50. `--runs` overrides |
| `expected_outcome` | | For humans. Not used at run time |
| `model` | child session default | `--model` overrides |
| `max_turns` | `10` | Up to 200. Hitting it is a run error and usually lowers the score |
| `timeout_seconds` | `300` | Up to 3600 |
| `allowed_tools` | `[]` | e.g. `[Read, Glob, Grep, Skill]`. Read-only tools are granted when listed; others need `--allow-tools` |
| `append_system_prompt` | | Appended to the child's system prompt |
| `env` | `{}` | Keys must match `EVAL_[A-Z0-9_]*` |

## `case.yaml` fields

Requires `schema_version: "1.1"` and `name`. Top level: `description`, `tags`, `plugins`, `runs`, `expected_outcome`. Under `execution:`: `model`, `max_turns`, `timeout_seconds`, `allowed_tools`, `append_system_prompt`, `env`, and `prompt` (when there is no `prompt.md`). `graders:` is a list of `{ name, type, ...options }`; for `llm` the rubric goes in `criteria`. Only in `case.yaml`:

- `context.scaffold_script`: bash in the case dir, runs in the empty workspace before Claude starts, only with `--scaffold`; minimal env, 120 s limit, non-zero exit fails the run.
- `context.history_file`: a `.jsonl` transcript to resume; the prompt becomes the next turn. With a path target such a case runs one arm by default.
- `context.add_dirs`: directories in the case dir Claude may read (read-only).

When both files exist, `prompt.md` frontmatter overrides `case.yaml`, the `prompt.md` body is the prompt, and `graders/*.md` are added after `case.yaml` graders.

## Grader frontmatter

Grader name = filename without `.md`. Common keys: `type` (required), `weight` (default 1, any positive number), `arm` (`with-only` or `both`).

| Type | Options | Passes when |
|---|---|---|
| `regex` | `pattern`, `flags`, `match`, `target` | JavaScript regex found in target. `match: not_contains` requires absence; `match: "count:N"` exactly N. Use `flags: i`, not `(?i)` |
| `tool_used` | `tool`, `input_match`, `min`, `max` | Calls to `tool` whose JSON-encoded input matches `input_match` number between `min` (default 1) and `max` (default unlimited). `min: 0` + `max: 0` asserts never called |
| `tool_order` | `before`, `after` | Both called and first `before` precedes first `after`. Each is a tool name or `{ tool, input_match }` |
| `file_exists` | `path`, `exists` | A file Claude created matches the glob (or none does with `exists: false`). Only files created during the run count |
| `llm` | `criteria`, `focus` | Judge votes PASS "in at least two of three votes". In `.md` layout the body is the criteria |
| `baseline` | `baseline_file`, `criteria` | Judge finds the run at least as good as the reference `.jsonl` transcript |

"There are no custom-code graders." `regex`, `tool_used`, `tool_order`, `file_exists` are free; `llm` and `baseline` call the judge (three short judge calls per grader per run).

`target` (regex) and `focus` (llm) accept: `last_message` (default), `trace` (session JSON, one message per line, quotes appear as `\"`; an llm judge sees first 12 and last 12 messages), `files` (created paths only, not contents), `{ source: file, path: <path> }` (one produced file's contents; images shown to the judge, other binaries refused), `mock_calls`.

The documented skill-fired idiom:

```yaml
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?your-skill-name"'
```

## Scoring and the baseline arm

- Run score = fraction of graders passed (weighted). Case score = mean over runs. A case passes at `--threshold` (default 1.0).
- Default `--ablation with-without` repeats each case with no plugin loaded: columns `WITH`, `W/OUT`, `Δ`. "If a case scores 1.0 both with and without the plugin, the plugin isn't what made it pass."
- In a two-arm run these graders are reported `scored: false` and shown as a "plugin-fired indicator", not counted in the score: every `tool_used` with `tool: Skill`; `regex` with `target: mock_calls` and `llm` with `focus: mock_calls` when the mocked server is the plugin's; anything marked `arm: with-only`. If every grader in a case would be excluded, they are scored normally. `arm: both` forces scoring in both arms, "which is what you want for a 'must not invoke the skill' check with `min: 0` and `max: 0`". Under `--ablation none` nothing is excluded.
- Single-arm runs show `SCORE` and `PASS%` instead.

## Options (from `--help`, 2.1.302)

| Option | Default | Effect |
|---|---|---|
| `[target]` | `.` | Plugin root path, a single `prompt.md`/`case.yaml`, `name`, `name@marketplace`, or `name@skills-dir`. Put it before `--tag`, `--allow-tools`, `--json` |
| `--case <glob>` | | Filter cases by name |
| `--tag <tag...>` | | Filter by tag (repeatable) |
| `--runs <n>` | `case.runs ?? 3` | Runs per case per arm |
| `-j, --concurrency <n>` | 1 | 1 to 8 parallel runs; share one rate limit |
| `--model <model>` | case `model`, else `ANTHROPIC_MODEL`, else default | Agent under test. Pin in CI |
| `--judge-model <model>` | `--help` says `haiku`; docs say "the model Claude Code uses for background tasks" | Judge for `llm`/`baseline` |
| `--ablation <mode>` | `with-without` when a plugin resolves, else `none` | `none` = one arm |
| `--threshold <0..1>` | 1.0 | Exit 1 if any case below |
| `--max-cost-usd <usd>` | none | Hard ceiling on list-price estimate; exit 2 with partial results |
| `--allow-tools <tools...>` | none | Grant `Bash`, `Write`, `Edit`, `WebFetch`, `WebSearch`, `mcp__*`; supports `Tool(pattern:*)` |
| `--disallow-tools <tools...>` | | Remove built-in tools even if granted |
| `--eval-dir <dir>` | manifest `experimental.evals`, else `evals/` | Suite dir; results go to `<plugin>/<dir>/results/` |
| `--scaffold` / `--no-scaffold` | off | Run `scaffold_script` (author-supplied bash, runs as you) |
| `--mocks <record\|off>` | `record` | `record` answers from `mocks/`, never starts real servers; `off` starts every real server |
| `--allow-real-servers` | off | With `record`, start real servers that have no mock |
| `--trust-plugin` | off | Skip first-run trust prompt (CI). Does not imply `--scaffold`, `--allow-tools`, or `--mocks off` |
| `--json [path]` | off | Full result as JSON to stdout or a `.json` path; quiet run |
| `--output-dir <dir>` | `./<eval dir>/results/<timestamp>/` | Where `aggregate-result.json` and `report.html` go |
| `--report <path>` | results dir | Write the self-contained HTML report elsewhere |
| `--no-publish` / `--publish-report` | publish when the account supports it | Keep the report local, or require publishing |
| `--keep-temp` | off | Keep sandbox dirs |
| `--verbose` | off | Per-message trace to the debug log |

`claude plugin eval init [name]` runs an interview in a terminal and writes cases; `--bare <name>` writes `prompt.md` + `graders/criteria.md` placeholders with no model call; `--eval-dir <dir>` as above.

## Tools and isolation

- Read-only set, granted when listed in `allowed_tools`: `Read`, `Glob`, `Grep`, `NotebookRead`, `Skill`, `AskUserQuestion`, `Agent`, `TodoWrite`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop`. Anything else needs `--allow-tools` or is removed from the session. "Runs never stop to ask for permission."
- Granting `Bash` runs commands under the OS sandbox (Linux needs `bubblewrap` and `socat`; native Windows has no backend).
- Each run: temporary home, working dir, and config; `claude -p` child with only the plugin loaded. No user settings, hooks, `CLAUDE.md`, MCP servers, other plugins, memory, or project `.claude/`. Only an env allowlist plus `EVAL_*` reaches it. The Artifact tool is off.
- Hooks and real MCP servers run outside the sandbox; treat scores from plugins with hooks you did not write as advisory.
- The trust prompt `Trust this plugin directory?` appears on the first run in an untrusted directory; under `--json` or without a TTY the run is refused with exit 1 unless `--trust-plugin`.

## Output

Summary table example from the docs:

```text
CASE        WITH  W/OUT Δ      RUNS COST    NOTES
first-case  1.00  0.33  +0.67  6    $0.41

1 case(s) · mean Δ +0.67 · 74s · $0.41
Report: /Users/you/my-plugin/evals/results/2026-09-10T17-02-11-482Z/report.html
Published: https://claude.ai/... · keep local next time with --no-publish
```

`NOTES` is the highest-weight failing grader's explanation, or the run error, from the with-arm.

`report.html` is self-contained (no external requests). Verdict line, tiles (suite score, ablation Δ, baseline score, cases passing, perfect runs), one card per case with with-arm runs first, failed graders expanded with the judge's votes and evidence, and the prompt and graders at the bottom.

`aggregate-result.json` / `--json`: `schemaVersion: 1`, camelCase, additive. Documented fields: `partial`, `partialReason` (`cost_ceiling` | `interrupted` | `auth_failed`); `aggregates.overallScore`, `aggregates.casesPassed`, `aggregates.casesTotal`, `aggregates.meanDelta`; `cases[].name`, `cases[].aggregates.score`, `cases[].aggregates.delta` (omitted for one-arm); `cases[].arms.with[].error`, `.aborted` (`server`, `tool`, `reason`), `.skippedPaidGraders`; `cases[].arms.without[]`; `costUsd`, `durationSeconds`, `claudeVersion`. Per-run grader results with explanations and evidence are present too, but their exact key names are not spelled out in the docs (unverified).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Every case at or above `--threshold`, nothing else failed |
| 1 | Case below threshold; case file failed to load; no cases; a run could not start or ended on an API error; untrusted dir without `--trust-plugin`; invalid option; `--json` not writable |
| 2 | Partial: cost ceiling hit or credential rejected; JSON written with `partial: true` |
| 130 | Interrupted |
| 143 | Terminated (CI timeout) |

`Δ` never changes the exit code.

## CI (verbatim from the docs)

```bash
claude plugin eval . \
  --trust-plugin \
  --json results.json \
  --threshold 0.8 \
  --model claude-sonnet-5 \
  --judge-model claude-haiku-4-5 \
  --no-publish \
  --max-cost-usd 20
```

Needs a Claude Code install and credentials in the environment. `init` needs a terminal; use `init --bare` in CI. To keep cost down, give every-change suites only free graders and `--ablation none`; leave `partial: true` and `skippedPaidGraders` runs out of trends.

## Mocks (summary)

`evals/mocks/<server>/<tool>.md` (suite) or `<case>/mocks/` (case). Body is the tool result; `{{input.<field>}}` and `{{file:fixtures/<name>}}` substitutions. Frontmatter: `type: fixed|agent`, `expect:` (input guard; violation aborts the run with score 0), `error: true`, `abort_when`. `_server.md` is one agent answering several tools; `_tools.json` is a saved `tools/list`. Agent mocks draw on a budget of 4 × `max_turns` calls per run; adopt recordings into `mocks/.replay/` for repeatable CI. Grade calls with `target: mock_calls` / `focus: mock_calls`.

## Not the same thing

- `claude plugin validate --strict <dir>` checks files and schema, not behaviour.
- `claude plugin test <dir>` runs a mod's `*.test.*` files.
- skill-creator's `evals/evals.json` is a different format; "neither tool reads the other's case files."
- `/skill-doctor` is a usage report, not an eval. See `references/examples.md`.
