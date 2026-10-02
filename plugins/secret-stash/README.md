# secret-stash

Keeps secrets out of the Anthropic API. Each secret in content bound for the model is replaced with a stable identifier, and the real value comes back only where it gets used.

User docs: [docs/plugins/secret-stash.md](../../docs/plugins/secret-stash.md).

```
__SS_<CATEGORY>_<16 hex>__        e.g. __SS_AWS_ACCESS_KEY_3f9a1c07be52d4a8__
```

- **Outbound.** Prompts, stored rows (tool results, subagent rows), system prompt sections, context blocks, attachments, tool descriptions, and agent, send, compact and model calls are redacted before the API sees them.
- **Inbound.** IDs in tool arguments and in the streamed response are replaced with the real value, so commands run and the screen reads normally.
- **Transcript.** The stored transcript keeps the IDs.
- **ID stability.** The ID is the first 16 hex digits of HMAC-SHA256(machine key, value), so one secret gets one ID across rows and sessions.

## Install and enable

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install secret-stash@adminhead
```

To try it without installing: `claude --plugin-dir plugins/secret-stash`.

## Configuration

Two layers: plugin options (`userConfig`) and an optional project file.

### Plugin options

| Option | Default | Meaning |
| --- | --- | --- |
| `envVars` | none | Environment variable names to stash at session start. One name per entry, no commas. Names must match `[A-Za-z_][A-Za-z0-9_]*`. |
| `projectFile` | `.secret-stash.json` | Project config path. Relative paths resolve from the project root. A missing file is fine only for the default path. A custom path that does not exist is an error. |

### Project file `.secret-stash.json`

Names and patterns only, so it is safe to commit. Unknown keys are errors.

| Key | Default | Meaning |
| --- | --- | --- |
| `env` | `[]` | More environment variable names to register. Merged with `envVars`. |
| `pass` | `[]` | Proton Pass references, each `pass://vault/item/field` (read with `pass-cli item view`). Item-level refs are rejected. |
| `envKeyRule` | `true` | Turns the key-name rule on or off. |
| `skipRestore` | `[]` | Extra tool arguments to leave unrestored. See [Restoration](#where-restoration-happens). |
| `openredaction.patterns` | built-in credential list | Pattern names to run. Replaces the default list. Unknown names are errors. |
| `openredaction.categories` | `[]` | Library categories to add on top of `patterns`. |
| `openredaction.preset` | `null` | Library preset to add. One of `gdpr`, `hipaa`, `ccpa`, `healthcare`, `healthcare-provider`, `healthcare-research`, `finance`, `financial-services`, `education`, `transport-logistics`, `transportation`, `logistics`, `pci-dss`, `pci_dss`, `soc2`, `soc-2`. |
| `openredaction.whitelist` | `[]` | Exact values never to redact. Applies to openredaction and custom patterns, not to registered values or the key-name rule. A value that merely contains a listed string is still redacted. |
| `openredaction.customPatterns` | `[]` | `{ "type", "regex" }` entries. `type` becomes the ID category. See below. |

```json
{
  "env": ["DATABASE_URL", "STRIPE_KEY"],
  "pass": ["pass://Work/stripe/api-key"],
  "envKeyRule": true,
  "skipRestore": [
    { "tool": "mcp__acme_*" },
    { "tool": "Bash", "fields": ["description"] }
  ],
  "openredaction": {
    "patterns": ["AWS_ACCESS_KEY", "GITHUB_TOKEN"],
    "categories": [],
    "preset": null,
    "whitelist": ["AKIAIOSFODNN7EXAMPLE"],
    "customPatterns": [{ "type": "INTERNAL_TOKEN", "regex": "itk_[A-Za-z0-9]{32}" }]
  }
}
```

## Custom patterns

Custom patterns are JavaScript regex source strings, restricted to a safe subset. A detector runs synchronously over whole tool results, and a runaway regex cannot be interrupted, so the limits keep a mistake from freezing the session. They guard against errors, not a hostile author, and a static check cannot prove every pattern safe.

A pattern is accepted only if it:

1. is at most 500 characters and compiles;
2. starts with a literal prefix of at least 3 characters, after an optional `\b`;
3. uses only bounded quantifiers, `{n}` or `{n,m}` with max at most 512 (no `*`, `+`, `?`, or `{n,}`);
4. has at most one variable element, meaning one `{n,m}` with `m > n` or one alternation group, with every other quantifier fixed `{n}`;
5. has no top-level `|` (write one pattern per alternative);
6. has no backreference (`\1`, `\k<name>`);
7. does not repeat a group that holds a variable quantifier or an alternation.

| Pattern | Result |
| --- | --- |
| `itk_[A-Za-z0-9]{32}` | accepted |
| `\bghx_[A-Za-z0-9]{20,64}` | accepted |
| `acme-(live\|test)-[A-Za-z0-9]{24}` | accepted |
| `[A-Za-z0-9]{32}` | rejected, no literal prefix |
| `itk_[A-Za-z0-9]+` | rejected, unbounded quantifier |
| `itk_[A-Za-z0-9]{32,}` | rejected, no upper bound |
| `itk_[a-z]{1,64}[0-9]{1,64}` | rejected, two variable elements |
| `itk_[a-z]{32}\|key_[a-z]{32}` | rejected, top-level alternation |
| `itk_([a-z]{1,8}-){2}` | rejected, repeated group holds a variable quantifier |

Each rejection names the rule and the fix in the config error.

## What gets detected

All detectors run on every piece of text. Overlapping matches merge into one span, which takes the category of the longest match (ties go to registered, then vault, then key-name rule, then custom, then openredaction).

- **Registered values.** Values of `envVars`, `env`, and `pass` entries, resolved at session start. Category `REG_<name>`. A variable that is unset, a `pass-cli` failure, or a value under 8 characters fails the whole load, because a value left out would reach the model.
- **Stashed values.** Every value already stashed in the session is matched literally, so a secret echoed without its `KEY=` still maps to the same ID. Other occurrences of any detected value are swept too.
- **Key-name rule** (category `ENV`). Stashes the value, never the key, when the key has a part that ends with `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `PASSWD`, `PASSPHRASE`, `PASS`, `PWD`, `CREDENTIAL`, `AUTH`, `PRIVATE`, or `DSN` (a trailing `S` is ignored). Parts split on `_`, `-`, `.` and camelCase, so `apiKey`, `client_secrets`, `APIKEY` and `DBPASSWORD` match, while `keyboard` and `author` do not. Names like `MONKEY` match too. A key ending in `_URL` matches when its value has userinfo (`scheme://user:pw@host`), and the whole URL is stashed. Forms covered:
  - `.env` lines, with optional `export`
  - JSON `"key": "value"`, including minified
  - YAML `key: value`, list items (`- KEY=value`, as in compose `environment:`), and block scalars (`|`, `>`)
  - quoted assignments in code (`apiKey: "x"`, `api_key = 'x'`)
  - lines carrying tool-output prefixes, with indentation allowed after them: Read line numbers, `cat -n`, `grep` `path:line:`, and diff `+`/`-` signs

  A block scalar is stashed one line per secret, without prefixes or indentation, so each restores cleanly. A last body line under 8 characters stays visible.

  Skipped: unquoted values that are expressions (`fn(...)`, `process.env.X`, `os.environ[...]`, or a whole `$VAR` / `${VAR}`; a longer value starting with `$` is still stashed). An unquoted colon-form value is skipped when it contains whitespace (prose) or is a plain word or slug with no digit or symbol (`pass-cli:pass-cli`; a slug is a lowercase kebab or snake slug where every segment is letters only or at most 3 characters with a letter (`k8s`, `ec2`, `s3`) and at least two segments are plain words of 4+ letters (`k8s-manifest-generator`); `correct-horse-7-staple`, `battery7` and `ab1c` are not slugs). Strong keys: a part ending in `PASSWORD`, `PASSWD`, `PASSPHRASE`, `SECRET`, `PWD`, or `PRIVATE` skips neither check. A last part of `PASS` or `CREDENTIAL(S)` (`smtp_pass`, `aws_credentials`) skips only the plain-word check, so whitespace prose (`Pass: 12, Fail: 0`, `Credentials: stored in 1Password`) is still skipped. `KEY=value` and quoted values are never skipped. Accepted gaps: a letters-only or plain-slug value under a non-strong colon key (`token:`, `api_key:`, `auth:`, `apiKey:`), such as `token: correct-horse-battery-staple`, `auth_token: abcd-efgh-ijkl-mnop` or a single-case 20+ letter run, is not stashed (the `=` and quoted forms are). A bare `name:` is a grep prefix only when no space follows the colon (`Makefile:API_KEY=x` is read, `api.key: v=` keeps its full value), so a grep line with a space after the colon (`Procfile:  token: x`) reads the file name as the key and is missed.
- **PEM private keys** (category `PRIVATE_KEY`, always on). Any `BEGIN ... PRIVATE KEY` block, encrypted keys included, from the BEGIN line to the END line, or to the end of the text when the END is missing (a truncated read). Limits: a read that starts mid-key and shows only body lines cannot be detected. A key seen through Read or grep is stashed with its line-number prefixes, so restoring that ID into a file write would include them.
- **openredaction credential patterns** (pinned 1.1.5, `lite` build). By default: `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AZURE_STORAGE_KEY`, `BEARER_TOKEN`, `FIREBASE_API_KEY`, `GENERIC_API_KEY`, `GENERIC_SECRET`, `GITHUB_TOKEN`, `GOOGLE_API_KEY`, `HEROKU_API_KEY`, `JWT_TOKEN`, `KUBERNETES_SECRET`, `MAILGUN_API_KEY`, `NPM_TOKEN`, `OAUTH_CLIENT_SECRET`, `OAUTH_TOKEN`, `OPENAI_API_KEY`, `PRIVATE_KEY`, `PYPI_TOKEN`, `SENDGRID_API_KEY`, `SLACK_TOKEN`, `SSH_PRIVATE_KEY`, `STRIPE_API_KEY`, `TWILIO_API_KEY`, and `ANTHROPIC_API_KEY` (added here: `sk-ant-...`). Setting `patterns` replaces this list.
- **Minimum length 8.** A match under 8 characters is not redacted. When an existing ID is cut out of a longer match, the leftover pieces are redacted at any length.

## Where restoration happens

Real values return in two places: tool arguments (`tool.call`, every string, recursively) and streamed response text. Unknown IDs stay as written. Values under 8 characters are never restored, so their IDs stay.

Some tool fields feed a model or another party and keep their IDs:

| Tool | Fields left unrestored |
| --- | --- |
| `WebFetch` | `prompt` |
| `WebSearch` | `query` |
| `Agent` | `prompt`, `description` |
| `SendMessage`, `SendFeedback` | all |
| `RemoteTrigger` | `body` |
| `Artifact`, `ArtifactData`, `ArtifactComments` | all |
| `mcp__claude_ai_*` | all |

`skipRestore` adds entries. Each is `{ "tool": "<name>" }`, or `{ "tool": "<name>", "fields": ["a", "b"] }` for top-level fields only. A `tool` is an exact name or a prefix ending in one `*` (`mcp__acme_*`). Omit `fields` to skip every field. Entries only add: matching rules combine, and a default cannot be narrowed.

## Failure behaviour

Redaction fails closed. If a detector throws, overruns its limits, or the hook runs out of time, the content is replaced with:

```
[secret-stash: content withheld because redaction failed]
```

| Situation | Result |
| --- | --- |
| Invalid config (bad JSON, unknown key, rejected pattern, missing registered variable, short registered value) | Prompts are dropped with the error text. Other outbound content is replaced by the marker. Nothing falls back silently. |
| Restore fails in `tool.call` | The call is denied: `secret-stash: restore failed`. |
| Agent spawn, send, and model calls | Denied or not delivered, with the marker as the reason. |

The status line shows the latest failure until a redaction succeeds. A toast appears once per failure kind per process. A text document that holds a secret cannot be rewritten, so it is dropped, with a toast. Messages carry paths and rule names, never values.

## Limits and known risks

- Images are not scanned.
- Encoded secrets (base64, URL-escaped) are not caught. Only literal occurrences are.
- The local transcript keeps raw tool output in structured records (`toolUseResult`). It is never re-sent.
- `@`-mentioned attachment payloads are stored raw locally.
- The `WebFetch` URL is restored, and the leak is confirmed in a live test: httpbin echoed the restored key into the summarizer request, which no hook covers. To close it, add `{ "tool": "WebFetch", "fields": ["url"] }` to `skipRestore`. The fetch then uses the ID, not the real value.
- Values are restored into every tool not on the skip list. The permission prompt is the only guard against a model sending a restored value elsewhere.
- `$.state` holds the stash and is readable by other plugins. It is wiped on `/clear` and resume.
- Stashed values are lost on `/clear` and resume, except registered values, which are resolved again. IDs stay the same across `/clear` because the HMAC key is per machine. The key is the only thing in the plugin store, a plaintext JSON file at `~/.claude/plugins/store/secret-stash_*.json`. The key lets a holder confirm a guessed value, not recover one.
- Values under 8 characters show as IDs and are not restored.
- Auto mode: the classifier is active (it denied a command in the smoke test), but its requests never passed through `ANTHROPIC_BASE_URL`. Whether it sees restored tool input is UNCONFIRMED, because it may run locally or call another endpoint. If you need certainty, do not combine auto mode with secrets in tool arguments.

## Development

| Task | Command |
| --- | --- |
| Run tests | `claude plugin test plugins/secret-stash` |
| Validate | `claude plugin validate --strict plugins/secret-stash` |
| Rebuild the vendored library | `plugins/secret-stash/scripts/build-vendor.sh` |

`hooks/vendor/openredaction-lite.mjs` is `@openredaction/core` 1.1.5 (MIT) bundled with esbuild, with Node imports stubbed. Do not edit it by hand.
