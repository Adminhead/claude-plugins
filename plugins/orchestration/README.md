# orchestration

The main-session orchestrator agent. It plans work, routes it to the installed agents (the `agent-router` mod builds its routing table) and verifies what comes back.

## Install

```
/plugin install orchestration --marketplace Adminhead/claude-plugins
```

`orchestration-meta` installs it together with `agent-router`, the general agents and `readonly-agent-gate`.

## Start a session

With `--agent`, an agent's prompt replaces Claude Code's default system prompt. `prompts/system_override.md` carries the core default guidance (tools, safety, communication), and the launcher appends it:

```
<plugin root>/scripts/claude-orchestrate [DIR] [CLAUDE_ARGS...]
```

It runs `claude --agent orchestration:orchestration --append-system-prompt-file <plugin root>/prompts/system_override.md` in DIR. Link it onto your `PATH`, for example `ln -s <plugin root>/scripts/claude-orchestrate ~/.local/bin/`. Find the plugin root with `claude plugin list --json` (`readFromFolder` for a directory marketplace, else `installPath`).

`claude --agent orchestration:orchestration` or the `agent` setting also work, but start without the core prompt.

## Keeping the prompt current

`system_override.md` is adapted from Claude Code's built-in system prompt, so it drifts as Claude Code changes. After a Claude Code upgrade, run:

```
<plugin root>/scripts/prompt-drift.sh [VERSION|PATH]
```

It reads the `claude` binary (default: the one on `PATH`; a VERSION names one under `~/.local/share/claude/versions`) and exits 1 listing any drift: the `--agent` plus `--append-system-prompt-file` route no longer appending last, the system prompt's section list gaining, losing or reordering a section, or a phrase this prompt copies verbatim disappearing. It needs `strings` and `rg` with PCRE2. The expected state is pinned to Claude Code 2.1.302. When it reports drift, update `system_override.md` and the expected lists in the script together. `scripts/prompt-drift.test.sh` tests the script against a synthetic binary.
