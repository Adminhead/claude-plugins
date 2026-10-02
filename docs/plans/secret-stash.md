# secret-stash — spec and plan

Status: implemented and smoke-tested, 2026-10-01. Built on Claude Code function hooks, engine 2.1.285.

## Goal

Stop secrets from reaching the Anthropic API. Every secret in content bound for the model is replaced with a stable identifier. Identifiers in the model's output are turned back into real values where they get used: tool arguments and the on-screen response.

## Non-goals

- Secrets inside images (no OCR). Images pass through untouched.
- Rows stored before the plugin loaded (an old transcript on resume).
- Guarding against a model that deliberately sends a restored secret to a third party. Tool restoration is unconditional, and the permission prompt is the only guard.
- General PII (names, addresses, emails) by default. It can be turned on through openredaction categories.
- Encoded secrets (base64, URL-escaped, split across lines). Only literal occurrences are caught.

## Decisions

| Topic | Decision |
| --- | --- |
| Detection | Registered values + openredaction credential patterns + `.env` rule + every value already in the vault (literal match) |
| Detector library | openredaction `lite` build, bundled; credential patterns by default, configurable |
| Prose guard | The keyword patterns (`GENERIC_SECRET`, `GENERIC_API_KEY`, `OAUTH_CLIENT_SECRET`, `OAUTH_TOKEN`, `BEARER_TOKEN`) also need a secret-shaped value, when whitespace or `:` separates keyword and value (`key: value` lines stay covered by the key-name rule, which applies the same shape check to a non-strong key with an unquoted colon-form value). `HEROKU_API_KEY` matches a UUID only with a `heroku` or `api key` word within 50 characters, or an auth key word directly before it (the library accepted `auth` anywhere nearby, which stashed session ids in paths). A separator containing `=` keeps the library match. Shaped means a digit or symbol (`-_.` do not count), or 20+ mixed-case letters, and not a lowercase kebab/snake slug with two or more plain-word segments (`k8s-manifest-generator`); `x()` and `](` are rejected. A prose word with a digit or symbol (`utf8mb4_bin` after "password") is still stashed, a short letters-only passphrase after whitespace is missed, and so is a lowercase letters-only Bearer token (accepted). `AWS_SECRET_KEY` needs 40 characters with 2 of 3 character classes, not a run of lowercase path segments or 40 hex digits, not cut from a longer base64 or path run, and an `aws`, `amazon`, `secret`, or `access key` word within 50 characters either side. Without this, one stashed word (`managers`) spread through the vault literal match and redacted that word everywhere. The vendored bundle is not edited; the guard wraps each pattern's validator |
| Key-name rule | Stash the value (never the key) when a key part ends with SECRET, TOKEN, KEY, PASSWORD, PASSWD, PASSPHRASE, PASS, PWD, CREDENTIAL, AUTH, PRIVATE, or DSN (trailing S ignored), or the key is `*_URL` with userinfo. Parts split on `_ - .` and camelCase. Forms: `.env` (with `export`), JSON, YAML including list items and block scalars, quoted assignments in code. Tool-output prefixes (Read line numbers, `cat -n`, `grep path:line:`, diff signs) and indentation after them are allowed. Block scalars are stashed one line per secret, without prefixes. Skipped: unquoted expressions (`fn()`, `process.env.X`, a whole `$VAR` / `${VAR}`), and unquoted colon-form values that are whitespace prose or a plain word or slug (shape check, as in the prose guard), except for strong keys. PASSWORD, PASSWD, PASSPHRASE, SECRET, PWD, and PRIVATE keys skip both checks. A key whose last part is PASS or CREDENTIAL(S) skips only the plain-word check. A bare `name:` is a grep prefix only when no space follows the colon. `envKeyRule: false` turns it off |
| PEM detector | Always on, category `PRIVATE_KEY`. Covers any `BEGIN ... PRIVATE KEY` block to END, or to the end of the text when truncated. A read starting mid-key is not detected. A key seen through Read or grep is stashed with its line prefixes |
| Registration | `userConfig` env var names + project file `.secret-stash.json` (`env`, `pass`). An unset variable, `pass-cli` failure, or value under 8 characters fails the whole load |
| Short values | Matches under 8 characters are not redacted, and vault values under 8 are not restored. Leftovers where an ID was cut out of a match are redacted at any length |
| Custom patterns | Safe subset only: literal prefix of 3+ characters, bounded quantifiers (max 512), at most one variable element, no top-level alternation, no backreferences, length 500 or less. A runaway regex cannot be interrupted |
| ID format | `__SS_<CATEGORY>_<first 16 hex of HMAC-SHA256(key, value)>__` |
| HMAC key | 32 random bytes per machine, kept in `$.store` (plaintext; lets a holder confirm guesses, not recover values) |
| Vault (id → value) | Session memory only (`$.state`); never written to disk |
| Redaction coverage | Every door, main and subagents, plus system prompt sections, context blocks, attachments |
| Restoration | Tool arguments (all tools, recursively) and streamed response text on screen |
| Restore exceptions | Fields that feed a model or peer keep IDs: `WebFetch.prompt`, `WebSearch.query`, `Agent.prompt` and `description`, `RemoteTrigger.body`, all of `SendMessage`, `SendFeedback`, `Artifact`, `ArtifactData`, `ArtifactComments`, and `mcp__claude_ai_*`. `WebFetch.url` is restored |
| `skipRestore` | Project file list of `{ tool, fields? }`, where `tool` is an exact name or a prefix ending in `*`. It adds to the defaults. A default cannot be narrowed |
| Invalid config | `prompt.submit` drops the prompt with the error until it's fixed. Other outbound content is replaced by the failure marker. Unknown keys, unknown pattern names, and a custom `projectFile` that does not exist are errors |
| Local transcript | Tool structured records and attachment payloads may stay raw on disk; only API requests must be clean |
| Stored transcript | Always redacted |
| Failure policy | Fail closed: a redaction that throws or overruns replaces the content with `[secret-stash: content withheld because redaction failed]`, shows the status line, and toasts once per failure kind |
| Verification | Unit tests, `claude plugin test`, `validate --strict`, live smoke that greps captured API request bodies |

