# consult

A mod that registers the `mcp__consult__consult` tool: a read-only review of a diff or a plan by the `codex` (OpenAI) or `agy` (Google Gemini) CLI. The `second-opinion` skill tells Claude when and how to call it and depends on this plugin.

## Install

```
/plugin install consult --marketplace Adminhead/claude-plugins
```

Needs `codex` and/or `agy` on `PATH` and signed in, plus `git`, `timeout` and, for agy, `jq`.

## What it does

- The engine's permission rules apply: an allow rule for `mcp__consult__consult` runs it unattended, otherwise the person is asked, and a session with nobody to ask is refused.
- A `.claude/no-external-review` file in the repo (or the main checkout of a worktree) refuses every call for that repo.
- Diff mode refuses to send a change that touches secret-like files (`.env`, keys, `*credential*`, ...). `.env.example` is fine.
- codex runs with its read-only sandbox. agy runs in an empty temp workspace whose PreToolUse hook (`scripts/agy-gate.sh`) allows only file-reading tools; the diff and notes go in a file there.
- Each call is killed after `timeoutSec` (default 480, max 540) and the reply is clipped at 60,000 characters.

## Tests

```
claude plugin test plugins/consult              # mod tests (tests/consult.test.ts)
bun test plugins/consult/tests/consult.spec.ts  # shell and git pieces against real temp repos
bash plugins/consult/tests/agy-gate-check.sh    # the agy gate
```
