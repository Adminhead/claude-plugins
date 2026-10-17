# The mod sandbox: what a hooks module can and cannot reach

Written 2026-10-17 from:

- `/home/buck/Projects/adminhead/claude-plugins/CLAUDE.md` ("## Mods", the house rules; authoritative here)
- https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts (header and the `global {}` block, 2.1.277) and this build's copy (2.1.302)
- https://code.claude.com/docs/en/plugins/mods/api.md ("Reach files, processes, and the network") and https://code.claude.com/docs/en/plugins/mods/reference.md ("Limits")
- The `plugin-authoring` skill's `reference.md` (bundled with Claude Code 2.1.302)
- The archived `coremods` mod at `/home/buck/Projects/adminhead/claude-plugins/archive/plugins/coremods/` (`hooks/vendor/unbash.js`, `hooks/tool-mgr/rules.ts`, `scripts/session-start.sh`)

## Available

- ES2023 JavaScript, TypeScript syntax, JSX (`.tsx`/`.jsx`) compiled against the globals `h` and `Fragment`.
- Web globals: `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `AbortController`, `AbortSignal`, `atob`, `btoa`, `structuredClone`, `crypto.subtle.digest`, `crypto.randomUUID`, `crypto.getRandomValues`, `performance.now`.
- `import type { ... } from 'claude-code'` (empty at run time) and the value imports `atom`, `read`, `update`, `derive`, `memberOf` from `'claude-code'` (2.1.302).
- `import ... from './relative/file'` for files inside the plugin, named `.ts .tsx .jsx .js .mjs .cjs .mts .cts`, each an ES module.
- Everything outside the module through `$`: files (`$.fs`), processes (`$.process`), network (`$.http`), time (`$.clock`), environment (`$.env`), settings, the store, the session.

## Not available (the module fails to load, or the call throws)

| Missing | Use instead |
| --- | --- |
| `node:*` modules, `require`, `process`, `Buffer`, `__dirname`, `import.meta` | `$.fs`, `$.process.run`, `$.env.get`, `$.plugin.root`; `Uint8Array.fromBase64` / `.toBase64` for bytes |
| `fetch`, `XMLHttpRequest`, WebSocket | `$.http.fetch(url, init)` |
| `setTimeout`, `setInterval`, `Date.now()` as the clock of record | `$.clock.after`, `$.clock.every`, `$.clock.sleep`, `$.clock.now()` (tests can then drive time with `mock.clock`) |
| `WebAssembly` (deliberately absent), `eval`, `new Function` over a string | Run compiled or native code in a child via `$.process.run` or a classic hook script |
| DOM, `window`, `document`, `console` (hooks modules; a `Client` surface module does get `console`) | `$.ui.log(text)`; `$.ui.log(text, { to: 'debug' })` |
| Bare npm imports (`import x from 'lodash'`) | Vendor a pure-JS bundle into a relative file (recipe below) |
| Dynamic `import()` | A module holding `import()` does not load; use static imports |
| `obj.__proto__ = p` on non-functions | `Object.setPrototypeOf` / `Object.create` |

Other hard limits the engine enforces: `$.fs.read`/`write` 4 MiB per file; `$.http.fetch` 30 s, 5 redirects, 4 MiB each way; `$.process.run` 30 s default and 10 min max, stdout/stderr cut at 4 MiB each; `$.store` 4 MiB of JSON total; hook budget 10 s of its own code (`.catch` 1 s); a tree draws its first 100,000 characters; 2,000 nested scopes per file (`code nested too deep to scan`).

## Things validate scans off the source (write them literally)

- `on(...)` calls and their patterns; a second `on('<event>')` with no matcher fails the load.
- Every `$.noun.method` call. Never alias or store `$` (`const ui = $.ui` defeats the scan; the archived coremods comment: "The engine refuses to let `$` be stored, so the deps are closures that spell `$.noun.event(...)`"). A helper that takes `$` as a parameter and spells `$.noun.method(...)` inside is fine.
- `$.env.get('NAME')` / `$.env.set('NAME', ...)`: the name must be a string literal.
- `$.state` refs: `{ plugin: 'name', key: 'k' } as const`, both literals, each `atom` held in a `const`, each key declared in `types/index.d.ts` under `interface PluginState`, the file named in `plugin.json` as `"types"`.

## Vendoring a pure-JS dependency (house recipe)

From CLAUDE.md: a hooks module may import only its own files and `'claude-code'`, so bundle the dependency into a relative file.

```sh
# in a scratch dir, outside the plugin
npm pack <pkg>@<version> && mkdir x && tar -xzf <pkg>-<version>.tgz -C x
printf "export { parse } from './x/package/dist/parser.js'\n" > entry.js
bun build entry.js --format=esm --target=browser --outfile=<plugin>/hooks/vendor/<name>.js
```

Then in the mod: `import { parse } from '../vendor/<name>.js'` and a hand-written `vendor/<name>.d.ts` for the types. Head the bundle with provenance (package, version, tarball URL, integrity hash, the exact build command) as `archive/plugins/coremods/hooks/vendor/unbash.js` does, and state what was checked: "The bundle has no WebAssembly, eval, new Function, process, require, node: or import.meta." Check it:

```sh
grep -nE "WebAssembly|new Function|\beval\(|\bprocess\.|require\(|node:|import\.meta" hooks/vendor/<name>.js
```

A bundle that needs any of those fails to load: native addons and WASM builds (DuckDB's, for one) are out of the module. Put such a library on the hook side instead.

## The two sides of one plugin

`hooks/hooks.json` holds both `"modules"` (the mod) and classic `"hooks"` (command hooks). They run in different worlds:

| | Mod (`register.tsx`) | Classic hook script (`scripts/*.ts`, `*.sh`, `*.mjs`) |
| --- | --- | --- |
| Runtime | The engine's sandbox above | A real process (`bun`, `node`, `sh`) with full Node/Bun APIs and real libraries |
| Env | `CLAUDE_PLUGIN_DATA` is NOT set in `$.process.run`'s env | `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` are set |
| Fires for a mod-denied `tool.call` | Yes (it is the mod) | No: classic hooks never see a call a mod denied, so a mod that denies must log its own denies |
| Tests | `*.test.ts(x)` via `claude plugin test` | `*.spec.ts` via `bun test` (never `*.test.*`: `claude plugin test` would load it as a mod test) |

Install heavy dependencies for the hook side with a `SessionStart` classic hook (`"async": true`) that runs `npm ci` into `${CLAUDE_PLUGIN_DATA}`, stamps success, and fails open (always exits 0). `archive/plugins/coremods/scripts/session-start.sh` is the model: a mkdir lock serialises concurrent sessions, a stamp holding the checksum of `package.json` + `package-lock.json` marks a finished install, and it writes `plugin-root` (see below).

## Data-dir discovery from a mod (house pattern)

The mod only knows `$.plugin.root`. The data dir (`~/.claude/plugins/data/<name>-*`) is found by matching the `plugin-root` file the SessionStart hook wrote, and the script path always comes from `$.plugin.root`, never from anything read out of the data dir. Values go to `sh -c` as argv (`$1`, `$2`), never interpolated into the script string; the payload goes on stdin.

```ts
// hooks/tool-mgr/rules.ts (pure; no `$`)
export const DATA_DIR_SH =
  'ROOT="$1"; d=""; for c in "$HOME"/.claude/plugins/data/coremods-*; do if [ -f "$c/plugin-root" ] && [ "$(cat "$c/plugin-root")" = "$ROOT" ]; then d="$c"; break; fi; done'
export const RUN_SCRIPT = `${DATA_DIR_SH}; if [ -z "$d" ] || [ ! -f "$d/installed.stamp" ]; then echo "metrics not ready yet" >&2; exit 1; fi; CLAUDE_PLUGIN_DATA="$d" exec node "$ROOT/scripts/metrics.mjs"`

// register.tsx
const out = await $.process.run(['sh', '-c', RUN_SCRIPT, 'sh', $.plugin.root], { stdin: JSON.stringify(cmd), timeoutMs: 30_000 })
```

Hook-side `bun` scripts should run `bun --no-env-file --config=/dev/null <script>` so the cwd project's `bunfig.toml` preload and `.env` cannot reach them (`scripts/tests/bun-isolation.spec.ts` in the archive checks every `bun` hook for this).

## Where state lives, and how long

| Place | Lasts until | Reset by |
| --- | --- | --- |
| Module variable | The next hot reload (every save while developing) | Reload; `session.end` with `reason: 'clear'` if you reset it yourself |
| `$.state` | The session ends | `/clear`, `/resume`, `/branch` (hook `classic.SessionStart` with `{ source: ['clear', 'resume', 'fork'] }` to reload from `$.store`) |
| `$.store` | Deleted, or unused for `cleanupPeriodDays` | Shared by every session on the machine; read right before you write |
| The data dir (`CLAUDE_PLUGIN_DATA`) | Kept across plugin updates | Hook-side only |

## Loading and reloading

- `claude --plugin-dir <folder>` (repeatable) loads a mod for one session and hot-reloads it on save; `CLAUDE_CODE_PLUGIN_DIRS` does the same where no flag can be given. `register` runs again in a fresh environment and the old environment's timers are dropped; `session.start` fires again.
- A plugin installed from a marketplace whose `source` is a relative folder path (this repo) is read from that folder: edit, then `/reload-plugins`; `claude plugin list` shows `Read from:`.
- A session the model is editing from reloads once the turn ends.
- Hot reloading, `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS` can be refused by managed settings (`disableSideloadFlags`, `allowManagedModsOnly`, `disableAllHooks`); a `-p` run prints `hooks module ... not loaded:` on stderr with the reason.
