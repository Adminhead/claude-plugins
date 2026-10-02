# Skill format and validator limits

Read this before creating a skill directory, editing frontmatter, or treating a validator result as evidence. Source: Claude Code skills docs (https://code.claude.com/docs/en/skills), checked 2026-09-30.

## Locations

| Scope | Path | Loads in |
| --- | --- | --- |
| Personal | `~/.claude/skills/<name>/SKILL.md` | Every project on this machine |
| Project | `.claude/skills/<name>/SKILL.md` | That repo; commit it to share |
| Nested | `<subdir>/.claude/skills/<name>/SKILL.md` | Once Claude reads or edits files under `<subdir>` |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | As `/<plugin>:<name>` wherever the plugin is enabled. Use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths |

- On a name clash, personal beats project. Plugin skills are namespaced, so they never clash.
- Don't name a skill `synced` or anything starting with `anthropic-skills`; those names are reserved.
- Claude Code watches existing skill directories and applies edits mid-session. Run `/reload-skills` after creating a top-level skills directory that didn't exist at session start.

## Directory shape

```text
my-skill/
├── SKILL.md       # frontmatter + activation workflow
├── references/    # detail read only when a stated condition applies
├── scripts/       # repeated deterministic operations
└── assets/        # templates or other non-instruction files
```

Create a subdirectory only when it has content. Keep references one level below `SKILL.md`; deeper chains are easy to miss.

## Frontmatter

The opening `---` must be the first line, or Claude Code treats the whole file as content. If the YAML fails to parse, the skill still loads but with no metadata, so it can't auto-trigger. Claude Code ignores unknown fields without error, which makes typos invisible.

| Field | Use |
| --- | --- |
| `name` | Lowercase kebab-case, at most 64 characters. Keep it equal to the directory name (the portable Agent Skills rule; Claude Code also accepts the directory name alone). |
| `description` | What it does and when to use it. Keep it at or under 1,024 characters for portability, and aim for about 500. |
| `when_to_use` | Extra trigger phrases, appended to `description` in the listing. The two together are truncated at 1,536 characters. |
| `argument-hint`, `arguments` | Autocomplete hint and named `$arg` substitutions for `/name args`. |
| `disable-model-invocation` | `true` for manual-only workflows (`/name`); Claude won't auto-load it. |
| `user-invocable` | `false` for background knowledge hidden from the `/` menu. |
| `allowed-tools` | Tools pre-approved while the skill runs, for example `Bash(${CLAUDE_SKILL_DIR}/scripts/run.sh *)`. |
| `disallowed-tools` | Tools removed while the skill is active. |
| `model`, `effort` | Per-skill model or effort override. |
| `context: fork`, `agent`, `background` | Run the skill in a forked subagent. |
| `paths` | Globs; auto-load only when working on matching files. |
| `hooks`, `shell` | Skill-scoped hooks; shell for inline `!` commands. |
| `metadata`, `license`, `compatibility` | Carried for other tools; Claude Code doesn't act on them. |

## Pointing at bundled files

- In prose, name reference files by relative path (`references/x.md`) and say when to read them.
- For commands, use `${CLAUDE_SKILL_DIR}/scripts/x.py`, which Claude Code substitutes in skill content and in `allowed-tools` rules. It works for personal, project, and plugin skills alike. In a plugin, `${CLAUDE_PLUGIN_ROOT}` is the plugin root, so a sibling skill's script is `${CLAUDE_PLUGIN_ROOT}/skills/<sibling>/scripts/x.py`.

## Size budget

The listing shows only name plus description until the skill loads. Once loaded, `SKILL.md` stays in context for the rest of the session, so every line is a recurring cost. Claude Code's hard guidance is under 500 lines; aim for under about 150 and push detail into references.

## What the bundled validator checks

`scripts/validate_skill.py` checks:

- `SKILL.md` exists and starts with frontmatter;
- `name` shape and directory match, and a non-empty `description` of at most 1,024 characters;
- every field is one Claude Code recognizes;
- booleans for `disable-model-invocation`, `user-invocable`, and `background`;
- enum values for `context`, `effort`, and `shell`;
- `description` plus `when_to_use` against the 1,536-character listing cap;
- local Markdown links resolve inside the skill root.

It uses only the standard library. It supports top-level scalars, single-line quoted scalars, block scalars, and a simple string-to-string `metadata` map. It accepts `allowed-tools`, `disallowed-tools`, `paths`, `arguments`, and `hooks` in any form without inspecting their contents. It rejects flow collections, anchors, and tags in other fields rather than guessing. Link checking covers inline and reference-style links outside fenced code and code spans. It doesn't see plain backticked paths, so check script and reference paths named in prose by hand (`ls` them).
