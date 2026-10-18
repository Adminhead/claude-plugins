# atlassian-docs

A SessionStart hook that tells Claude to write lasting project knowledge to Confluence and Jira as well as the repo. It fires at startup, resume, `/clear` and after compaction, so the instruction survives a compacted context. The hook only runs `cat` on [`hooks/session-context.md`](hooks/session-context.md), which is the full text Claude receives.

It depends on [`atlassian-mcp`](../atlassian-mcp), which provides the MCP server.

## Install

```bash
claude plugin install atlassian-docs@adminhead --scope project
```

This installs `atlassian-mcp` too. Follow its README to sign in with `/mcp`.

## Per-project setup

Name the target in the project's CLAUDE.md so Claude doesn't have to search or ask, for example:

```markdown
## Docs
Confluence space: PLAT
Jira project: PLAT
```

Without it, Claude searches for a matching space and project and asks you when none clearly fits.

## What Claude is told

- The repo keeps what belongs next to the code. Confluence gets architecture, decisions and their reasons, runbooks, environment details, onboarding, integration contracts and debugging or incident findings. Jira gets work not being done now, such as bugs found but not fixed, follow-ups and tech debt.
- Search first. Update an existing page or issue rather than create a duplicate.
- Confirm before creating pages, rewriting most of one, or filing, transitioning or assigning issues. Proposed issues come as one list. Small page corrections go straight in.
- Never write secrets or personal data.
- If the tools aren't signed in, say so once and carry on.
