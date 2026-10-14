# Enforcement and failure memory

Read this when a repo keeps repeating an agent mistake, when a rule is high-risk and prose alone will not hold it, or when reviewing an existing set of instructions for rules nobody checks.

Prose asks the agent to behave. A check makes the wrong behavior fail. Move a rule out of prose and into a check when the cost of breaking it is high and the violation can be detected.

## Choose where each rule lives

| Need | Home |
| --- | --- |
| Always-on behavior and shared constraints | Root `CLAUDE.md` |
| Guidance for one subtree or file type | Nested `CLAUDE.md` or a `paths:` rule in `.claude/rules/` |
| An action that must happen every time | A hook (see the `update-config` skill) |
| A rule that can be detected in the diff or tree | A script, test, linter, or type check, run in CI and locally |
| A multi-step procedure | A skill (`authoring:create-skill`) |
| A known failure and its prevention | A short failure note, kept where the repo already keeps docs |

If the repo already has an equivalent location, update it instead of starting a parallel system.

## Turn a rule into a check

A good check is:

- narrow enough to avoid false positives on valid changes;
- fast enough to run before every commit and in CI, for example through a pre-commit runner such as prek or a CI job;
- named so the agent can run it before finishing, with the command listed in `CLAUDE.md`;
- documented with the rule it protects and a message that says how to fix a failure.

Examples of the mapping:

| Rule | Check |
| --- | --- |
| Do not edit generated clients | A script that fails when a diff touches generated paths |
| Every failure note names its prevention | A script that checks each note for a Prevention section |
| Template files stay aligned with their README | A test that compares the two |

Use the repo's existing language for check scripts. Without one, a standard-library Python script is a portable default.

When no automated check is practical, record the manual review point and why automation would be brittle. An unenforced high-risk rule is a finding.

## Failure memory

Record a failure when it is user-visible, high-risk, or likely to recur. Add to an existing note when the root cause matches. Use this shape:

```markdown
# <Short failure title>

## Summary
What failed, who saw it, and why it matters.

## Root Cause
The technical or process cause, without blame.

## Prevention
The instruction, test, drift check, CI gate, or review point that prevents or detects recurrence.

## Evidence
Links to the issue, PR, test, log excerpt, or file paths.
```

Each note must name a prevention. A note whose prevention is "be more careful" is not finished.

## Drift checks

Guidance goes stale silently. Check the cheap, definite claims with a script:

- documented commands that no longer exist;
- paths and `@imports` that no longer resolve;
- failure notes without a prevention;
- CI jobs that reference removed scripts.

`authoring:docs-audit` includes a read-only drift script for documented commands, links, and environment variables.

## Review list

When reviewing instructions or a harness change, report findings first, ordered by severity, with paths and lines. Look for:

- generic rules with no evidence from this repo;
- duplicate or conflicting instruction files;
- checks broad enough to fail on valid changes;
- high-risk rules with no check or review point;
- repeated mistakes with no failure note;
- CI that does not run the checks the instructions name;
- repo conventions overwritten by defaults from a template.

Review read-only unless the owner asks for fixes.
