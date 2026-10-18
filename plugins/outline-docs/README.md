# outline-docs

A SessionStart hook that tells Claude to write lasting project knowledge to Outline as well as the repo. It fires at startup, resume, `/clear` and after compaction, so the instruction survives a compacted context. The hook only runs `cat` on [`hooks/session-context.md`](hooks/session-context.md), which is the full text Claude receives.

It depends on [`outline-mcp`](../outline-mcp), which provides the MCP server.

## Install

```bash
claude plugin install outline-docs@adminhead --scope project
```

This installs `outline-mcp` too. Follow its README to sign in with `/mcp`.

## Per-project setup

Name the target in the project's CLAUDE.md so Claude doesn't have to search or ask, for example:

```markdown
## Docs
Outline collection: Platform Engineering
```

Without it, Claude searches Outline for a matching collection and asks you when none clearly fits.

## What Claude is told

- The repo keeps what belongs next to the code. Outline gets architecture, decisions and their reasons, runbooks, environment details, onboarding, integration contracts and debugging or incident findings.
- Search Outline first and update an existing document rather than write a duplicate.
- Confirm before creating a document or rewriting most of one. Small corrections go straight in.
- Never write secrets or personal data.
- If the tools aren't signed in, say so once and carry on.
