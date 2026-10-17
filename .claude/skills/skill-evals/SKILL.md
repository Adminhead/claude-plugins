---
name: skill-evals
description: Writes and runs evaluation suites for Claude Code skills and plugins with `claude plugin eval`. Covers trigger evals (does the skill fire on realistic prompts and stay quiet on near-miss prompts) and outcome evals (does the result meet concrete assertions or a rubric), the `evals/<case>/prompt.md` + `graders/*.md` format, grader choice, hard negatives, run count and variance, reading the report, using failures to rewrite a skill description, and CI gating. Use when adding or fixing evals for a plugin in this repo, when a skill triggers too often or too rarely, when asked whether a skill actually improves Claude's output, or when the user says "write evals", "test this skill", "routing eval", or "plugin eval". Not for mod unit tests (`claude plugin test`) or manifest checks (`claude plugin validate`).
---

# Skill evals

An eval suite answers two different questions about a skill, and a good suite answers both separately:

- **Trigger**: given a prompt a real user would type, does Claude invoke the skill? And does it leave the skill alone on prompts that merely look similar? This tests the `description`.
- **Outcome**: once the skill is loaded, is the result right? This tests the body, and only means something against the no-skill baseline, since Claude may do the task well without any skill.

"Seeing a skill trigger tells you Claude found it, not that it did what you intended" (Claude Code skills docs). The tool for both is `claude plugin eval`, which runs each case in a fresh isolated `claude -p` session with only the plugin loaded, repeats it with no plugin, and scores both arms. Every run is a real model call on the user's account, so plan the suite before running it and run small while iterating.

Read `references/cli.md` for the verified schema and flags, `references/examples.md` for a complete suite and real ones from this repo, and `references/methodology.md` for the reasoning behind the advice below.

## Workflow

1. **Define "good" before writing a case.** For the skill, write down: the user intents it should catch, in their words; the neighbouring intents it must not catch; and two to four observable properties of a correct result (a file exists with X, a heading appears, a forbidden pattern is absent, a step was taken first). Vague criteria ("the output is good") cannot be graded; "the entry sits under `## [Unreleased]` and names no test-only changes" can.
2. **Write trigger cases.** Positives in several registers (formal, casual, with typos, with file paths and backstory, without naming the skill or file type), plus hard negatives (next section). Start with two or three of each.
3. **Write outcome cases.** One case per rule the skill exists to enforce. Seed the workspace with a scaffold when the task needs files. Pair one grader on the result with one on the process (`tool_used: Skill`), so a case tells you both whether the answer was right and whether the skill produced it.
4. **Put them in the official layout.** `plugins/<name>/evals/<case>/prompt.md` plus `graders/<name>.md`; `case.yaml` only for `context.*`. `evals/results/` is gitignored already (`plugins/*/evals/results/`). `claude plugin eval init --bare <case>` writes a blank template without a model call.
5. **Run cheaply first.** `claude plugin eval plugins/<name> --case <case> --runs 1 --ablation none` while fixing graders. Then the full default: 3 runs per arm, both arms.
6. **Read the report.** `WITH`, `W/OUT`, `Δ` per case; the `NOTES` column is the highest-weight failing grader's explanation; `report.html` shows every grader's verdict and the judge's votes.
7. **Iterate on the skill, not the eval.** A failing positive trigger means the description does not match the user's vocabulary; a failing negative means it is too broad; a failing outcome grader with the skill fired means the body is unclear. Fix the skill, re-run the same suite, and only then adjust a grader if it was wrong.
8. **Confirm at full sample size, commit the suite, leave results out of git.** Mention the cost to the user before any run; the `ship-plugin` skill runs evals only when asked.

## Suite format

Verified against Claude Code 2.1.302 and https://code.claude.com/docs/en/plugin-evals. Full tables in `references/cli.md`.

