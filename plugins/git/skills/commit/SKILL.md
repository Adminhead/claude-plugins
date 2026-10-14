---
name: commit
description: "Write or create Git commits that follow the repository's message convention, including release-please and commitlint Conventional Commits. Use when asked to \"write a commit message\", \"write the commit message for the staged change\", \"commit the staged changes\", \"commit this\", split changes into several commits, or fix a commit message, including when only the message text is wanted. Reads the diff and recent history to pick the type, scope, and format. Not for pushing, opening PRs, or merging (`github:ship`) or for history rewriting (`git:history`)."
---

# Git Commit

Build commits from the actual diff, in the repository's own convention. A request to commit authorizes creating commits. It does not authorize pushing (for push, PR, or merge requests, use `github:ship`), amending, rebasing, resetting, stashing, force-pushing, skipping hooks, or changing Git config.

## Boundaries

- Never commit secrets, `.env` files, private keys, caches, editor artifacts, or unrelated local work. If a sensitive or ambiguous file seems meant for the commit, ask with AskUserQuestion.
- Treat already staged changes as likely user intent. Inspect them anyway, and report unstaged or untracked work you left out.
- For a dry run, message-only, or planning request, do not stage or commit.
- Keep any attribution trailer Claude Code configures. Add no other co-authors unless asked.

## Inspect

Run these together:

```bash
git status --short --branch
git diff --staged
git diff
git log --oneline -15
```

Read untracked files that may belong in the commit. Never infer a commit's purpose from filenames alone.

Determine the message convention in this order:

1. Local instructions (CLAUDE.md, CONTRIBUTING) and commit templates (`git config commit.template`).
2. Tooling and release config: `commitlint.config.*`, `.commitlintrc*`, `release-please-config.json`, `.release-please-manifest.json`, release-please in `.github/workflows/`, `semantic-release` config.
3. Package or workspace boundaries that define valid scopes.
4. Recent history, when one format clearly dominates.

When release-please is configured, its Conventional Commit contract beats stylistic patterns in history. When evidence is mixed or absent, say so and use Conventional Commits. Don't copy isolated historical exceptions.

## Plan

1. Prefer one logical commit. Split only when changes are independent and each part can be understood and tested alone. Keep tests, docs, and implementation of one change together.
2. Fix each commit's exact file list and message before staging. Stage explicit paths. Use `git add -A` or `git add .` only when the user asked for all changes and you reviewed the full list.
3. If the staged set doesn't match the plan, don't mix it silently with other work. Commit it as its own coherent unit or ask.

## Message format

Use this structure when release-please is configured or no other convention exists:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- Lowercase type, optional scope in parentheses, optional `!` right before the colon, one space after it. The header must parse on its own, so put no emoji, ticket number, or bullet in front of it.
- Choose the type from the user-visible effect:
  - `fix:` is a backward-compatible bug fix (patch release).
  - `feat:` is backward-compatible functionality (minor release).
  - `<type>!:` is a breaking change (major release). Use the truthful type, usually `feat!:` or `fix!:`.
- Use `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `chore`, or `revert` only when accurate. Never label a feature or fix `chore` to dodge a release.
- Use a scope only when the repo or a stable component supports it. Skip vague scopes like `misc` or `repo`. In a release-please manifest or monorepo, prefer the configured component name.
- Write an imperative description with no trailing period. Follow repo length rules, otherwise keep the header within about 72 characters.
- Add a body, after one blank line, only for context or consequences. Explain why the change was made (the problem, and any alternative you rejected), since the diff already shows what changed. Never put a second Conventional Commit header in the body, since release-please parses it as another change.
  - When you lack the reason, ask or leave the body out. Don't invent one.
  - When many files change for one reason, state that reason once and don't list files. If they are unrelated, split the commit.
  - A request to keep it short means a header alone, still in convention.
- For a breaking change, use both `!` and a final `BREAKING CHANGE: <impact and migration>` footer.
- Add `Release-As: x.y.z` only when the user asks for that exact version.
- For a `revert:` commit, keep the `This reverts commit <hash>.` line that `git revert` generates, and add why it is being reverted.
- Reference issues in the footer, never the header. GitHub closes an issue when a commit or PR with `Closes #42` reaches the default branch, and ignores the keyword on any other base. Use one keyword per issue (`Closes #42`, `Closes owner/repo#99`). The keywords are `close`, `fix`, and `resolve` with their `-s` and `-d` forms. Use `Refs #42` when the commit shouldn't close it.
- Under squash merge, the PR title becomes the commit on the default branch, so the title must follow the same format. Check it before merging.
- If the repo customizes release-please types or sections, or uses another release system, follow the checked-in config and cite it.

```text
fix(parser): preserve escaped delimiters

feat(api)!: require explicit tenant IDs

BREAKING CHANGE: callers must pass tenant_id when creating a client.
```

Common mistakes:

| Written | Fix |
| --- | --- |
| `feat: Added login page.` | `feat: add login page`: imperative, lowercase, no period |
| `feat(adding-auth): ...` | `feat(auth): ...`: a scope is a noun naming the area |
| `fix: handle empty list, closes #42` | Move `Closes #42` to the footer |
| Breaking change described only in the body | Add `!` and a `BREAKING CHANGE:` footer, since tools read only those |

## Stage and commit

For each planned commit:

1. Stage only its paths, then reread `git diff --staged` to confirm it holds exactly the intended change.
2. Commit non-interactively, passing multi-line messages through a HEREDOC. Let hooks run.
3. If a hook fails, stop and report its output. Don't bypass it. Fix in a follow-up commit if authorized, and amend only when asked.
4. Run `git status --short` before starting the next commit.

## Report

Give each commit's short hash and subject, the convention evidence used, and files deliberately left uncommitted. For a non-mutating request, give the proposed file groups and messages instead.
