# CLAUDE.md

`adminhead` is a Claude Code plugin marketplace. `README.md` has the plugin table and install command.

## Layout

- `plugins/<name>/` holds one plugin each, with `.claude-plugin/plugin.json`. The catalog is `.claude-plugin/marketplace.json`.
- `docs/plugins/<name>.md` is the per-plugin page. Several plugins can share a page (`coding-*` share `docs/plugins/coding.md`, `sentry-*` share `docs/plugins/sentry.md`, and `github-admin` shares `docs/plugins/github.md`). `docs/plans/` holds plans and `docs/research/` holds research notes.
- `plugins/crew/` holds the orchestrated-session crew: the 15 agents, the read-only Bash gates, the orchestration hooks and the system prompt file. Its agents are `crew:<name>`. `plugins/crew/docs/writing-agents.md` holds the rules for writing and changing agents, and its edit loop is `claude --plugin-dir plugins/crew`.
- `scripts/` holds the checks and the `claude-tmux` launcher.

## Checks

Run from the repo root.

- `python3 scripts/agent-tools.py` checks the crew agents in `plugins/crew/agents` (frontmatter, and the read-only rules for each agent in `READ_ONLY`) and the gate entries in `plugins/crew/hooks/hooks.json`. Run it after editing an agent or a gate.
- `scripts/prompt-drift.sh [VERSION|PATH]` checks that a Claude Code upgrade hasn't broken the system-prompt override (`plugins/crew/prompts/system_override.md`). Run it after upgrading Claude Code.
- `bash plugins/crew/scripts/tests/check.sh` runs every crew check: the agent checker and its tests, both read-only gate suites, the guard suite and the bash replay. It is the one entry point for the crew plugin.
- `bash scripts/prompt-drift.test.sh` tests the drift script.
- `bash scripts/install.test.sh` tests `scripts/install.sh` against a temp `HOME` and a stub `claude`.
- `claude plugin validate --strict plugins/<name>` validates one plugin. `claude plugin validate --strict .` validates the marketplace.

## Releasing a plugin

Use the `ship-plugin` skill (`.claude/skills/ship-plugin/SKILL.md`). Before it runs, these records must agree for the plugin:

- `version` in `plugins/<name>/.claude-plugin/plugin.json` equals the entry in `.claude-plugin/marketplace.json` and is higher than on `origin/main`. An unchanged version means installed copies don't update.
- The docs page the README row links to (`docs/plugins/<name>.md` or a family page) exists and names every skill under `plugins/<name>/skills/`.
- `README.md` has a row for the plugin that links to its docs page.

Commit to local `main`. Push only when asked.

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