## Runtime constraints (from the engine's types)

- `turn.step` pins the outgoing messages. The request body can't be rewritten there, so all redaction happens where content enters the conversation.
- A rewritten `turn.step` text chunk changes both the screen and the transcript record (`claude-code.d.ts:12355`). Restored response text must be redacted again at `session.append` (door `response`).
- `session.append` fires for every stored row, including subagent rows (`agentId`). A rewrite there is what the model and the transcript file read. Text blocks and `tool_result.content` are rewritable. `tool_use`, thinking, and media blocks are not.
- The screen may briefly show a row's pre-rewrite form. Prompts are the exception: `prompt.submit` rewrites them first.
- `prompt.section`, `prompt.context`, and `prompt.attachment` feed the request outside `session.append` and need their own hooks.
- `session.append` can't deny engine rows. Fail closed means the hook must catch its own error and rewrite the content.
- A hook that throws, overruns its 10 s budget, or answers the wrong shape is skipped, and the row passes through raw. try/catch covers only the throw. Every outbound hook registers `on(...).catch(handler)`, which returns the failure marker through `next` within the 1 s grace.
- `$.state` is readable by any plugin, and it is wiped on `/clear` and resume (confirmed by live spike). Stream-restored text is stored, then re-redacted by the response hook (confirmed by spike). Outbound hooks call `ensureLoaded(sessionId)` rather than relying on `session.start`.
- `digest` is async, so redaction awaits it. Restore needs no hashing.
- `crypto.subtle` exposes only `digest`, so HMAC is built by hand from SHA-256.
- Modules import only files inside the plugin. openredaction must be bundled into a vendored file.
- Module variables reset on reload. Session data lives in `$.state`.

## Architecture

```
            ┌──────────── outbound (redact) ─────────────┐
prompt.submit ─┐                                          │
session.append ├─► detect ─► id = HMAC ─► vault.put ─► replace ─► model
prompt.section │   (registered ∪ openredaction ∪ .env)
prompt.context │
prompt.attachment │
agent.spawn    │   also: session.send, session.compact,
tool.describe  ┘         model.complete / fork / classify
            ┌──────────── inbound (restore) ─────────────┐
turn.step text chunks ─► buffered id scan ─► vault.get ─► screen
tool.call input        ─► deep string walk ─► vault.get ─► tool runs
                          (skips restore-exception fields)
tool result            ─► session.append redacts again (same id)
```

The restored response row is redacted again by `session.append` (door `response`) before storage. This works because the vault is itself a detector. Any value it holds is matched literally, so a `.env` value echoed without its `KEY=` still maps back to its ID.

### Modules (`plugins/secret-stash/hooks/`)

