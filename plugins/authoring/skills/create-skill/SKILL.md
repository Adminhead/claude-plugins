---
name: create-skill
description: Design, write, restructure, or review a Claude Code skill (SKILL.md plus references/ and scripts/) so it triggers on the right requests and stays lean through progressive disclosure. Use when creating a new skill, porting or tightening an existing one, fixing a skill that under- or over-triggers, or validating skill frontmatter and links. For measured trigger-rate or A/B task evals and automated description tuning, use skill-creator:skill-creator.
allowed-tools:
  - Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/scaffold_skill.py *)
  - Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py *)
---

# Create Skill

Build a small, evidence-based instruction package that helps Claude finish a coherent class of tasks. Routing (does the skill load?) and execution (does it help once loaded?) are separate problems, so fix each with its own lever.

## Workflow

1. **Ground the scope.** Collect representative requests, inputs, outputs, failures, and project conventions. Scan the skills already listed in your context, plus the personal, project, and plugin skill directories listed in `references/specification.md`, for adjacent names and descriptions. Define the trigger boundary, required tools, risks, and completion evidence.
   - Merge into an existing skill when triggers overlap heavily or the workflows are normally used together. Split only when workflows are independently useful and differ in triggers, safety boundaries, tools, or validation.
   - Choose the location. Put it in `~/.claude/skills/<name>/` when it helps across projects, or in the repo's `.claude/skills/<name>/` when it depends on that repo's code, tools, or conventions.
   - For a skill that ships in a plugin, use `plugins/<plugin>/skills/<name>/SKILL.md` (invoked as `<plugin>:<name>`). Inside it, use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths and `${CLAUDE_SKILL_DIR}` for the skill's own directory.

2. **Choose the smallest structure.** Read `references/specification.md` before creating a directory or editing frontmatter. Keep the activation workflow in `SKILL.md`. Add `references/`, `scripts/`, or `assets/` only when the task evidence justifies them.
   - To start a new skill, run `python3 ${CLAUDE_SKILL_DIR}/scripts/scaffold_skill.py <dir> --description "…"`. It writes only `SKILL.md` and refuses a non-empty target. Don't use it to revise an existing skill.

3. **Write for execution.** Give an ordered, imperative procedure with decision points, safe defaults, verification, and failure handling. Include an example or template only where it prevents a likely mistake. Read `references/authoring.md` before drafting the body. It covers what to leave out (anything global CLAUDE.md already says), how to name Claude Code tools, and how to point at bundled files.

4. **Engineer discovery.** Read `references/descriptions.md` before writing or revising `description`. State what the skill does and when to use it, with concrete trigger phrases, and add a short "not for …" clause where an adjacent skill could collide. Put the key use case first, since the listing truncates long entries.

5. **Add helpers only when justified.** Read `references/scripts.md` before adding a script. Script only repeated deterministic work, keep it noninteractive and safe by default, and give it `--help`.

6. **Validate after every material edit.**

   ```sh
   python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py <skill-dir>
   ```

   It checks name shape and directory match, known Claude Code frontmatter fields (Claude Code silently ignores misspelled ones), enum values, the listing-length cap, and local Markdown links. Add `--json` for machine output. It is conservative, not a full YAML parser; see `references/specification.md` for its limits. Also confirm the skill appears in the available-skills list, since Claude Code picks up edits in watched skill directories without a restart.

7. **Evaluate before claiming effectiveness.** Read `references/evaluation.md` before making any discoverability or quality claim. For measured trigger rates, description optimization loops, or with/without-skill benchmarks, hand off to `skill-creator:skill-creator` (if installed), which has the tooling.

8. **Iterate on the right lever.** Change the description for routing failures. Change instructions, references, or scripts for execution failures. Keep the smallest revision the evidence supports.

## Completion checklist

- [ ] `name` matches the directory; frontmatter parses; the validator passes.
- [ ] The description says what and when, puts the main use case first, and names the nearest non-target.
- [ ] The skill is one coherent workflow, not a broad domain or a single tool action.
- [ ] `SKILL.md` stays under about 150 lines, and every reference says when to read it.
- [ ] Nothing restates rules already in `~/.claude/CLAUDE.md`.
- [ ] Every referenced file exists; scripts run with `--help`.
- [ ] Any effectiveness claim names the evidence, and routing and task-quality results are reported separately.
