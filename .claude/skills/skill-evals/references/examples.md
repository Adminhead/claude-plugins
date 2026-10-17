# Examples: a complete suite, real suites from this repo, a real report

Written 2026-10-17. The file formats follow https://code.claude.com/docs/en/plugin-evals (checked against Claude Code 2.1.302). The "real suites" section quotes case files this repo ran under `archive/plugins/*/evals/` and a real `aggregate-result.json` from `archive/plugins/efficient-core/evals/results/2026-10-10T20-57-35-046Z/` (Claude Code 2.1.296). The `/skill-doctor` excerpt is from a `claude -p "/skill-doctor"` run on this machine the same day.

## 1. A complete suite for a hypothetical skill

The plugin is `relnotes` at `plugins/relnotes/`. Its one skill, `skills/changelog-entry/SKILL.md`, turns a diff or a list of commits into a Keep a Changelog entry under `## [Unreleased]`, grouped by `### Added`, `### Changed`, `### Fixed`, with one line per user-visible change and no entries for refactors or test-only changes.

What "good" means, written before any case: (a) the skill fires on requests to write or update a changelog from code changes, phrased any way a developer would; (b) it does not fire for commit messages, release tagging, or reading an existing changelog; (c) the entry goes under `[Unreleased]`, uses the three headings, and does not invent changes the diff does not show.

```text
plugins/relnotes/evals/
├── trigger-changelog-formal/
│   ├── prompt.md
│   └── graders/fires.md
├── trigger-changelog-casual/
│   ├── prompt.md
│   └── graders/fires.md
├── near-miss-commit-message/
│   ├── prompt.md
│   └── graders/not-changelog.md
├── near-miss-read-changelog/
│   ├── prompt.md
│   └── graders/not-changelog.md
├── output-unreleased-entry/
│   ├── case.yaml
│   ├── scaffold.sh
│   ├── prompt.md
│   └── graders/
│       ├── fires.md
│       ├── under-unreleased.md
│       ├── no-invented-items.md
│       └── edits-changelog.md
└── results/            # gitignored
```

### Positive trigger, formal phrasing

`trigger-changelog-formal/prompt.md`. The prompt never says "changelog-entry" or "skill"; it describes the situation the way a user would. `runs: 1` keeps iteration cheap; raise it to 3 (the default) before trusting a result.

```markdown
---
name: trigger-changelog-formal
description: A request to update the changelog from a set of commits routes to relnotes:changelog-entry.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

We're cutting 2.4.0 on Friday. Since 2.3.1 there are 14 commits on main: the retry logic for uploads was rewritten, the `--quiet` flag was added to the CLI, and the crash when the config file is empty was fixed, plus a pile of test and CI changes. Please update CHANGELOG.md for this release.
```

`trigger-changelog-formal/graders/fires.md`. The documented idiom: `tool_used` on `Skill` with an `input_match` over the JSON-encoded tool input. The optional `(?:[\w-]+:)?` accepts both `changelog-entry` and `relnotes:changelog-entry`.

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?changelog-entry"'
---
```

### Positive trigger, casual paraphrase

`trigger-changelog-casual/prompt.md`, same grader file. Lowercase, abbreviations, a file path, no mention of "changelog" as a verb. If this one fails while the formal one passes, the description is matching vocabulary rather than intent.

```markdown
---
name: trigger-changelog-casual
description: Casual phrasing with a diff path still routes to relnotes:changelog-entry.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

hey, got the diff for this sprint in `/tmp/sprint-19.diff` — can u write up the release notes bit for the top of CHANGELOG.md? mostly the new export button + a couple of fixes in the date parser i think
```

### Hard negative: commit message

`near-miss-commit-message/prompt.md`. It shares the words "changes", "message", "describe" and the Conventional Commits vocabulary, and the output is a short summary of a diff, which is the nearest neighbour to a changelog entry. The grader must assert zero calls, and needs `arm: both` so it is scored in the two-arm run instead of being treated as a plugin-fired indicator.

```markdown
---
name: near-miss-commit-message
description: A commit-message request does not route to relnotes:changelog-entry.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I've staged the fix for the empty-config crash (two files, about 20 lines). Write me a Conventional Commits message for it, subject plus a two-line body explaining the cause.
```

`near-miss-commit-message/graders/not-changelog.md`:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?changelog-entry"'
min: 0
max: 0
arm: both
---
```