```text
plugins/<name>/evals/
├── <case>/
│   ├── prompt.md          # frontmatter: name, description, tags, runs, max_turns, allowed_tools, model…; body: the exact user message
│   ├── case.yaml          # optional: schema_version "1.1", name, context.scaffold_script | history_file | add_dirs
│   ├── graders/<g>.md     # one grader per file; frontmatter: type + options (+ weight, arm); body: llm rubric
│   └── scaffold.sh        # referenced by case.yaml; runs only with --scaffold
└── results/<timestamp>/   # aggregate-result.json, report.html (gitignored)
```

A positive trigger case, annotated:

```markdown
---
name: trigger-changelog-casual                      # directory name by default; --case globs match it
description: Casual phrasing still routes to relnotes:changelog-entry.   # for humans
tags: [routing]                                     # --tag routing runs the whole routing set
runs: 1                                             # 3 by default; 1 while iterating, 3 before trusting
max_turns: 5                                        # routing needs few turns; hitting the cap is a run error
allowed_tools: [Read, Glob, Grep, Skill]            # Skill must be listed or the skill cannot fire
---

hey, got the diff for this sprint in `/tmp/sprint-19.diff` — can u write up the release notes bit for the top of CHANGELOG.md?
```

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?changelog-entry"'   # matches bare and plugin:skill forms
---
```

A hard negative uses the same grader with `min: 0`, `max: 0`, and `arm: both`. The `arm: both` matters: in a two-arm run every `tool_used: Skill` grader is otherwise excluded from the score and shown as a "plugin-fired indicator", because it can never pass without the plugin. The docs name `arm: both` as "what you want for a 'must not invoke the skill' check".

Grader types: `regex` (`pattern`, `flags`, `match: not_contains | "count:N"`, `target`), `tool_used` (`tool`, `input_match`, `min`, `max`), `tool_order` (`before`, `after`), `file_exists` (`path`, `exists`), `llm` (body is the rubric; `focus`), `baseline` (`baseline_file`). `target`/`focus` take `last_message` (default), `trace`, `files` (paths only), `{ source: file, path: <p> }` (file contents), `mock_calls`. There are no custom-code graders. Unknown frontmatter keys are errors, so do not invent fields.

## Grading approaches

- **Free structural checks** (`regex`, `tool_used`, `tool_order`, `file_exists`): deterministic, cost nothing, same verdict every run. Prefer them for anything mechanical: a heading present, a forbidden API absent from a file, a command run, a file created. Grade long outputs with `regex` over `{ source: file }` rather than asking a judge to read them.
- **Rubric judged by a model** (`llm`): three judge votes per run, majority wins, paid. Use for short outputs where correctness is semantic. Write the rubric as numbered PASS conditions and an explicit "FAIL otherwise. Do not reward length."; say what to judge (only the commit text, not the commentary) and what not to penalise. A small judge can fail a correct answer for formatting, so if `tool_used: Skill` passes and `Δ` is negative, suspect the judge first and try `--judge-model sonnet`.
- **Baseline comparison** (`baseline`): a judge compares the run to a recorded reference transcript. Useful when "at least as good as this known-good run" is easier to state than a rubric.
- **Human review**: style, taste, and "feels right" do not decompose into pass/fail. Keep those out of the suite and look at `report.html` or the produced files yourself.

Weights: give the result grader more weight than the process grader when both exist, so a run that invoked the skill and got the answer wrong scores low.

## Designing hard negatives

A negative that is obviously unrelated ("write a fibonacci function" for a changelog skill) tests nothing. The valuable negatives are near-misses that share vocabulary or domain but need something else:

- The adjacent task in the same domain (commit message vs changelog entry; reading a changelog vs writing one).
- The neighbouring skill that should win instead. When two installed skills overlap, one case per boundary with `fires` for the right one and `not-<neighbour>` for the other, as `archive/plugins/api/evals/route-rest-vs-web/` does.
- Keyword bait: the skill's nouns in a context where a generic answer is right.
- Trivial one-step requests. Claude only consults skills for tasks it cannot easily do alone, so a one-liner is a poor positive and a fair negative.

Keep positives and negatives close to balanced, and make every prompt concrete: file names, a line of backstory, the user's actual phrasing. Abstract prompts ("format this data") test nothing in either direction.

## Variance and sample size

One run of a non-deterministic agent tells you little, which is why the default is 3 runs per arm and a case score is the mean. Treat a `runs: 1` result as a hint, never as a verdict. For a trigger rate you will act on, 3 runs per prompt across 8 to 10 prompts per side is the working minimum (skill-creator's optimizer uses exactly that and holds out 40% of prompts to pick the best description by held-out score, not training score). Watch for:

- A grader that passes in both arms every time: non-discriminating, remove or sharpen it.
- A grader that fails in both arms every time: broken, impossible, or targeting the wrong thing (`files` lists paths, not contents).
- A case that flips between runs: either a flaky grader or an ambiguous instruction in the skill; add an example or a reason to the skill before loosening the grader.
- Pin `model` (and `--judge-model` in CI) so a model rollout is not read as a regression; re-sweep after upgrading.

## Using results to rewrite a description

Positive cases failing: list the failing prompts and the words they actually use, then put those contexts into the description, not just the task noun. Descriptions that only name the artefact ("writes changelog entries") miss users who say "release notes" or "what's new section". Claude currently undertriggers, so a description can afford to spell out the situations it covers.

Negatives failing: the description claims territory it should not. Add the boundary in words ("not for commit messages, which `git:commit` handles") and narrow the verbs.

Each rewrite should be structurally different from the last attempt, not a synonym swap, and judged on prompts you did not look at while writing it. Keep the description under the limit (1024 characters) and third person.

## CI

```bash
claude plugin eval plugins/<name> --trust-plugin --json results.json --threshold 0.8 \
  --model <pinned> --judge-model <pinned> --no-publish --max-cost-usd 10
