---
name: config-audit
description: Audit the installed Claude Code setup for bloat and rot (skills, plugins, memory, hooks, permissions, MCP servers, caches), measure each item's context cost, and propose Keep, Improve, Update, Retire, or Merge verdicts with evidence. Cleanup is soft-delete only, confirmed one item at a time. Use for "clean up my config", "too many skills", "my setup is bloated", or a periodic hygiene review. Not for security review of config (authoring:agent-config-audit), a single CLAUDE.md (claude-md-management:claude-md-improver, if installed), or rewriting instruction files (authoring:manage-agent-instructions).
---

# Config Audit

Skills, memory, hooks, permission entries, and MCP servers are only ever added, so a setup rots unless someone prunes it. This skill finds candidates, shows the evidence, and removes nothing without the person's decision on each item.

## Rules

- Start read-only. Make no change until the person approves that specific item.
- Remove items by disabling them or moving them to a dated trash directory, and log how to undo it. Permanent deletion happens only when the person explicitly asks for it.
- Confirm items one at a time. A bulk "remove all" removes the person's chance to catch a mistake.
- Treat age as a signal, not a verdict. A seasonal skill can sit unused for months.
- Stay inside `~/.claude/`, `~/.claude.json`, the project's `.claude/`, and the root `.mcp.json`. Never touch source trees.
- Redact values when showing settings, MCP config, or hook commands, because they may hold tokens or keys.

## Workflow

1. **Scope.** Ask which scope to audit if unclear: user (`~/.claude/` and `~/.claude.json`), the current project (`.claude/` and the root `.mcp.json`), or both. List the paths you will read.
2. **Measure.** Ask the person to run `/context` in the live session for real token counts by category, since Claude cannot run it. For one plugin, `claude plugin details <name>` shows its component inventory and projected token cost. It beats an estimate, so use estimates (about 1.3 tokens per word of prose) only for items `/context` does not break out. Note the biggest consumers: MCP tool schemas, skill and agent descriptions that load every session, and CLAUDE.md and rules.
3. **Inventory.** Read `references/channels.md` for what to inspect per channel and the staleness signals for each. Collect for every candidate its path, channel, the signal that flagged it, size, and last-modified time.
4. **Judge.** Give each candidate a verdict, backed by evidence you cite:

   | Verdict | Meaning |
   | --- | --- |
   | Keep | Useful, current, and unique |
   | Improve | Worth keeping, with a named change (which section, what action) |
   | Update | References an outdated tool, flag, or API. Verify against current docs before saying so |
   | Retire | Broken, stale, or costing more than it returns. Name the defect and what covers the need instead |
   | Merge into X | Substantial overlap with X. Name what to move |

   Check overlap with other skills and with CLAUDE.md, freshness of technical references, and how often it appears in recent transcripts when those are available. A verdict reason must stand alone, so write the evidence, not "unchanged" or "superseded".
5. **Present.** Show a numbered table ranked by confidence (broken or orphaned first, merely old last), capped at about 20 items per run, with the total tokens at stake.
6. **Act on approval.** For each approved item, soft-delete as `references/channels.md` describes, append to the log, and report reclaimed size and a suggested next review date.

## Done when

- Every candidate has a verdict with cited evidence.
- Every change was approved individually and is in the undo log.
- The report states what was not inspected.