### Hard negative: reading, not writing

`near-miss-read-changelog/prompt.md`, same `not-changelog.md` grader. The word "changelog" appears, but the task is retrieval.

```markdown
---
name: near-miss-read-changelog
description: Asking what shipped in an old version is a read, not a changelog-entry task.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

What changed between 2.1.0 and 2.2.0? Just summarise what CHANGELOG.md says about those two versions, I don't need anything written.
```

### Outcome case with a scaffold and file graders

`output-unreleased-entry/case.yaml`. The `context` block only exists in `case.yaml`; the rest stays in `prompt.md`.

```yaml
schema_version: "1.1"
name: output-unreleased-entry
context:
  scaffold_script: scaffold.sh
```

`output-unreleased-entry/scaffold.sh`. Runs in the empty workspace only when the run passes `--scaffold`. Files and git state only; a `CLAUDE.md` it writes would not be loaded.

```bash
#!/usr/bin/env bash
set -euo pipefail
cat > CHANGELOG.md <<'J'
# Changelog

## [Unreleased]

## [2.3.1] - 2026-09-30
### Fixed
- Uploads over 2 GB no longer stall at 99%.
J
cat > staged.diff <<'J'
diff --git a/src/config.py b/src/config.py
@@ -10,6 +10,8 @@ def load(path):
-    return json.loads(open(path).read())
+    text = open(path).read()
+    # An empty file used to raise JSONDecodeError at startup.
+    return json.loads(text) if text.strip() else {}
diff --git a/src/cli.py b/src/cli.py
@@ -4,6 +4,7 @@ parser = argparse.ArgumentParser()
+parser.add_argument("--quiet", action="store_true", help="suppress progress output")
diff --git a/tests/test_config.py b/tests/test_config.py
@@ -0,0 +1,4 @@
+def test_empty_config_is_empty_dict(tmp_path):
+    ...
J
```

`output-unreleased-entry/prompt.md`. `Edit` and `Write` are listed in `allowed_tools`, but the run only gets them if the command passes `--allow-tools Edit Write`. `model` is pinned so a model rollout is not read as a regression.

```markdown
---
name: output-unreleased-entry
description: "Entry from staged.diff lands under [Unreleased] with the right headings and nothing invented."
tags: [quality]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
model: claude-sonnet-5-5
---

The change I'm about to release is in `staged.diff`. Add it to `CHANGELOG.md` in the usual place. Don't run git.
```

Graders. `fires.md` is the same file as above (process grader: the skill produced this). The other three grade the result.

`graders/under-unreleased.md`, a free check over the produced file's contents. JavaScript regex, `s` flag so `.` crosses newlines:

```markdown
---
type: regex
pattern: '## \[Unreleased\]\s*\n(?:.*\n)*?### (Added|Fixed)'
flags: s
target:
  source: file
  path: CHANGELOG.md
---
```

`graders/no-invented-items.md`. The diff has a fix and an addition and a test change. A line about tests, or a `### Changed` heading, means the skill padded the entry:

```markdown
---
type: regex
pattern: '### Changed|[Tt]est'
match: not_contains
target:
  source: file
  path: CHANGELOG.md
---
```

`graders/edits-changelog.md`. `file_exists` only sees files created during the run, and the scaffold created `CHANGELOG.md`, so assert the edit through the tool call instead:

```markdown
---
type: tool_used
tool: Edit
input_match: 'CHANGELOG\.md'
---
```

An `llm` grader is reasonable here too, kept short and concrete. It costs three judge calls per run, so add it only if the regexes leave a gap, for instance "each bullet describes a user-visible effect, not an implementation detail":

