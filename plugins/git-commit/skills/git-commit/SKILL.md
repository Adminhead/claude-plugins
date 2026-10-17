---
name: git-commit
description: Writes and creates Git commits in the repository's own message convention (Conventional Commits, release-please, commitlint) and names new branches to match it. Use when asked to commit, "write a commit message", split changes into several commits, fix a commit message, or name a branch.
---

# Git commit

Build commits from the actual diff, in the repository's own convention. A request to commit authorizes creating commits. It does not authorize pushing (use `ship` for push, PR or merge requests if installed), amending, rebasing, resetting, stashing, force-pushing, skipping hooks, or changing Git config. History rewriting belongs to `git-history`.

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
2. Tooling and release config: `commitlint.config.*`, `.commitlintrc*`, `release-please-config.json`, `.release-please-manifest.json`, release-please in `.github/workflows/`, `semantic-release` config. When any of these exist, read [references/release-tooling.md](references/release-tooling.md).
3. Package or workspace boundaries that define valid scopes.
4. Recent history, when one format clearly dominates.

When evidence is mixed or absent, say so and use Conventional Commits. Don't copy isolated historical exceptions.

## Plan

1. Prefer one logical commit. Split only when changes are independent and each part can be understood and tested alone. Keep tests, docs, and implementation of one change together.
2. Fix each commit's exact file list and message before staging. Stage explicit paths. Use `git add -A` or `git add .` only when the user asked for all changes and you reviewed the full list.
3. If the staged set doesn't match the plan, don't mix it silently with other work. Commit it as its own coherent unit or ask.

## Message format

Use this structure when no other convention exists:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- Lowercase type, optional scope in parentheses, optional `!` right before the colon, one space after it. The header must parse on its own, so put no emoji, ticket number, or bullet in front of it.
- Choose the type from the user-visible effect: `fix:` for a backward-compatible bug fix, `feat:` for backward-compatible functionality, `<type>!:` for a breaking change (use the truthful type, usually `feat!:` or `fix!:`).
- Use `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `chore`, or `revert` only when accurate. Never label a feature or fix `chore` to dodge a release.
- Use a scope only when the repo or a stable component supports it. Skip vague scopes like `misc` or `repo`.
- Write an imperative description with no trailing period. Follow repo length rules, otherwise keep the header within about 72 characters.
- Add a body, after one blank line, only for context or consequences. Explain why (the problem, and any alternative you rejected); the diff already shows what changed.
  - When you lack the reason, ask or leave the body out. Don't invent one.
  - When many files change for one reason, state that reason once and don't list files. If they are unrelated, split the commit.
  - A request to keep it short means a header alone, still in convention.
- For a breaking change, use both `!` and a final `BREAKING CHANGE: <impact and migration>` footer.
- For a `revert:` commit, keep the `This reverts commit <hash>.` line that `git revert` generates, and add why.
- Reference issues in the footer, never the header. `Closes #42` closes the issue when the commit reaches the default branch; use one keyword per issue (`close`, `fix`, `resolve` and their `-s`/`-d` forms). Use `Refs #42` when the commit shouldn't close it.

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

## Branch names

When asked to name or create a branch, or when committing would land topic work on the default branch and the user wants a branch first, detect the naming convention in this order:

1. Local instructions (CLAUDE.md, CONTRIBUTING) and branch rules in repo or hosting settings.
2. Tooling that parses names: release workflows, commitlint, CI `branches:` filters.
3. The prefixes in recent branches (`git branch --all --sort=-committerdate | head -30`), when one pattern clearly dominates.
4. Default: `<type>/<description>`, or `<type>/<issue>-<description>` when an issue exists (`feat/user-authentication`, `fix/87-login-race-condition`).

- Use the same type words as the commit convention, so a `feat/` branch carries `feat:` commits. Where the repo uses `feature/` and `bugfix/`, follow it.
- Lowercase kebab-case description of two to five words, whole name near 50 characters. Only `a-z`, `0-9`, `-` and `/`; a dot only for versioned release branches (`release/v1.2.0`). No author names, dates, or the word `worktree`, and never a trunk name (`main`, `master`, `develop`).
- Validate with `git check-ref-format --branch <name>`; it catches illegal names, not convention breaks.
- Create from the remote default branch without tracking it: `git fetch origin <base>` then `git switch -c <name> --no-track origin/<base>`. Find `<base>` with `git symbolic-ref --short refs/remotes/origin/HEAD` (or `git ls-remote --symref origin HEAD`). Uncommitted changes carry across `git switch -c`; if they don't belong on the new branch, ask before stashing or committing them.
- Pushing, renaming a published branch, or deleting a branch needs the user's approval.

## Report

Give each commit's short hash and subject, the convention evidence used, and files deliberately left uncommitted. For a non-mutating request, give the proposed file groups and messages instead.
