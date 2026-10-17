# mattpocock/skills

Source: https://github.com/mattpocock/skills · License: MIT (Copyright 2026 Matt Pocock) · Last commit: 2026-10-09 (`wizard: template fixes (#1237)`) · Catalog: [catalog.md](catalog.md)

## Purpose

Matt Pocock's agent skills for "real engineering": alignment before coding, spec and ticket flows, test-first development, diagnosis, code review, and domain modelling. The README positions them against process-owning frameworks (GSD, BMAD, Spec-Kit): the skills are small, composable Markdown files meant to be edited, not a process that takes control away. Plugin version is 1.3.1.

## Layout

- `.claude-plugin/plugin.json` and `marketplace.json`: one plugin, `mattpocock-skills`, which lists 27 skills.
- `skills/engineering/` (20 skills): daily code work.
- `skills/productivity/` (7 skills): non-code grilling, teaching, handoff, and agent-doc writing.
- `skills/in-progress/` (7 skills): beta, excluded from the plugin manifest and top-level README; may change without notice.
- `skills/misc/` (4 skills): rarely used tools, not promoted in the plugin.
- `skills/deprecated/`: empty bucket.
- `.agents/`, `docs/`, `GLOSSARY.md`, `.changeset/`, `.github/workflows/release.yml`: maintainer conventions (ADRs, changesets, release CI).
- Each skill is a folder with `SKILL.md`, sometimes plus reference files (`tests.md`, `mocking.md`) and an `agents/openai.yaml`.

## Counts

- 1 marketplace, 1 plugin, 38 skills on disk (27 in the plugin manifest; 11 in-progress or misc are not).
- 0 agents, 0 commands, 0 hooks files at the top level.

## Themes

| Theme | Skills |
|---|---|
| Alignment and grilling | grill-me, grilling, grill-with-docs, to-questionnaire, wait-what |
| Planning and tickets | to-spec, to-tickets, triage, wayfinder, research, handoff, claude-handoff |
| Implementation | implement, implement-spec, prototype, pr |
| TDD and diagnosis | tdd, diagnosing-bugs, migrate-to-shoehorn |
| TypeScript and architecture | codebase-design, domain-modeling, improve-codebase-architecture, setup-ts-deep-modules |
| Review and retro | code-review, retro |
| Setup and tooling | setup-matt-pocock-skills, wizard, setup-pre-commit, git-guardrails-claude-code, scaffold-exercises |
| Agents and routing | ask-matt, writing-for-agents, loop-me, chief-of-staff |
| Writing and teaching | writing-beats, writing-fragments, writing-shape, teach |

## Install / use

From the README (Claude Code):

```bash
claude plugin install mattpocock-skills@claude-plugins-official
```

Other agents (editable files, manual updates):

```bash
npx skills@latest add mattpocock/skills -a <agent>  # cursor, opencode, devin, windsurf, amp, pi; omit -a to choose
npx skills@latest update
```

In-progress skills, installed one at a time:

```bash
npx skills@latest add mattpocock/skills --skill=<name>
```

Then, once per repo, run `/setup-matt-pocock-skills` (issue tracker, triage labels, docs location). Do not install the plugin and the editable copy together: the README warns every skill then appears twice.

## Highlights

- `skills/engineering/tdd/SKILL.md`: test only at pre-agreed seams; red before green; no horizontal slicing; refactoring belongs to review.
- `skills/engineering/tdd/tests.md`, `mocking.md`: reference examples and mocking rules for the TDD loop.
- `skills/engineering/diagnosing-bugs/SKILL.md`: build a tight pass/fail feedback loop first; ten loop constructions in priority order; redact secrets.
- `skills/engineering/grill-with-docs/SKILL.md`: a 7-line pointer that chains `grilling` and `domain-modeling`.
- `skills/engineering/domain-modeling/SKILL.md`: maintain `GLOSSARY.md` and ADRs as the project's shared language.
- `skills/engineering/codebase-design/SKILL.md`: vocabulary (module, interface, depth, seam, adapter, leverage, locality) and the deletion test.
- `skills/engineering/improve-codebase-architecture/SKILL.md`: scan for shallow modules, write an HTML report, then grill one candidate.
- `skills/engineering/code-review/SKILL.md`: two-axis review (Standards and Spec) run as parallel sub-agents, with a Fowler smell baseline.
- `skills/productivity/writing-for-agents/SKILL.md`: context pointers, context vs. cognitive load, progressive disclosure for skills and CLAUDE.md.
- `skills/misc/migrate-to-shoehorn/SKILL.md`: replace `as` casts in test files with `@total-typescript/shoehorn`.
- `skills/in-progress/setup-ts-deep-modules/SKILL.md`: beta; enforces deep-module boundaries with dependency-cruiser.

## Quality notes

- Strong, consistent opinions. TDD, diagnosis, and review all say what not to do (implementation-coupled or tautological tests, horizontal slicing, refactoring inside the red-green loop) with named anti-patterns. Good signal for teams that want a stance.
- Cross-skill wiring is by name ("call the Skill tool with `codebase-design`"). Skills assume the repo has `GLOSSARY.md`, `docs/adr/`, and a configured tracker from the setup skill; without them they degrade rather than fail loudly.
- Some skills are thin pointers (`grill-with-docs`, 7 lines). Others are long and dense (`diagnosing-bugs`, 138 lines; `writing-for-agents`, 81 lines) with reference files split out.
- `improve-codebase-architecture` loads Tailwind and Mermaid from CDNs and calls `xdg-open` on a temp HTML report. Review before use in restricted environments.
- Maintenance is active: changesets, release workflow, issue templates and triage bots, and a 1.3.1 plugin version.
- Install-name mismatch to note: README uses `@claude-plugins-official`, while the repo's own `marketplace.json` is named `mattpocock`.

## Relevance to adminhead

- Reference for TDD and bug-diagnosis guidance in `plugins/` work; the anti-pattern lists are concrete and reusable.
- `writing-for-agents` is directly applicable to authoring `CLAUDE.md` and skills in this marketplace.
- MIT license: vendoring or adapting is allowed with the copyright notice retained. Prefer install-by-reference over copies, since the README says it updates itself.
- Do not depend on `in-progress` skills (no stability guarantee) and assume the 27-skill plugin manifest, not the 38-skill tree, when documenting what installs.