```markdown
---
type: llm
focus:
  source: file
  path: CHANGELOG.md
---

Judge only the text under `## [Unreleased]`.
PASS only if ALL of: (1) exactly two bullets, one under `### Fixed` about an empty config file no longer crashing, one under `### Added` about a `--quiet` flag; (2) each bullet is one line written for a user, naming the effect rather than the function or file; (3) no bullet mentions tests, CI, or refactoring.
FAIL otherwise. Do not reward length.
```

### Running it

```bash
# iterate on one case cheaply
claude plugin eval plugins/relnotes --case trigger-changelog-casual --runs 1 --ablation none

# the routing set, both arms, default 3 runs
claude plugin eval plugins/relnotes --tag routing

# the outcome case needs the scaffold and the write tools
claude plugin eval plugins/relnotes --case output-unreleased-entry --scaffold --allow-tools Edit Write

# CI
claude plugin eval plugins/relnotes --trust-plugin --json results.json --threshold 0.8 \
  --model claude-sonnet-5-5 --judge-model claude-haiku-4-5 --no-publish --max-cost-usd 10 \
  --scaffold --allow-tools Edit Write
```

## 2. Real suites this repo ran

These are verbatim from `archive/plugins/` (same format, earlier plugin names). They show the house pattern: one `fires-*` grader per case, `not-*` graders with `min: 0`, `max: 0`, `arm: both` for neighbours, `runs: 1` while iterating, `tags: [routing]` or `[quality, stance]`.

`archive/plugins/git/evals/commit-near-miss/prompt.md` and `graders/not-commit.md`, a hard negative that shares the domain (git) and the shape (a one-line answer about a command):

```markdown
---
name: commit-near-miss
description: A read-only history question does not route to git:commit.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Show me the last five commits on this branch with their authors and dates, one line per commit. Tell me which git command gives that.
```

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?commit"'
min: 0
max: 0
arm: both
---
```

`archive/plugins/api/evals/route-rest-vs-web/` tests the competing-skill case: `fires.md` requires `api:rest-design`, and `not-neighbour.md` forbids `web:web-development` with the same `min: 0` / `max: 0` / `arm: both` pattern. When two plugins' skills overlap, one case per boundary is how to find out which one wins.

`archive/plugins/coding-js/evals/stance-react-measure-first/` is an outcome case built around a rule in the skill ("measure first, no blind memoization"). It pairs an `llm` grader whose body quotes the rule and lists three numbered PASS conditions ending with "FAIL otherwise. Do not reward length." with a free `regex` grader that checks the produced file directly:

```markdown
---
type: regex
pattern: 'useMemo|useCallback|React\.memo|\bmemo\('
match: not_contains
target:
  source: file
  path: src/ProductList.tsx
---
```

`archive/plugins/sentry-core/evals/profile-changes-output/` grades a generated file through `tool_used` on `Write` with `input_match` for each required value (`BILLING_SENTRY_DSN`, `0\.07`, `before_send[\s\S]*email`). That works because the file is written once; for a file that is edited several times, grade the file contents instead.

Across the archived suites the grader mix was 143 `tool_used`, 3 `llm`, 1 `regex`, and 61 graders carried `arm: both`. Nearly all of it was routing; outcome coverage was thin, which is the gap a new suite should close.

## 3. What a real result looks like

Summary table (from the docs; the archived runs printed the same columns):

```text
CASE        WITH  W/OUT Δ      RUNS COST    NOTES
first-case  1.00  0.33  +0.67  6    $0.41

1 case(s) · mean Δ +0.67 · 74s · $0.41
Report: .../evals/results/2026-09-10T17-02-11-482Z/report.html
```

`aggregate-result.json` from `archive/plugins/efficient-core/evals/results/2026-10-10T20-57-35-046Z/` (Claude Code 2.1.296), abbreviated. Documented fields are in `cli.md`; the per-run and grader keys below are what that file contained and are not all in the docs, so treat them as observed rather than guaranteed:

