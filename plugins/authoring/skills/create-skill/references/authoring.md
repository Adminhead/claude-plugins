# Authoring the body

Read this before turning a task area into instructions, examples, references, or templates.

## Start from evidence

Collect representative tasks and artifacts: inputs, desired outputs, successful examples, error traces, user corrections, and project constraints. Check adjacent skills before defining the job; a new skill isn't automatically the right answer.

## Set the boundary

Treat the skill like a well-scoped function:

- **Split** when workflows are independently useful and differ in triggers, safety boundaries, tools, or validation.
- **Merge** when triggers overlap heavily, the steps are normally used together, or separate skills keep getting loaded together for one task.
- Put variants and rare branches in conditional references, not in extra top-level skills.
- Keep atomic operations as tools or scripts. A skill explains when, why, and how to combine them.
- Keep universal policy in `~/.claude/CLAUDE.md` or a project CLAUDE.md. A skill shouldn't become a second system prompt.

Aim for one to three plausible candidate skills per ordinary request. Many near-identical descriptions force Claude to discriminate between them and hurt routing.

## Leave out what Claude already has

Claude always sees the user's global `~/.claude/CLAUDE.md`, so read it and cut anything that repeats it. That typically includes verification reporting, never weakening tests, root cause before fixing, the stop-after-three-attempts rule, KISS/YAGNI, secrets handling, primary sources with `UNCONFIRMED` labels, and fail-fast error handling. Also cut generic domain knowledge a capable model already knows. Keep what an otherwise capable agent would get wrong:

- local conventions, prerequisites, and required evidence;
- decision rules and safe defaults;
- known failure modes and how to recover;
- exact commands, templates, or checklists that prevent recurring errors.

## Name real tools

Refer to Claude Code tools by name where the skill talks about tooling: Read, Edit, Write, Bash, Agent (subagent types such as Explore and Plan, or `isolation: "worktree"`), AskUserQuestion, WebSearch, WebFetch, TaskCreate and TaskUpdate, the Context7 MCP tools for library docs, and `codegraph_explore` when the repo has a `.codegraph/` directory. Refer to other skills by their exact listed name.

## Write for execution

- Use imperative steps in execution order, with the normal path visible.
- Say exactly when to read each reference ("Read `references/x.md` when …"). A reference with no trigger never gets read.
- Make strict rules explicit where error is costly, and allow judgment where tasks genuinely vary.
- Add a short realistic example only when it resolves an ambiguous decision.
- Never bury a critical constraint in an optional reference.

## Improve with failures

Review transcripts and final artifacts, not just exit status. Turn a repeated failure into a focused instruction, guardrail, example, or deterministic check, and keep a regression case for it. Remove instructions that agents don't need or that contradict observed good practice.
