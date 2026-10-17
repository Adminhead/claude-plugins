---
name: handoff
description: Compacts the current conversation into a handoff document a fresh session can pick up, and with --bg launches that session as a background agent. Manual command.
argument-hint: "[--bg] [what the next session will work on]"
disable-model-invocation: true
---

# Handoff

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

Adapted from mattpocock/skills `handoff` and `claude-handoff` (MIT, Copyright (c) 2026 Matt Pocock). See `LICENSE`.

## Arguments

`$ARGUMENTS` may start with `--bg`. Strip it and treat the rest as a description of what the next session will focus on; tailor the document to that. With no description, cover the work as it stands.

## Write the document

Save it to the OS temporary directory, not the workspace: `mktemp "${TMPDIR:-/tmp}/handoff-XXXXXX.md"` (`%TEMP%` on Windows).

Include:

- **Goal**: what the work is for and what "done" looks like.
- **State**: what is finished, what is in progress, and what was tried and rejected, with the reason.
- **Next steps**: the concrete next actions, in order.
- **Open questions**: decisions still waiting on the user.
- **References**: paths and URLs of specs, plans, ADRs, issues, commits, branches and diffs. Reference them; don't copy their content.
- **Suggested skills**: which skills the next agent should call the Skill tool for.

Redact secrets and personal data: API keys, tokens, passwords, and personally identifiable information.

Without `--bg`, finish by giving the file path and a one-line way to use it, for example starting a new session with `claude "$(cat <file>)"`.

## --bg: launch a background agent

With `--bg`, the document becomes the prompt of a new background session that starts in the current working directory and returns immediately:

```bash
claude --bg --name "<descriptive name>" -- "$(cat <file>)"
```

- Always pass `--name` (alias `-n`) with a short descriptive name such as `"Fix login bug"`. It is the display name in `claude agents`, the session picker and the terminal title.
- Pass the summary through `$(cat <file>)`, never inline in the command, so the shell doesn't run backticks or expand `$` in it.
- Because the summary becomes the agent's prompt, write it as instructions to that agent ("Continue ..."), and double-check the redaction.
- Report the id the command prints and tell the user how to manage the session: `claude agents` lists it, `claude attach <id|name>` opens it, `claude logs <id|name>` shows recent output, `claude stop <id>` stops it.
- If `claude --help` doesn't list `--bg` (older Claude Code), skip the launch, give the file path, and say why.
