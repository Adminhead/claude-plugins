# CLAUDE.md

`adminhead` is a Claude Code plugin marketplace. `README.md` has the install commands and a generated plugin catalog.

## Plugins

- `baseline` (user scope) and `*-meta` (project scope) are meta plugins: only a `plugin.json` whose `dependencies` list focused plugins or `*-core` bundles. A core bundle (marketplace category `bundle`, named `*-core` by convention, such as `programming-core`; `ef-core` is an ordinary plugin) has the same shape, lists only focused plugins, and is shared by several metas. Every other plugin ships exactly one component.
- Every subagent sets `autoCompactWindow` (plain integer): `100000` for haiku agents, `200000` for light focused agents, `300000` for long-running or reading-heavy ones. It only lowers the inherited window.
- Scaffold with `scripts/plugins.py new`, and run `python3 scripts/plugins.py check` after any plugin change. Never hand-edit the README catalog; run `scripts/plugins.py catalog`.
- The Bash parser (`shell/walk.ts`, `vendor/unbash.*`) is vendored into several guard plugins. Edit only `scripts/shared/`, then run `scripts/plugins.py sync-shared`; `check` fails on a drifted copy.

## Commits

Conventional Commits, lowercase subject: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `docs(plan): ...`, `chore`, `test`. The scope is a plugin or area (`coremods`, `crew`, `scripts`). Stage explicit paths.

## Mods

The Claude Code mods API (the `claude-code` module that hooks modules such as `plugins/coremods/hooks/register.tsx` import) is published at https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts. Check it there before relying on a `$.*` method or event shape.

- A mod is a TSX hooks module in a plugin such as `plugins/coremods/hooks/`. Test with `claude plugin test plugins/<name>` and validate with `claude plugin validate plugins/<name>`.
- The engine refuses a plugin that registers the same event twice, so all mods in a plugin share one `register.tsx`.
- A hooks module may import only its own files by relative path and `'claude-code'`, so no bare npm imports. A pure-JS dependency can be vendored by bundling it into a relative file (`bun build entry.js --format=esm --target=browser --outfile=hooks/vendor/<name>.js`). Mods run in a sandbox with no `node:` modules, `process`, `Buffer`, `fetch`, `WebAssembly` or `new Function`/string eval, so a bundle that needs any of those fails to load (native addons and WASM builds such as DuckDB's are out).
- `CLAUDE_PLUGIN_DATA` is not in a mod's `$.process.run` env. It is set for classic hook commands.
- A mod knows its own install as `$.plugin.root`. To reach a hook-side script, run `$.plugin.root/scripts/...` and find the data dir by matching the `plugin-root` file the SessionStart hook wrote (`~/.claude/plugins/data/<name>-*`); never take a script path from a data-dir file. Pass such values to `sh -c` as argv.
- A mod `tool.call` regex runs on model-controlled text, so bound the input length before matching.
- `hooks/hooks.json` can hold both `"modules"` and classic `"hooks"` (coremods does). Classic hooks do not fire for a call a mod's `tool.call` denied. Hook-side scripts (`plugins/coremods/scripts/`) can use real libraries such as `@duckdb/node-api`, installed into `${CLAUDE_PLUGIN_DATA}` by a SessionStart hook. Their specs are `*.spec.ts` (run with `bun test`) because `claude plugin test` loads every `*.test.*` file as a mod test.
- Keep pure logic in side files that don't use `$`, and put the `$` code in `register.tsx`.
