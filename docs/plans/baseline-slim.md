# Slim baseline

`baseline` (user scope) drops from 20 plugins to 10, so every session no longer carries skills most projects never use. `baseline` is now 0.5.0.

## Kept in baseline

`git-commit`, `recommend-plugins`, `handoff`, `check-bypass-guard`, `git-statusline`, `usage-band`, `mcp-health`, `bash-rules`, `debloat`, `session-retro`.

## Moved

| Plugin | New home |
| --- | --- |
| `cold-read`, `v0-rewrite`, `ssot-consolidate`, `reorder` | `docs-meta` (project scope) |
| `session-recover`, `catchup`, `tunnel-check`, `lens-review`, `fact-check`, `v0-restart` | `session-meta` (project scope) |

The plugins themselves are unchanged.

## Recommend rule

`recommend-plugins` proposes these metas on project evidence, not stack detection:

- `docs-meta`: substantial `docs/`, many Markdown files, a plugin or docs repo, or ADRs.
- `session-meta`: existing handoff files, plans, or heavy session history.

If the project would use only a minority of a meta's plugins, it proposes the individual focused plugins instead of the whole meta. This is a carve-out to "prefer a meta over its members".

Users who installed `baseline` 0.4.0 keep the 10 moved plugins until they uninstall or prune them; this note does not claim any CLI behaviour on update.