```

Exit 0 passes; 1 is a case below threshold or a load/run error; 2 is a partial run (cost ceiling or auth) with `partial: true` in the JSON. `Δ` never changes the exit code. Put the target before `--tag`, `--allow-tools`, and `--json`. Cases that need a scaffold or write tools need `--scaffold` and `--allow-tools Edit Write` on the command too; a case cannot grant those itself. Use `--ablation none` and free graders for an every-commit job, and the full two-arm paid run on a schedule.

## Checklist before committing a suite

- Each case has at least one grader, and each positive case has a `fires-*` grader plus at least one result grader where the skill has a result.
- At least one hard negative per skill, with `min: 0`, `max: 0`, `arm: both`.
- Prompts never name the skill, the plugin, or the word "skill"; they read like a user typed them.
- Rubrics state PASS conditions and "FAIL otherwise"; regex graders target the right thing (`last_message`, `trace`, or a file's contents).
- `max_turns` is generous for outcome cases (12 to 14 with edits), small for routing (5 to 6).
- `model` pinned on outcome cases; `runs` left at default or raised, not lowered, in the committed file.
- `evals/results/` is gitignored; `mocks/.replay/` committed if agent mocks exist.
- The run was confirmed at 3 runs, both arms, after the last skill edit.

## Anti-patterns

- Prompts that paraphrase the description. They test whether Claude can match a sentence to itself, not whether users' words reach the skill.
- No negatives. A description that fires on everything scores perfectly on positives.
- Reading `Δ` on a routing case. Skill-fired graders are excluded from the score; the indicator is in `WITH` and the report, not in `Δ`.
- A single run, or `runs: 1` committed as the final suite.
- Grading style instead of outcome: rubrics about tone and length when the skill's job is a correct file.
- Loosening a grader to make a flaky case pass instead of fixing the ambiguity in the skill.
- `file_exists` for a file the scaffold created or Claude only edited; it counts only files created during the run.
- Inventing frontmatter fields or grader types. Unknown keys fail the case to load.