| File | Responsibility |
| --- | --- |
| `register.ts` | Wires hooks; `.catch` fail-closed handlers; no logic |
| `detect.ts` | `detect(text) → Match[]`: masks existing IDs first, then merges vault literals, openredaction, `.env` matches; overlaps resolve longest-first, then by fixed source priority |
| `ids.ts` | `hmacSha256` over `digest`, `makeId(category, value)`, `ID_RE` |
| `vault.ts` | `$.state` access: `put(id, value)`, `get(id)`, `literals()`, `ensureLoaded(sessionId)`; minimum literal length 8 |
| `redact.ts` | `redactText`, `redactBlocks` (text + tool_result content), deterministic output |
| `restore.ts` | `restoreText`, `restoreDeep(input, skip)`, `StreamRestorer` (holds a bounded tail that may be a partial ID; flushes on a new block `index`, any non-text chunk, and in `finally`; spreads chunks to keep `ref`) |
| `config.ts` | Loads `userConfig` + `.secret-stash.json`, validates, builds openredaction options |
| `vendor/openredaction-lite.mjs` | esbuild bundle, `node:module` stubbed, `compromise` excluded |

`types/index.d.ts` declares `PluginState` for the vault.

### Configuration

`userConfig` (config menu):

- `envVars` — env var names to stash at session start, one name per entry
- `projectFile` — path of the project file, default `.secret-stash.json`

`.secret-stash.json` (repo root, names only, safe to commit):

```json
{
  "env": ["DATABASE_URL", "STRIPE_KEY"],
  "pass": ["pass://Work/stripe/api-key"],
  "openredaction": {
    "patterns": ["AWS_ACCESS_KEY", "GITHUB_TOKEN"],
    "categories": [],
    "preset": null,
    "whitelist": ["AKIAIOSFODNN7EXAMPLE"],
    "customPatterns": [{ "type": "INTERNAL_TOKEN", "regex": "itk_[A-Za-z0-9]{32}" }]
  },
  "envKeyRule": true
}
```

- Omitted `openredaction.patterns` falls back to the built-in credential list.
- Invalid config fails loudly at session start, with a toast and status line. Nothing silently falls back.
- `pass://` refs resolve through `pass-cli` via `$.process`. The values go to the vault only.

### Categories

`<CATEGORY>` is the openredaction type (`AWS_ACCESS_KEY`), `ENV` for the `.env` rule, or `REG` plus the env name for registered values (`REG_DATABASE_URL`). Characters outside `[A-Z0-9_]` become `_`, and the category is capped at 32 characters so the stream buffer stays bounded.

## Plan

Each slice ends with `claude plugin validate --strict plugins/secret-stash` passing.

### Slice 0 — spikes (blocks the rest)

1. **Stream rewrite.** Run `~/.claude/dev-mods/…/stash-spike` via `claude --plugin-dir`. Prompt the model to echo `STASHTEST`. Record whether the screen shows `REALVALUE`, and what `session.append` (door `response`) receives.
2. **openredaction bundle.** esbuild the lite entry into one ESM file with `node:module` stubbed. Load it from a mod, run `detect` on sample keys, and check it stays within the hook budget on a 200 KB tool result.
3. **userConfig field types.** Confirm which field types the manifest supports (string, boolean, sensitive).
4. **Request oracle.** Stand up a recording proxy on `ANTHROPIC_BASE_URL` that saves request bodies. Every later smoke test greps these for canary values, because a clean transcript doesn't prove clean requests.
5. **tool_use record.** Confirm that a `tool.call` input rewrite doesn't change the stored `tool_use` block. If it does, restored values would reach the next request.
6. **State across `/clear`.** Check whether `$.state` survives `/clear` and resume.

Exits:

- If (1) shows the restored value surviving into the stored row, the vault-literal re-redaction is broken. Fix it before slice 3.
- If (5) shows `tool_use` carrying real values, stop and redesign tool restore. It can't be scrubbed.
- If (2) fails, fall back to an in-repo rules module seeded from openredaction's credential regexes (MIT, attributed).

### Slice 1 — core, pure functions

`ids.ts`, `detect.ts` (without openredaction), `redact.ts`, `restore.ts` plus unit tests.

- Tests cover HMAC against RFC 4231 vectors, a stable ID across calls, overlapping matches, and redaction idempotence (redacting an ID is a no-op, even with a hex pattern active).
- A restored `.env` value in a response or tool result is re-redacted to the same ID.
- `StreamRestorer` is tested with an ID split at every offset, across a block boundary, and interrupted mid-stream.

### Slice 2 — detection sources and config

`config.ts`, the openredaction adapter, `.env` rule, registration (env, pass-cli), and the `vault.ts` + `$.state` contract.

