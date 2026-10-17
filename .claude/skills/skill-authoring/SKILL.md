---
name: skill-authoring
description: Writes, reviews and improves Claude Code skills (a SKILL.md with optional references/ and scripts/). Covers the Agent Skills frontmatter rules and Claude Code's extensions, progressive disclosure, writing a description that triggers reliably, validating with `claude plugin validate`, and testing triggering in a fresh session. Use when creating a skill, turning a repeated procedure or a CLAUDE.md section into one, reviewing or tightening an existing SKILL.md, fixing a skill that never triggers or triggers too often, or choosing frontmatter such as context: fork, allowed-tools or disable-model-invocation. Not for mods or hooks modules (mod-authoring), classic hooks (hook-authoring), subagents (agent-authoring) or eval suites (skill-evals) and not for releasing a plugin (ship-plugin).
argument-hint: "[skill name or path]"
allowed-tools: Bash(claude plugin validate *) Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py *)
---

# Skill authoring

A skill is a directory with a `SKILL.md` (YAML frontmatter + Markdown body) and optional `scripts/`, `references/` and `assets/`. Only `name` and `description` load at startup; the body loads when the skill is invoked; other files load only when Claude reads them. Write for that order: the description decides whether the skill is used, the body says what to do, references hold detail.

The full field table is in [references/frontmatter.md](references/frontmatter.md), the authoring guidance with sources in [references/best-practices.md](references/best-practices.md), and three complete skills to copy from in [references/examples.md](references/examples.md).

## Workflow

### 1. Understand the task

Pin down four things before writing, from the conversation if the user is turning work just done into a skill:

- What should Claude do, and what does the output look like?
- When should it trigger: which user phrasings, file types, or tasks?
- What would Claude get wrong without the skill? Only that content earns a place in the body. If Claude already does the task well, the skill adds cost and no value.
- Which kind of skill is it? Reference content (conventions Claude applies inline), a task Claude runs step by step, or a self-contained task for a forked subagent.

Ground it in real material: the steps that worked, corrections the user made, runbooks, schemas, review comments. A skill written from general knowledge comes out as vague advice ("handle errors appropriately").

### 2. Check what already exists

- List skills already visible: project `.claude/skills/`, personal `~/.claude/skills/`, plugin `skills/` dirs, and bundled skills (`/skills` in a session). Extend an existing one rather than adding an overlapping skill.
- Names clash by location: enterprise beats personal beats project; a project skill replaces a bundled command of the same name but not its aliases; plugin skills are namespaced `/plugin:skill` so they never clash.
- Never name a folder `synced` or `anthropic-skills`; Claude Code reserves both.

### 3. Pick the location and name

| Audience | Path |
| :- | :- |
| This repo | `.claude/skills/<name>/SKILL.md`, committed |
| One subtree of a monorepo | `<subdir>/.claude/skills/<name>/SKILL.md` |
| Every project on this machine | `~/.claude/skills/<name>/SKILL.md` |
| Plugin users | `plugins/<plugin>/skills/<name>/SKILL.md`, invoked as `/<plugin>:<name>` |

Name: 1-64 chars, lowercase `a-z0-9` and single hyphens, no leading, trailing or doubled hyphen, matching the directory name. Prefer a specific verb-noun or gerund (`ship-plugin`, `processing-pdfs`) over `helper`, `utils` or `tools`. For a skill that may be uploaded to claude.ai, the name must also avoid the words `anthropic` and `claude`.

### 4. Draft the frontmatter

Start with `name` and `description`, then add only the fields the behaviour needs. The opening `---` must be the first line of the file. Claude Code silently ignores a misspelled field, so copy names from the table.

The description is the trigger surface. Write it in third person, state what the skill does, then when to use it ("Use when ..."), and name the near-misses it is not for. Include the words a user would actually type. Lean toward pushy: Claude under-triggers, and simple one-step requests rarely trigger a skill at all. Put the key use case first because the listing truncates each entry at 1,536 characters; the spec's hard limit is 1,024.

Pick invocation control deliberately:

- `disable-model-invocation: true` for side effects or timing the user owns (deploy, commit, send). It also removes the description from Claude's context, so Claude cannot find the skill on its own.
- `user-invocable: false` for background knowledge that is not an action (`/legacy-context` is not a command anyone types).
- `context: fork` only for a body that is a complete task on its own. The subagent sees none of the conversation and, with `agent: Explore` or `Plan`, none of CLAUDE.md. Forks run in the background by default; set `background: false` to wait for the result.
- `allowed-tools` to pre-approve the exact commands the body runs. The grant lasts one turn, and workspace trust does not gate it, so keep it narrow. Pair a `Bash(<path>/scripts/x.sh *)` rule with the same path in the body (the `CLAUDE_SKILL_DIR` substitution works in both) so a bundled script runs without a prompt.
- `argument-hint` whenever the body uses arguments. Use `\$ARGUMENTS` for the whole string, `\$0`, `\$1` for positions, or declare `arguments: [issue, branch]` and use `\$issue`.

### 5. Write the body

- Open with one or two lines that say what the skill is and when it applies. Then the procedure. Put the most important rules first: after compaction only the first 5,000 tokens of an invoked skill survive, and nothing is re-read.
- Imperative voice. State what to do, not why the domain works the way it does; explain a reason only where it changes a judgment call.
- Numbered steps for a procedure, a checklist Claude can copy when steps have gates, and a validate-fix-repeat loop wherever a check exists (a script, a reference file, a command). End each step with a checkable completion criterion ("every modified handler has a test", not "understand the change"); a vague bound invites moving on early.
- State the target behaviour before any prohibition ("write one-line comments" rather than "don't write long comments"), and keep a never-rule only for a costly or irreversible mistake, paired with what to do instead.
- Leave out what is already in context or in the environment: rules the project's or user's CLAUDE.md states, `--help` output, `package.json` scripts, directory layout. Cache only what Claude cannot find by looking: unwritten conventions, the reason behind a choice, the trap no config reveals.
- Calibrate control to fragility. One exact command where a wrong flag breaks things; a goal and heuristics where many approaches are fine. Give one default and a brief escape hatch, never a menu of equal options.
- Add a `## Gotchas` section for facts that defy reasonable assumptions in this environment. This is often the highest-value content, and the place to add each correction the user makes later.
- Standing instructions apply across turns ("run the tests after every edit", not "run the tests"). Rules that must hold every time belong in a hook, not prose.
- Keep the body under 500 lines and well under 5,000 tokens. Move anything long, conditional or domain-specific to `references/` and say when to read each file ("read references/api-errors.md when a call returns non-200"), not "see references/ for details". Split on a real load condition (a variant only some requests take, lookup data consulted by key), not to hit a line count; a reference Claude reads on nearly every run belongs back in the body, and anything that must happen every time stays in the body because a reference can be skipped.
- Use forward slashes, consistent terminology, and no dates or version-dependent advice; park legacy behaviour in a collapsed "old patterns" block.
- Dynamic context: an exclamation mark immediately followed by a backticked command (exact syntax in frontmatter.md) runs before Claude sees the body and is replaced by its output. A failing command aborts the whole invocation, so append `|| true` to anything that may exit non-zero. Use `CLAUDE_SKILL_DIR` or `CLAUDE_PROJECT_DIR` in paths because the command runs in the session's current directory.

### 6. Add references and scripts

- `references/`: one file per topic or domain, named for its content (`finance.md`, not `doc2.md`), linked directly from SKILL.md. Keep links one level deep: a reference that points at another reference gets skimmed with `head`. Give a file over 100 lines a table of contents.
- `scripts/`: for deterministic or repeated work, especially logic Claude re-invents on every run. No interactive prompts, a `--help`, explicit errors that say what was expected, structured output on stdout and diagnostics on stderr, no unexplained constants. Say whether Claude should run a script or read it.
- `assets/`: templates and files that end up in the output.
- Declare prerequisites (`compatibility`, or a line in the body) rather than assuming a tool is installed. Pin versions in one-off commands (`npx eslint@9`, `uvx ruff@0.8.0`).

### 7. Validate

Run both checks after every material edit:

1. `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py <skill-dir>` (add `--json` for machine output). It checks the name shape and directory match, that every frontmatter field is one Claude Code recognizes (Claude Code ignores a misspelled field silently), boolean and enum values, the 1,024-character description limit and 1,536-character listing cap, and that every local Markdown link resolves inside the skill. It reads only the skill and needs only the Python standard library.
2. `claude plugin validate --strict <dir>` where `<dir>` contains a `skills/` directory or is itself the `.claude/skills` or `plugins/<plugin>` directory, for example `claude plugin validate --strict .claude/skills`. Pointed at a single skill directory it looks for a plugin manifest instead. It catches frontmatter YAML that does not parse, which the script also reports; it does not check names, fields or links, so run it as the engine's own view, not as the only check.

A skill with broken YAML still loads, but with no description, so it can never trigger. Then check by hand:

- `wc -l SKILL.md` under 500.
- Every script or file named in prose (not only in Markdown links) exists at that path; `ls` them.
- A skill meant for claude.ai upload or the Skills API uses only the six spec fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`); any other key fails the upload.

### 8. Test triggering and output

Test in a fresh session: authoring context in the current one masks gaps in the written instructions.

- Triggering: write 8-10 realistic prompts that should trigger (varied phrasing, some that never name the domain) and 8-10 near-misses that should not (same keywords, different need). Run each with `claude -p "<prompt>" --output-format json` and check for a `Skill` tool call with the skill's name; model behaviour varies, so run each a few times. Fix the description, not the prompts, and generalize rather than pasting failed keywords in.
- Output: run two or three real tasks with the skill and the same tasks with it off (`skillOverrides: {"<name>": "off"}` in `.claude/settings.local.json`; for a plugin skill, `claude plugin eval` does the with/without comparison). Read the transcripts, not only the results: wasted steps point at vague or inapplicable instructions.
- `/skill-doctor` reports each skill's context cost and how often it triggers; `/context` shows the listing size.

### 9. Iterate

Feed every observation back into the skill: a correction becomes a gotcha, a repeated helper becomes a script, an unread reference gets a clearer pointer or is deleted, text that never changed behaviour is cut. Re-run the validation and the tests after each pass.

## Quality checklist

- [ ] `name` matches the directory, lowercase with single hyphens, specific
- [ ] Description in third person, says what and when, names near-misses, under 1,024 characters, key use case first
- [ ] Invocation control chosen on purpose (model, user, both; inline or fork)
- [ ] Body under 500 lines, most important rules first, imperative, one default per decision
- [ ] Only content Claude would otherwise get wrong; no explanations of common knowledge
- [ ] Procedure has clear steps and a validation loop where a check exists
- [ ] Gotchas section holds the environment-specific surprises
- [ ] References one level deep, each with a stated trigger for reading it
- [ ] Scripts non-interactive, documented, with explicit errors and justified constants
- [ ] Paths use forward slashes; placeholder variables used for bundled file paths
- [ ] `scripts/validate_skill.py` and `claude plugin validate --strict` both pass
- [ ] Triggering checked in a fresh session with should and should-not prompts; output compared against a no-skill baseline

## Anti-patterns

- A description that says what the skill is ("PDF helper") but not when to reach for it, or one written as "I can help you ...".
- `disable-model-invocation: true` on a skill the user expects Claude to pick up automatically; `context: fork` on reference content with no task in it.
- A body that teaches the domain, offers three libraries as equals, or caps every sentence with MUST and NEVER instead of a reason.
- Rules for this one example rather than a reusable method; time-sensitive instructions; backslash paths.
- Reference chains two levels deep; a 1,200-line SKILL.md; a `references/` folder with no pointers from the body.
- Scripts that prompt for input, print `Error: invalid input`, or carry magic numbers.
- An inline shell command without `|| true` that can exit non-zero, or one that uses a relative path and breaks when the session has moved directory.
- Testing only in the session that wrote the skill, or declaring success because the skill triggered once.

## References

- [references/frontmatter.md](references/frontmatter.md): every frontmatter field, string substitution, dynamic-context syntax, name and listing limits, with source URLs
- [references/best-practices.md](references/best-practices.md): condensed Anthropic and agentskills.io authoring guidance
- [references/examples.md](references/examples.md): a reference skill, a workflow skill with a script, and a `context: fork` skill
- `scripts/validate_skill.py`: the frontmatter and link validator from step 7; run it, don't read it
