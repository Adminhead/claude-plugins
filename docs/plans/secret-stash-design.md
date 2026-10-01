# secret-stash — design

Status: records the pre-implementation design. The code supersedes its signatures (windowing was removed, `putAll` now accepts short values, and `VAULT` is local to each hook file).

Companion to `secret-stash.md`. `T` means the engine's `claude-code.d.ts` (2.1.285) at
`/tmp/claude-1000/bundled-skills/2.1.285/d2470fe1888144f9727974749c457873/plugin-authoring/types/claude-code.d.ts`.

## Slice 0 results

| Spike | Result |
| --- | --- |
| openredaction bundle | Works in the hooks runtime. `hooks/vendor/openredaction-lite.mjs`, built by `scripts/build-vendor.sh` (Blob patched to TextEncoder). About 1 ms per 200 KB with 12 credential patterns; 258 ms and false positives with all 579. `patterns` restriction is required. |
| userConfig | Types `string`, `number`, `boolean`, `directory`, `file`; attrs `title` (required), `description`, `default`, `required`, `sensitive`, `multiple`, `min`, `max`, `options`. `multiple` yields `string[]`. |
| tool_use record | A `tool.call` input rewrite doesn't change the stored `tool_use`. Only the `tool_result` carries the restored value. |
| `$.state` | Wiped by `/clear` (no `session.start` follows; `session.end` reason `clear`) and by resume. |
| Stream rewrite | A `turn.step` rewrite is stored; a `session.append` response-door re-redaction keeps it out of the transcript and later requests. Headless shows the stored (ID) form; TUI display unverified. |
| Classifier | Not checked. |
| Async overrun | `.catch` fires at 10 s (grace 1 s); marker reaches the request. |
| Sync overrun | Fails open: `.catch` never fires, raw row is sent, and the plugin appears dead afterwards. Redaction must await between bounded windows; customPatterns need a ReDoS guard. |
| session.append catch | Replacing `content` wholesale doesn't work: the engine puts back the tool_result block. Rewrite `tool_result.content` in place. |
| Structured record | Raw stays in the `.jsonl` row's `toolUseResult` (Bash `.stdout`, Read `.file.content`) but is never re-sent, including on resume. |

## File tree (`plugins/secret-stash/`)

```
.claude-plugin/plugin.json   userConfig, "types": "./types/index.d.ts"
hooks/hooks.json             { "modules": ["./register.ts"] }
hooks/register.ts            registerOutbound(on, options); registerInbound(on, options)
hooks/outbound.ts            outbound hooks + .catch
hooks/inbound.ts             tool.call, turn.step + .catch
hooks/failclosed.ts          MARKER, per-event markerizers, toastOnce
hooks/context.ts             loadCtx($, options): Ctx (config, key, vault, detectors)
hooks/types.ts               Match, Detector, Found, Lookup
hooks/ids.ts  detect.ts  redact.ts  restore.ts
hooks/vault.ts  config.ts  sources.ts (env + pass-cli)
hooks/detectors/{envrule,openredaction,custom}.ts
hooks/vendor/openredaction-lite.mjs
scripts/build-vendor.sh
types/index.d.ts
tests/*.test.ts
```

Keep each file under about 300 lines.

## Signatures

```ts
// types.ts
export type Source = 'registered' | 'vault' | 'env' | 'custom' | 'openredaction'  // tie priority, in order
export type Match = { start: number; end: number; category: string; source: Source }
export type Detector = { source: Source; detect(text: string): Match[] }  // async if openredaction requires
export type Found = { id: string; value: string; category: string }
export type Lookup = (id: string) => string | undefined

// ids.ts
export const ID_RE = /__SS_[A-Z0-9_]{1,32}_[0-9a-f]{16}__/g
export const ID_MAX_LEN = 56
export const MIN_SECRET_LEN = 8
export function sanitizeCategory(raw: string): string   // [^A-Z0-9_]→_, collapse, trim _, cap 32, ''→'SECRET'
export function hmacSha256(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array>  // built on crypto.subtle.digest
export function makeId(key: Uint8Array, category: string, value: string): Promise<string>
export function couldBeIdPrefix(tail: string): boolean
export function newKey(): Uint8Array                     // crypto.getRandomValues (T:13449)

// detect.ts
export function literalDetector(lits: readonly { value: string; category: string }[]): Detector
export function detect(text: string, ds: readonly Detector[]): Match[]
// Drops matches overlapping an ID_RE span or shorter than MIN_SECRET_LEN.
// Overlaps: longest first, then Source order.

// redact.ts
export type RedactCtx = { detectors: readonly Detector[]; key: Uint8Array; idFor(value: string): string | undefined; deadline: number }
export class DeadlineExceeded extends Error {}
export function redactText(t: string, c: RedactCtx): Promise<{ text: string; found: Found[] }>
export function redactBlocks(b: ApiContentBlock[], c: RedactCtx): Promise<{ blocks: ApiContentBlock[]; found: Found[] }>
export function redactDeep<T>(v: T, c: RedactCtx): Promise<{ value: T; found: Found[] }>
// idFor(value) wins over makeId: one value keeps one ID whatever category re-detects it.
// Deadline (dispatch start + 7 s) checked between detectors and between 64 KB windows (1 KB overlap).

// restore.ts
export function restoreText(t: string, get: Lookup): string          // unknown IDs stay verbatim
export function restoreDeep<T extends object>(input: T, get: Lookup, skip: ReadonlySet<string> | 'all'): T
export class StreamRestorer {
  constructor(get: Lookup)
  push(c: TurnStepChunk): TurnStepChunk[]
  // Text passes as { ...c, text } (keeps ref). Holds only a tail where couldBeIdPrefix is true.
  // Flushes the tail as a fresh { kind: 'text', index, text } on a new index or any non-text chunk.
}

// vault.ts
export const VAULT = { plugin: 'secret-stash', key: 'vault' } as const
export type VaultEntry = { value: string; category: string }
export type VaultState = { loadedFor: string; entries: Record<string, VaultEntry> }
export type Vault = { get: Lookup; idFor(value: string): string | undefined; literals(): readonly VaultEntry[] }
export function ensureLoaded($: EngineInterface, cfg: Config): Promise<Vault>
// Session id from await $.session.id() (T:2572). On a new id, re-resolves registered sources and merges.
export function putAll($: EngineInterface, found: readonly Found[]): Promise<void>
// update() from 'claude-code' (T:13316), ifVersion retry. Throws below MIN_SECRET_LEN.

// config.ts
export type CustomPattern = { type: string; regex: string }
export type ProjectConfig = { env: string[]; pass: string[]; envKeyRule: boolean;
  openredaction: { patterns?: string[]; categories: string[]; preset: string | null; whitelist: string[]; customPatterns: CustomPattern[] } }
export type Config = { envVars: string[]; projectFile: string; project: ProjectConfig }
export type ConfigError = { path: string; message: string }
export class ConfigInvalid extends Error { constructor(readonly errors: ConfigError[]) }
export function parseOptions(o: PluginOptions): { envVars: string[]; projectFile: string }
export function parseProjectFile(text: string): ProjectConfig   // throws ConfigInvalid
export function loadConfig($: EngineInterface, o: PluginOptions): Promise<Config>

// inbound.ts
export const RESTORE_SKIP: Record<string, readonly string[] | 'all'> = {
  WebFetch: ['prompt'], WebSearch: ['query'], Agent: ['prompt', 'description'], SendMessage: 'all',
  SendFeedback: 'all', RemoteTrigger: ['body'],
}
// Reserved keys never walked: tool, tool_use_id, agentId, consent.
```

