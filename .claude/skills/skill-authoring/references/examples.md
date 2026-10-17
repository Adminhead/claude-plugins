# Example skills

Written on 2026-10-17 against:

- https://code.claude.com/docs/en/skills (content types, `allowed-tools` with `${CLAUDE_SKILL_DIR}`, dynamic context, `context: fork` examples)
- https://agentskills.io/specification (directory layout, frontmatter)
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices (description style, workflow and validation-loop patterns)

Each example is complete. Copy the shape, not the content.

## Contents

- Example 1: reference skill (conventions Claude applies inline)
- Example 2: workflow skill with a bundled script
- Example 3: forked research skill with dynamic context

## Example 1: reference skill

Knowledge Claude should apply while editing, with no action for a user to invoke. `user-invocable: false` keeps it out of the `/` menu; `paths` loads it only when matching files are in play. Portable fields only, apart from the two Claude Code controls.

`.claude/skills/api-conventions/SKILL.md`:

```markdown
---
name: api-conventions
description: Conventions for HTTP handlers in this service - route naming, error envelope, validation and pagination. Use when adding or changing anything under src/api/, writing an endpoint, returning an error from a handler, or reviewing API code. Not for the GraphQL layer (see graphql-conventions).
user-invocable: false
paths: src/api/**
---

# API conventions

Apply these when writing or reviewing a handler under `src/api/`.

## Routes

- Plural nouns, kebab-case, no verbs: `GET /order-items/{id}`, not `/getOrderItem`.
- Version prefix comes from the router; never hardcode `/v2` in a handler.

## Errors

Return the shared envelope from `src/api/errors.ts`:

```json
{ "error": { "code": "order_not_found", "message": "...", "details": {} } }
```

`code` is snake_case and stable; clients switch on it. Never return a bare string or a stack trace.

## Validation

Validate the body with the zod schema next to the handler (`<name>.schema.ts`) before any database call. A failed parse returns 400 with code `invalid_request` and the zod issues in `details`.

## Pagination

List endpoints take `cursor` and `limit` (default 50, max 200) and return `next_cursor`. No offset pagination: the orders table is too large.

## Gotchas

- `req.user` is undefined on internal routes; guard with `requireUser()` or the handler crashes in production only.
- The `users` table uses soft deletes. Every query needs `WHERE deleted_at IS NULL`.
```

Why it works: the description says where it applies and names the near-miss; the body is only what Claude would get wrong here; gotchas sit in the body where they are read before the mistake.

## Example 2: workflow skill with a bundled script

A user-triggered task with side effects. `disable-model-invocation: true` keeps Claude from deciding to release on its own; `allowed-tools` pre-approves exactly the script the body runs, through the same `${CLAUDE_SKILL_DIR}` path, so it runs without a prompt; the checklist and the validation loop keep steps from being skipped.

```text
release-notes/
├── SKILL.md
├── scripts/
│   └── collect_changes.sh
└── references/
    └── style.md
```

`SKILL.md`:

```markdown
---
name: release-notes
description: Drafts release notes for a tagged version from the merged pull requests since the previous tag, grouped by type, in this repo's house style. Use when the user asks for release notes, a changelog entry, or "what's in this release", or runs /release-notes with a tag. Not for writing the git tag or publishing the GitHub release.
disable-model-invocation: true
argument-hint: "<tag> [previous-tag]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/collect_changes.sh *)
---

# Release notes

Draft notes for `$0`, comparing against `$1` when given, otherwise against the previous tag. Copy this checklist into your response and tick items as you go:

- [ ] 1. Collect merged PRs
- [ ] 2. Group and draft
- [ ] 3. Check against the style guide
- [ ] 4. Write `CHANGELOG.md` entry

## 1. Collect merged PRs

Run `${CLAUDE_SKILL_DIR}/scripts/collect_changes.sh $0 $1`. It prints one JSON object per line: `{"number", "title", "labels", "author", "breaking"}`. Do not re-derive this list with `git log`; the script already excludes reverted and bot PRs.

If it exits with `error: tag not found`, stop and ask for the correct tag.

## 2. Group and draft

Sections in this order, omitting empty ones: Breaking changes, Features, Fixes, Internal. One line per PR: `- <title> (#<number>)`. Rewrite titles into user-facing sentences; the PR title is written for reviewers.

## 3. Check against the style guide

Read `references/style.md` and check every line against it. Fix and re-check until nothing fails. Only then continue.

## 4. Write the entry

Insert the entry at the top of `CHANGELOG.md` under `## $0` with today's date. Do not tag or push; report what you wrote.
```

`scripts/collect_changes.sh` (the shape that matters: no prompts, `--help`, explicit errors, JSON on stdout, diagnostics on stderr):

```bash
#!/usr/bin/env bash
# Print merged PRs between two tags as JSON lines.
# Usage: collect_changes.sh <tag> [previous-tag]
set -euo pipefail

if [[ "${1:-}" == "--help" || -z "${1:-}" ]]; then
  echo "Usage: collect_changes.sh <tag> [previous-tag]" >&2
  echo "Prints {number,title,labels,author,breaking} per merged PR." >&2
  exit 2
fi

tag="$1"
prev="${2:-$(git describe --tags --abbrev=0 "${tag}^" 2>/dev/null || true)}"
git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || { echo "error: tag not found: ${tag}" >&2; exit 1; }
[[ -n "$prev" ]] || { echo "error: no previous tag before ${tag}; pass one explicitly" >&2; exit 1; }

echo "comparing ${prev}..${tag}" >&2
# 200 covers the largest release to date (140 PRs); raise if a release exceeds it.
gh pr list --state merged --search "merged:>$(git log -1 --format=%cI "$prev")" --limit 200 \
  --json number,title,labels,author \
  | jq -c '.[] | select(.author.is_bot | not)
      | {number, title, labels: [.labels[].name], author: .author.login,
         breaking: (.labels | map(.name) | index("breaking") != null)}'
```

`references/style.md` holds the house style (tense, forbidden words, how to phrase a breaking change). It is read in step 3 only, which is the point of keeping it out of the body.

## Example 3: forked research skill with dynamic context

A self-contained task that should not pollute the main conversation. `context: fork` with `agent: Explore` runs it in a read-only subagent that starts with no conversation history and no CLAUDE.md, so the body carries everything it needs. The `!` commands run before the body is sent, so the subagent starts with the live diff already inlined; `|| true` keeps an empty result from aborting the invocation. `background: false` makes the invoking turn wait for the summary.

```markdown
---
name: pr-risk-review
description: Reviews the current branch's diff against the base branch for risky changes - schema migrations, auth and permission code, deleted tests, new dependencies - and reports findings with file references. Use before opening a pull request, when the user asks "is this safe to merge", or wants a risk read on a branch. Not a full code review (use /code-review) and does not edit files.
context: fork
agent: Explore
background: false
allowed-tools: Bash(git diff *) Bash(git log *)
---

# PR risk review

You are reviewing a branch for merge risk. You have no conversation history; everything you need is below.

## Diff against the base branch

!`git diff origin/main...HEAD --stat || true`

!`git diff origin/main...HEAD -- '*.sql' 'migrations/*' 'src/auth/*' 'package.json' 'pyproject.toml' || true`

## Task

1. From the stat above, list the files touched in these risk classes: migrations and `.sql`; anything under `src/auth/`; dependency manifests; any file under `tests/` that lost lines.
2. For each, read the full diff hunk (`git diff origin/main...HEAD -- <file>`) and decide whether the change is reversible, whether it changes a permission check, and whether a test covering it was removed or weakened.
3. Grep for callers of any renamed or removed symbol so the report says what else breaks.

## Report

Return exactly this structure, nothing else:

- **Verdict**: `low`, `medium` or `high` risk, one sentence why.
- **Findings**: one bullet per risk, `path:line - what changed - why it matters`.
- **Missing tests**: files whose behaviour changed with no test change.
- **Not checked**: anything the diff size kept you from reading.
```

Why it works: the body is a task, not a guideline, so the fork has something to do; the description names the adjacent skill it is not; the report template is strict because the main conversation will act on it mechanically.