```json
{
  "schemaVersion": 1,
  "claudeVersion": "2.1.296",
  "durationSeconds": 110,
  "costUsd": 0.41,
  "partial": false,
  "suite": { "root": "...", "ablation": "with-without", "threshold": 1, "concurrency": 1,
             "plugins": [{ "name": "efficient-core", "version": "...", "path": "..." }] },
  "cases": [{
    "name": "implement-plan-routing",
    "model": "...", "runsPerCase": 1, "timeoutSeconds": 300, "maxTurns": 8,
    "graders": [
      { "name": "fires-implement-plan", "type": "tool_used", "weight": 1,
        "config": { "tool": "Skill", "input_match": "\"skill\"\\s*:\\s*\"efficient-core:implement-plan\"" } },
      { "name": "not-coding", "type": "tool_used", "weight": 1,
        "config": { "tool": "Skill", "input_match": "...", "min": 0, "max": 0, "arm": "both" } }
    ],
    "arms": {
      "with": [{
        "score": 1, "passed": true, "turns": 8, "costUsd": 0.066, "judgeCostUsd": 0,
        "durationSeconds": 9, "error": null, "skippedPaidGraders": false,
        "graders": [
          { "name": "fires-implement-plan", "passed": true, "weight": 1,
            "explanation": "Skill called 1x (expected 1..∞)", "withOnly": true, "scored": false }
        ]
      }],
      "without": [{ "...": "same shape" }]
    },
    "aggregates": { "score": 1, "passRate": 1, "scoreWithout": 1, "passRateWithout": 1, "delta": 0 }
  }],
  "aggregates": { "casesTotal": 2, "casesPassed": 2, "overallScore": 1, "overallPassRate": 1, "meanDelta": 0 }
}
```

Reading it: `delta: 0` with `scored: false` on the skill grader is the textbook non-finding. The skill fired (the indicator passed), but the only scored graders were the `not-*` ones, which pass without the plugin too, so the case says nothing about whether the plugin helped. That is fine for a routing case as long as you read `WITH` for the indicator and not `Δ`.

## 4. `/skill-doctor` report excerpt

`/skill-doctor` is a usage and context-cost report, not an eval. It tells you what each skill's listing line costs per turn and whether it ever fires in real sessions, which is the signal that a skill's description is too quiet in practice even if its trigger evals pass. Docs: https://code.claude.com/docs/en/skills#find-unused-skills and https://code.claude.com/docs/en/plugins/measure#find-skills-that-never-run (v2.1.252 or later; opens in the `/plugin` Stats tab interactively, prints as text under `-p`). Captured 2026-10-17 with `claude -p "/skill-doctor"`:

```text
Skills loaded this session

  skill                              source          context  7d tokens   uses  last used
  design:accessibility-review        design             ~100          -     0×  never
  design:design-critique             design             ~100          -     0×  never
  anthropic-skills:docs              claude.ai sync     ~340          -     0×  never
  anthropic-skills:pdf               claude.ai sync     ~150          -     0×  never
  anthropic-skills:skill-creator     claude.ai sync     ~120          -     1×  today

  context = this skill's one-line listing in the system prompt, included every turn
  (dash = not in the current listing, costs nothing; full SKILL.md loads only when it runs)
  7d tokens = tokens attributed to the skill over the last 7 days of sessions on this machine

14 skills synced from claude.ai loaded but never invoked. Each one adds to the system prompt every turn. Disable in /skills, or turn them off on claude.ai — a deleted synced copy is re-downloaded on the next sync.
7 plugin skills loaded but never invoked, from design. Each one adds to the system prompt every turn. Plugin skills can't be turned off individually — disable the plugin in /plugin.
```

Use it after shipping: a skill with passing trigger evals and `0× never` over weeks either has no real demand or a description that loses to neighbours in a crowded listing, which the eval's isolated run (only your plugin loaded) cannot show.