`types/index.d.ts` merges `{ 'secret-stash': { vault: VaultState } }` into `interface PluginState` and exports a PascalCase type led by the plugin name (validate rejects a bare `declare module`).

## Hooks

Every hook redacts before `next`. On failure: `called` false → handler calls `next(markerized e)`; `called` true → `next(e)` replays (T:1003).

| Event | Rewrites (T line) | `.catch` answer |
| --- | --- | --- |
| prompt.submit | `next({...e, text, context})` (8065) | `next({...e, text: MARKER, context: undefined})` |
| session.append (all doors) | text blocks, tool_result content (9578) | those become MARKER, `tool_use_id` kept; must call `next` |
| prompt.section | `{text}` after next (8013) | `{text: MARKER}` |
| prompt.context | `{blocks}` (7600); rewrite only matching blocks | `{blocks: [{name: 'secret-stash', text: MARKER}]}` |
| prompt.attachment | `{text}` (7462) | `{text: MARKER}` |
| tool.describe | `{...r, description}` (11791) | `{description: MARKER}` |
| agent.spawn | `next({...e, prompt, description})` (238) | `{deny: MARKER}` |
| session.send | `next({...e, text})` (10494) | `{isDelivered: false, reason: MARKER}` |
| session.compact | `next({...e, instructions})` (9740) | `{skip: MARKER}` |
| model.complete / fork / classify | prompt+system / prompt / text (6258) | `{deny: MARKER}` |
| tool.call | `next({...e, ...restoreDeep})`; result left as is (user decision: local structured records may stay raw; `session.append` redacts what the model reads) (11590) | `called ? next(e) : {deny: 'secret-stash: restore failed'}` |
| turn.step (main loop) | text chunks via StreamRestorer (12362) | yield `next(e)` raw |

`model.*` fire only for plugins' own `$.model` calls. Engine side calls (compaction summarizer, classifier, WebFetch summarizer) are UNCONFIRMED.

## User decisions (2026-09-30)

- Invalid config: `prompt.submit` drops each prompt with the config error (`{drop: reason}`) until fixed. Other outbound hooks marker their content.
- Restore exceptions add `SendFeedback` (all) and `RemoteTrigger.body`.
- Tool structured records and attachment payloads may stay raw in the local transcript. The smoke test's zero-hit check covers API request bodies, not the `.jsonl`.

## Tests

`claude plugin test` only (runs in the hooks runtime, so RFC 4231 vectors prove digest-only HMAC). Kit has `mock.env`, `mock.store`, `mock.clock`; a test's `on()` can answer or throw beneath the plugin. Slice 1's first test confirms a test can import `../hooks/ids.ts` from `tests/`; fallback is `hooks/*.test.ts`.

## Slices

| Slice | Files | Depends on | Agent |
| --- | --- | --- | --- |
| 1 core | types, ids, detect, redact, restore + tests | — | coder |
| 2 sources/config | config, sources, vault, context, detectors/*, types/index.d.ts, plugin.json | 1 | coder |
| 3 outbound | outbound, failclosed, register, stub inbound + tests | 1, 2 | coder |
| 4 inbound | inbound + tests | 1, 2 | coder-max |
| 5 packaging | marketplace.json, README, smoke | 3, 4 | scribe + manual |
