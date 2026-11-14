# Reviewer brief, plugin review 2026-11-14

You are one of several parallel read-only reviewers of the `adminhead` Claude Code plugin marketplace at `/home/buck/Projects/adminhead/claude-plugins`. Each reviewer owns one family of plugins. Your prompt names your family, your plugin list, your report file and the prior report to start from.

## What the owner wants

1. A list of concrete fixes and enhancements per plugin.
2. A verdict per plugin on whether it earns its place: does it make Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5 produce a better result than the model would without it? Plugins that do not should be deprecated.

## Rules

- Read-only on the repo. The only file you may write is your own report file. Do not edit plugins, do not commit, do not run `claude plugin eval` (it costs money), do not install anything.
- Read every plugin in your list in full: `plugins/<name>/` SKILL.md or agent file, `references/`, `scripts/`, `hooks/`, `plugin.json`, evals. Do not judge a plugin from its description alone.
- Shell note: heredocs (`<<EOF`) hang in this environment. Use `python3 -c`, or the Read/Grep tools. Add `</dev/null` to commands that might read stdin.
- Running a plugin's own tests is allowed when cheap (`bun test <spec paths>`, `claude plugin test plugins/<name>` for mods, pytest, shell suites). Report failures with output.
- Every finding needs `path:line` evidence. Mark anything you did not verify as UNVERIFIED. Version or date claims about external tools (for example "Vite 8 does X") go in a "needs source check" list unless a primary source in the repo or a quick official-docs lookup settles them.

## Inputs to read first

- `CLAUDE.md` (repo rules).
- Your prior family report in `docs/research/plugin-review-2026-10-23/` and the fix plan `docs/plans/plugin-review-fixes.md` (verification table V1 to V32, follow-ups F1 to F9). Most of that plan has landed. For each prior finding that touches your plugins, re-check it against current code and classify it FIXED, STILL OPEN or PARTLY. Do not copy old findings forward unchecked.
- `docs/research/plugin-review-2026-11-14/plugin-data.tsv`: per-plugin evidence. Its header explains the columns. Usage is 733 sessions over four weeks on the owner's machine. Read the rows for your plugins.
- `docs/research/evals-*.md` where they mention your plugins.

## How to read the evidence

- `sessions_listed` high with `calls` 0 means the model saw the skill many times and never chose it. That is a real signal: either the description does not trigger, or the model does not need the skill.
- `sessions_listed` 0 means the owner never installed it where it would show. That is absence of evidence, not evidence of no value. Judge those on content.
- Manual-only skills (`disable-model-invocation: true`) never list. `loads` 0 means the owner never typed the slash command in four weeks.
- `outcome_evals` shows `case:with/without`. Equal scores mean the bare model already gets it right. Trigger evals always show +1.00 and prove nothing about value.
- Every model-invocable skill costs listing tokens in every session where it is installed (`listing_tokens`), and at about 75 visible skills the default listing budget truncates later descriptions to name-only (`docs/research/evals-2026-11-01.md`). A skill that never helps still has a cost.

## Value rubric (apply to every plugin)

A plugin earns its place when it gives the model something it does not already have:

- **K-private**: knowledge the model cannot have. The owner's own tools and conventions (plan-ledger, consult, fj CLI quirks, homelab layout), facts newer than the model's training data, or verified corrections of things models commonly get wrong. Say which facts, with the line.
- **K-decision**: a decision procedure or checklist that changes what the model does on a realistic task, not a restatement of common practice. Test: write down what Sonnet 5.5 would do on the skill's core task without it. If the answer is "the same", it fails.
- **Tooling**: bundled scripts, hooks, MCP config or deterministic checks that do work the model could not do reliably in-context.
- **Enforcement**: a guard or gate (hook, mod, tool allowlist, read-only agent) that holds regardless of what the model decides.
- **Routing/role**: an agent definition or meta that the orchestration setup depends on.
- **Measured**: an outcome eval showing lift over baseline.

A plugin does not earn its place when it is mostly:

- **Generic**: textbook guidance for a mainstream technology that current models already follow (general REST design, JavaScript basics, React hooks rules). Weaker models do benefit from some reminders, so separate "Haiku would get this wrong" (name the specific mistake) from "no current model needs this".
- **Duplicate**: overlaps another plugin here, a built-in Claude Code feature (built-in skills and commands include `/code-review`, `/security-review`, `/simplify`, `/init`, `/run`, `/loop`, `/schedule`, the Explore and Plan agents, plan mode), an official plugin (`anthropics/claude-plugins-official`), or a third-party plugin the metas already depend on (`gradle-skills`, `android-skills`).
- **Stale**: built around a model weakness or a tool version that no longer holds.
- **Unused and untriggerable**: listed often, never chosen, no outcome lift, nothing private in it.

Verdicts, one per plugin:

- `KEEP`: earns its place as is (fixes may still apply).
- `KEEP-FIX`: earns its place only after the named fixes.
- `SLIM`: keep the private or decision-changing part, cut the generic bulk. Say what stays, roughly how many lines.
- `MERGE`: fold into a named plugin. Say what content moves.
- `DEPRECATE`: move to `archive/plugins/`. Give the reason code (Generic, Duplicate, Stale, Unused) and the strongest evidence. State what would be lost and for which model tier, so the owner can disagree.

Be honest in both directions. Do not recommend deprecation to look decisive, and do not defend a plugin because effort went into it. When unsure between two verdicts, pick one and state your confidence (high, medium, low). The owner's daily stack, by usage, is infrastructure (ansible, terraform, kubernetes, docker, forgejo, homelab), TypeScript and web, plus the orchestration agents. Godot, .NET, JVM and Android plugins are used rarely or not at all on this machine, which is not by itself a reason to deprecate them.

## What to look for in fixes

- Correctness: wrong commands, flags, API names, version facts; advice that would cause harm; contradictions between sibling plugins.
- Security: over-wide `allowed-tools` grants, guard bypasses, unpinned downloads, secrets exposure, prompt-injection surfaces.
- Triggering: descriptions that are too long, too vague, collide with a sibling, or carry no symptom strings. Descriptions over about 500 characters get truncated under listing pressure.
- Structure: SKILL.md too long to be read (progressive disclosure not used), dead reference links, references nobody points to, frontmatter that fails strict YAML, wrong tool allowlists on agents, missing dependencies for skills an agent preloads.
- Evals: missing outcome case for a plugin whose value is K-decision, graders that cannot fail, cases that the baseline also passes.
- Enhancements: only ones with a concrete trigger from evidence (a real gap, a usage pattern, a prior finding). No speculative features.

## Report format

Write your report to the file named in your prompt, in this shape:

```
# <family id and name>, 2026-11-14

## Summary
(5 to 10 lines: counts per verdict, the top findings)

## Prior findings re-checked
| Prior finding (source) | Status | Evidence |

## Per-plugin
### <plugin> — <VERDICT> (<confidence>)
- Value: <rubric codes and one or two lines of evidence, with path:line>
- Evidence: <usage and eval numbers from plugin-data.tsv>
- Fixes: <[high]/[med]/[low] finding, path:line, proposed change>
- If DEPRECATE/MERGE/SLIM: what is lost, for which model tier

## Cross-plugin findings
(collisions, duplication, meta membership problems)

## Needs source check
```

Then return a final message of at most 60 lines: the verdict table (plugin, verdict, confidence, one-line reason), every [high] finding, and the status counts for prior findings. The full detail lives in your report file.
