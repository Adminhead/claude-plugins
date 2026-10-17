# Content and structure

Read this after discovery, when deciding what an instruction file should say or whether a proposed statement is supported.

## Evidence ledger

Record enough for each candidate instruction to make the edit reviewable:

| Candidate statement | Evidence source | Applies under | Status | Action |
| --- | --- | --- | --- | --- |
| Exact command and working directory | Script, CI job, task runner, or maintained docs | Path or repo root | Verified / `UNCONFIRMED` | Add, correct, omit, or escalate |
| Local convention or invariant | Representative code, test, config, or maintainer statement | Subtree or file glob | Verified / `UNCONFIRMED` | State with scope, or leave out |
| Relationship between instruction files | Loading rules or explicit file text | Named tools and paths | Verified / `UNCONFIRMED` | Import, cross-reference, preserve, or ask |

A source isn't proof just because it exists. A manifest entry establishes a command's name, not its behavior in every directory, and a stale README doesn't establish the current workflow. Keep the source and its limits with the claim.

## What earns a line

Include what an agent is unlikely to learn safely from the immediate task:

- the map of files or subsystems needed to start work;
- non-obvious invariants, safety boundaries, ownership boundaries, and generated-file rules;
- a verified command with its directory, prerequisites, and what result to check;
- decision points, such as when a change needs a migration, a particular test layer, or a maintainer's sign-off;
- pointers to a nested file, path rule, skill, or canonical doc whose scope is known.

Leave out generic language advice, technology inventories, README copies, tool catalogs, directory listings, and anything Claude can derive from nearby config. The root file is navigation and shared constraints, not a manual.

## Baseline shape

Use only the sections the evidence supports, and let existing human headings win.

```markdown
@AGENTS.md            <!-- only when the repo shares AGENTS.md with other tools -->

# <Project> guidance

## Map
- What this file covers; where source, tests, and docs live.

## Workflows
- Exact command, working directory, prerequisite, and what to inspect.

## Non-obvious rules
- Cross-cutting invariants, safety boundaries, and decisions.

## More specific guidance
- Nested files, `.claude/rules/` topics, or skills, each with the subtree or task it covers.
```

A nested file or path rule can skip the map and carry only what differs locally. It may open with a warning, a verification sequence, or an exception to a shared rule.

## Path-scoped rule template

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API handlers

- <rule that applies only to these files>
```

Quote globs that start with `*` or `{`, since YAML treats those characters specially.

## Phrase claims so they can be checked

- Name the affected path: "Under `packages/web`, …" rather than "always …".
- Name the source of truth: "Use the command defined in `justfile` …".
- Give the condition and failure boundary: "If this check fails, stop before …".
- Keep exact command syntax, including required arguments, environment, and working directory.

If a fact is missing, write `UNCONFIRMED: <fact>; verify with <source or owner>` or leave the statement out.

## Pointers and skills

A pointer is useful only when the agent can tell when to follow it and the target exists at that relative path. Before adding one, confirm the target exists, its scope is clear, and it adds real local procedure rather than restating the parent. When pointing to skills, name the smallest relevant set, usually one to three, and don't make overlapping skills look mandatory.

## Review questions

Before keeping a paragraph, ask:

- What mistake does this prevent?
- What evidence supports it, and for which files?
- Is this the narrowest scope that is still true?
- Does another file already own this detail?
- Can an agent check the path and command without guessing?
