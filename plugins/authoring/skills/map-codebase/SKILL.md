---
name: map-codebase
description: Produce an evidence-based map of an existing codebase (stack, structure, architecture, conventions, integrations, testing, concerns) in which every claim traces to a file or command output and unknowns are marked. Use when asked to "map this codebase", "document the architecture", "onboard me to this repo", or to write codebase docs. Not for a CLAUDE.md or AGENTS.md (authoring:manage-agent-instructions), a docs drift check (authoring:docs-audit), or reading every file to prime context (claude-mem:learn-codebase, if installed).
allowed-tools:
  - Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/detect_stack.py *)
---

# Map Codebase

Write a map a newcomer can rely on. Reliability comes from evidence: each statement points to a file, config entry, or command output, and what you could not verify says so. A README often describes the intended design, so check it against the tree.

## Workflow

1. **Reconnoiter.** Run `python3 ${CLAUDE_SKILL_DIR}/scripts/detect_stack.py <repo>` to list manifests, CI configs, and container files. In a repo with a `.codegraph/` directory, use `codegraph_explore` for symbols and call paths. Take the top two directory levels, the entry points named in manifests, and the test layout. Use Glob and Grep, and read a file only when a signal is ambiguous.
2. **Read stated intent.** Read the README, PRD, spec, or roadmap if present, and summarize what the project claims to be before looking at code. Later, note every place the code disagrees.
3. **Investigate each area.** Use `references/map-outline.md` for the questions per section. For a monorepo, map each workspace separately, because the root manifest may have no source.
4. **Write the map.** Fill the outline in one document, `docs/codebase-map.md` unless the repo has an established home for such docs. Give each section an evidence list of concrete paths. Mark facts you could not establish as `UNCONFIRMED: <fact>; verify with <source>`, and mark questions only the team can answer as `ASK:`.
5. **Verify.** For every non-trivial claim, confirm that its cited path exists and says what you claim. Fix or remove the claims that fail, then recheck. Run documented commands only when they are safe and local.
6. **Report.** Summarize the map, list each `ASK:` item as a numbered question, and list the divergences between stated intent and the code.

## Traps

- Document source, not generated or compiled output (`dist/`, `build/`, `.next/`, `generated/`, `__pycache__/`).
- Production dependencies and dev tooling are different lists. `dependencies` run in production, and linters and test frameworks do not.
- A TypeScript `paths` alias or similar import mapping hides the real file location, so resolve aliases before describing structure.
- `.env.example` and similar templates reveal required configuration. Read names only, and never copy a value into the map.
- TODOs in test directories are coverage gaps, not production debt. Keep them apart in the concerns section.
- Files that change most in recent history are the fragile ones. Check with `git log --since=90.days --name-only` and note them.
- Do not guess a database or framework from a variable name. Check the manifest.

## Done when

- Every section has evidence paths, and no claim lacks one.
- Unknowns are marked, and the report lists each team-intent question.
- The map holds no secrets, and it is neither a CLAUDE.md nor a README copy.
