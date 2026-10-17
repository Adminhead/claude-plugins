# Channels, signals, and soft-delete

Read this when inventorying a setup or removing an approved item.

## Channels

| Channel | Where | Signals that an item is stale or redundant |
| --- | --- | --- |
| Skills | `~/.claude/skills/`, `.claude/skills/` | Near-duplicate names or descriptions, domain unrelated to the person's work, empty or broken `SKILL.md`, never loaded in recent transcripts |
| Plugins | The `/plugin` listing | Overlapping skills across plugins, plugins whose skills never appear in use. Disable a plugin with `claude plugin disable <plugin>` and leave its files alone |
| Memory and rules | `CLAUDE.md` chain, `.claude/rules/`, memory files and their index | Entries that contradict newer ones, passed dates, orphan files missing from the index, fragments that should merge, rules that repeat the global CLAUDE.md |
| Hooks | `hooks` in settings files, hook scripts | Scripts no hook config references, scripts superseded by a rewrite, hooks that error on every run |
| Permissions | `permissions` in `settings.json` and `settings.local.json` | In the `allow` list only: duplicate entries, specific entries shadowed by a wildcard, one-off grants from past experiments, grants for tools no longer installed. Removing an `ask` or `deny` entry loosens permissions, so never treat one as redundant clutter, and flag any such proposal as loosening |
| MCP servers | `.mcp.json`, the user MCP config, `claude mcp list` | Servers that fail to connect, functional duplicates, servers wrapping a CLI the person already has |
| Project history | `~/.claude/projects/` | Stale handoff snapshots, records superseded by newer state |
| Runtime caches | `~/.claude/` cache, file-history, logs, shell-snapshots directories | Large and older than about 30 days. Sort by size and time |

Permissions are usually the highest-value channel per minute, because redundant allow entries also make security review harder. When two skills overlap, retire the one with the weaker trigger description, since it was probably not firing anyway.

## Read-only checks

Orphaned hook scripts, assuming scripts live in `~/.claude/hooks/`:

```sh
for f in ~/.claude/hooks/*; do
  grep -q "$(basename "$f")" ~/.claude/settings.json ~/.claude/settings.local.json 2>/dev/null || echo "orphan: $f"
done
```

Duplicate permission entries:

```sh
for f in ~/.claude/settings.json ~/.claude/settings.local.json; do
  echo "== $f"; jq -r '.permissions.allow[]?' "$f" | sort | uniq -d
done
```

Run the same loop on the project's `.claude/settings.json` and `.claude/settings.local.json` when the project is in scope. Duplicates across files also count.

Largest stale cache files:

```sh
find ~/.claude/file-history ~/.claude/shell-snapshots -type f -mtime +30 -exec du -k {} + 2>/dev/null | sort -rn | head -20
```

## Soft-delete

Capture the date once so the log and the directory agree.

- **Skill or hook file:** move it to `~/.claude/_audit_trash/<date>/` and append one line to `~/.claude/config-audit-log.md` with the timestamp, the item, and the undo command (`mv` back).
- **JSON entry such as a permission:** copy the settings file to a `.bak` first, record the entry verbatim in the log, then remove it with `jq`. JSON has no comments, so the log is the only record of the entry.
- **Memory files:** read both files and keep the newer truth. Move both originals to `~/.claude/_audit_trash/<date>/` and log the move before writing the merged file. Do not truncate.
- **Plugins:** after the person confirms, run `claude plugin disable <plugin>`. Undo with `claude plugin enable <plugin>`.
- **MCP servers:** prefer disabling over removal. The person can toggle a server in `/mcp`, and a project server can be listed in `disabledMcpjsonServers`. Before any removal, copy the file that holds the entry (`~/.claude.json` or the project `.mcp.json`) to a `.bak`, and log a redacted `claude mcp get <name>` snapshot with env values, headers, and tokens replaced by `<redacted>`. Never write a secret into the log. Restore from the `.bak`.

Keep the log. It is small, and "when did I disable that hook and why" comes up later.