- Tests cover the `.env` sensitive-key list, whitelist, custom patterns, invalid config errors, and missing env var errors.

### Slice 3 — outbound hooks

Hooks for `prompt.submit`, `session.append` (all doors), `prompt.section`, `prompt.context`, `prompt.attachment`, `tool.describe`, `agent.spawn`, `session.send`, `session.compact` (`instructions`), and `model.complete` / `fork` / `classify`, each with its `.catch` handler.

- `claude plugin test` covers a tool result with an AWS key stored redacted, a subagent row redacted, a thrown detector and an over-budget detector each yielding the failure marker, the same secret in two rows getting the same ID, and redaction after `/clear`.

### Slice 4 — inbound hooks

`tool.call` deep restore, skipping the restore-exception fields, and the `turn.step` stream restore.

- Tests cover a Bash command with an ID executing with the real value, `WebFetch.prompt` and `Agent` prompt keeping IDs, an unknown ID left verbatim, and a stream split mid-ID restored.

### Slice 5 — packaging, docs, smoke

- Add a `marketplace.json` entry and plugin README (scribe).
- Live smoke, through the slice 0 proxy, in a scratch repo with canary secrets. Cover `cat .env`, an `echo` of a key through Bash, a subagent, `/compact`, `/clear`, resume, WebFetch, and auto mode. Expect zero canary hits in captured request bodies. Check that the Bash output file got the real value.

## Workflow

- Develop in `plugins/secret-stash/`, run with `claude --plugin-dir plugins/secret-stash`. The dev-mods folder holds spikes only.
- Slice 0 is run by hand. Slices 1–4 each go to `coder`. Slice 5 docs go to `scribe`.
- Security-relevant, so `review` (not `quick-review`) runs on each slice's diff and on this plan before slice 1.

## Open risks

- **Cache churn.** Redaction output must be byte-stable per input, or `prompt.section` rewrites spend the prompt cache.
- **Hook budget.** openredaction on large tool results may exceed the per-hook time budget, which fails closed and loses the output. Slice 0.2 measures this.
- **Model mangling.** The model may alter an ID (case, underscores). Unknown IDs stay verbatim, and nothing guesses at near-matches.
- **Screen flash.** Non-prompt rows may flash raw on screen before `session.append` rewrites them. This is local display only, and the API never sees it.
- **Resume.** IDs in a resumed transcript restore only after the secret is registered or seen again in the new session.
- **Vault visibility.** Other plugins can read `$.state`. This is accepted for now. The fix would be encrypting values with a key from `$.store`.
- **Auto-mode classifier.** The classifier is active, but its requests never passed through `ANTHROPIC_BASE_URL`, so whether it sees restored tool input is UNCONFIRMED. It may run locally or call another endpoint.
- **WebFetch echo.** Confirmed: httpbin echoed the restored key into the summarizer request. `skipRestore` with `{ "tool": "WebFetch", "fields": ["url"] }` closes it.

## Smoke results

Live smoke through the recording proxy, in a scratch repo with canary secrets, grepping captured request bodies for canaries.

| # | Scenario | Hits | Notes |
| --- | --- | --- | --- |
| 1 | Bash `cat .env`, `cat config.json` | 0 | |
| 2 | Bash `echo <ID> > file` | 0 | File got the real value; stored `tool_use` kept the ID |
| 3 | Subagent reads `.env` | 0 | 3 before the Read-prefix fix |
| 3b | Main-session Read of `.env`, `config.json` | 0 | 2 before the Read-prefix fix |
| 4 | `/compact` | 0 | |
| 5 | `/clear`, read again | 0 | Same IDs before and after |
| 6 | `--resume` | 0 | Raw `toolUseResult` not re-sent |
| 7 | WebFetch with an ID in the URL | 4 | Accepted risk: summarizer request carries the echoed page |
| 8 | Auto mode, Bash with an ID | 0 observed | Classifier traffic not visible to the proxy |
| 9 | Canary typed in a prompt | 0 | |
| 10 | Invalid `.secret-stash.json` | 0 requests | Prompt dropped; error quotes no file text |

- **Confirmed:** IDs are identical across `/clear`. The plugin store holds only the HMAC key.
- **Latency:** none measurable.
- **Open:** the WebFetch echo leak and the auto-mode classifier (see Open risks).
- **Cosmetic:** the AWS key-name rule merges with the key, giving `AWS_SECRET_ACCESS___SS_…__`. The value is still redacted.
