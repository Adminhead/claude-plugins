# cache-clock

A mod that shows roughly when the prompt cache expires, under the prompt hint (terminal only):

- `cache warm → ~14:32` (dim) after a main-loop turn
- `cache cold since ~14:32` (warning colour) once the TTL has passed

The next prompt after the cache goes cold pays to write the whole context to the cache again, so this tells you whether a pause has cost you that.

## Install

```
/plugin install cache-clock --marketplace Adminhead/claude-plugins
```

## Options

Set with `/config` or `pluginConfigs["cache-clock"].options`:

- `ttl`: `5m` (default, the API's standard cache) or `1h` (if you run with the extended 1-hour cache).
- `display`: `hint` (default) stacks a coloured segment under the prompt hint; `status` pins a plain `$.ui.status` line instead (no colour).

## It is an estimate

Mods can't see the real cache expiry. The clock assumes the cache was refreshed when the last main-loop `turn.complete` that got an API response ended (no `agentId`, `usage` present), and adds the TTL. The `~` says so. Known gaps:

- The cache is per prefix. A compaction, a model switch or an edited CLAUDE.md changes the prefix, so the next turn misses even while the clock says warm.
- Subagent turns are ignored (they cache their own prefix).
- The time is local and rechecked every 15 s, so the warm-to-cold flip can lag by up to 15 s.

The clock resets on `session.end` (including `/clear`).

Idea from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT; no code copied).

Test: `claude plugin test plugins/cache-clock`.
