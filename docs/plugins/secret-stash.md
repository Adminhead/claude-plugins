# secret-stash

Keeps secrets out of Anthropic API requests. Each secret in content bound for the model is replaced with a stable identifier. The real value comes back only where it is used: in tool arguments and in on-screen text.

```
__SS_<CATEGORY>_<16 hex>__        e.g. __SS_AWS_ACCESS_KEY_0123456789abcdef__
```

## How it works

| Direction | What happens |
| --- | --- |
| Outbound | Prompts, stored rows (tool results, subagent rows), system prompt sections, context blocks, attachments, tool descriptions, and agent, send, compact, and model calls are redacted before the API sees them. |
| Inbound | IDs in tool arguments and in the streamed response are replaced with the real value, so commands run and the screen reads normally. |
| Transcript | The stored transcript keeps the IDs. |
| ID stability | The ID is the first 16 hex digits of HMAC-SHA256(machine key, value). One secret gets one ID across rows, sessions, and `/clear`. |

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install secret-stash@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/secret-stash
```

With no configuration, the plugin already detects secrets by pattern and by key name. Register named variables to cover values that have no recognizable shape.

## Configuration

Two layers: plugin options and an optional project file.

### Plugin options

View and set them with `claude plugin configure secret-stash`.

| Option | Default | Meaning |
| --- | --- | --- |
| `envVars` | none | Environment variable names to stash at session start. One name per entry. Names must match `[A-Za-z_][A-Za-z0-9_]*`. |
| `projectFile` | `.secret-stash.json` | Project config path. A relative path resolves from the project root. A missing file is fine only for the default path. A custom path that does not exist is an error. |

### Project file

`.secret-stash.json` holds names and patterns only, so it is safe to commit. Unknown keys are errors.

| Key | Default | Meaning |
| --- | --- | --- |
| `env` | `[]` | More environment variable names to register. Merged with `envVars`. |
| `pass` | `[]` | Proton Pass references, each `pass://<vault>/<item>/<field>`, read with `pass-cli item view`. Item-level references are rejected. |
| `envKeyRule` | `true` | Turns the key-name rule on or off. |
| `skipRestore` | `[]` | Extra tool arguments to leave unrestored. See [Restoration](#restoration). |
| `openredaction.patterns` | credential list | Pattern names to run. Replaces the default list. Unknown names are errors. |
| `openredaction.categories` | `[]` | Library categories to add on top of `patterns`. Unknown names are errors. |
| `openredaction.preset` | `null` | Library preset to add. One of `gdpr`, `hipaa`, `ccpa`, `healthcare`, `healthcare-provider`, `healthcare-research`, `finance`, `financial-services`, `education`, `transport-logistics`, `transportation`, `logistics`, `pci-dss`, `pci_dss`, `soc2`, `soc-2`. |
| `openredaction.whitelist` | `[]` | Exact values never to redact. Applies to openredaction and custom patterns. It does not apply to registered values, stashed values, PEM keys, or the key-name rule. A value that only contains a listed string is still redacted. |
| `openredaction.customPatterns` | `[]` | `{ "type", "regex" }` entries. `type` becomes the ID category. See [Custom patterns](#custom-patterns). |

```json
{
  "env": ["DATABASE_URL", "STRIPE_KEY"],
  "pass": ["pass://Work/db/password"],
  "envKeyRule": true,
  "skipRestore": [
    { "tool": "mcp__acme_*" },
    { "tool": "Bash", "fields": ["description"] }
  ],
  "openredaction": {
    "patterns": ["AWS_ACCESS_KEY", "GITHUB_TOKEN"],
    "categories": [],
    "preset": null,
    "whitelist": ["not-a-real-secret-value"],
    "customPatterns": [{ "type": "INTERNAL_TOKEN", "regex": "itk_[A-Za-z0-9]{32}" }]
  }
}
```

## Detection

Every detector runs on every piece of text. Overlapping matches merge into one span, which takes the category of the longest match. Ties go to registered values, then stashed values, then the key-name rule, then custom patterns, then openredaction.

| Detector | Category | Covers |
| --- | --- | --- |
| Registered values | `REG_<name>` | Values of `envVars`, `env`, and `pass` entries, resolved at session start. For `pass`, `<name>` is the last path segment. |
| Stashed values | as first found | Every value already stashed in the session, matched literally. A secret echoed without its `KEY=` still gets the same ID. Other occurrences of any detected value are swept too. |
| Key-name rule | `ENV` | The value (never the key) of a sensitive-looking key. See below. |
| PEM private keys | `PRIVATE_KEY` | Any `BEGIN ... PRIVATE KEY` block, encrypted keys included. Always on. |
| openredaction patterns | pattern name | Credential patterns from `@openredaction/core` 1.1.5 (`lite` build, vendored). |
| Custom patterns | your `type` | `openredaction.customPatterns`. |

The minimum length is 8. A match under 8 characters is not redacted. When an existing ID is cut out of a longer match, the leftover pieces are redacted at any length.

### Registered values

A load fails as a whole, with all errors listed, when any of these hold:

- A variable is unset.
- `pass-cli` exits non-zero.
- A value is under 8 characters.

A value left out would reach the model, so the plugin does not skip it.

### Key-name rule

The rule fires when a part of the key ends with one of `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `PASSWD`, `PASSPHRASE`, `PASS`, `PWD`, `CREDENTIAL`, `AUTH`, `PRIVATE`, or `DSN`. A trailing `S` is ignored. Keys split into parts on `_`, `-`, `.`, and camelCase.

- Matches: `apiKey`, `client_secrets`, `APIKEY`, `DBPASSWORD`, and `MONKEY` (over-redacted on purpose).
- No match: `keyboard`, `author`.
- A key ending in `_URL` matches when its value has userinfo (`scheme://user:pw@host`). The whole URL is stashed.

Forms covered:

- `.env` lines, with optional `export`
- JSON `"key": "value"`, including minified
- YAML `key: value`, list items (`- KEY=value`), and block scalars (`|`, `>`)
- Quoted assignments in code (`apiKey: "x"`, `api_key = 'x'`)
- Lines with tool-output prefixes: Read line numbers, `cat -n`, `grep` `path:line:`, and diff `+`/`-` signs

Details:

- A block scalar is stashed one line per secret, without prefixes or indentation, so each restores cleanly. A last body line under 8 characters stays visible.
- Skipped: unquoted values that are expressions (`fn(...)`, `process.env.X`, `os.environ[...]`, a whole `$VAR` or `${VAR}`). A longer value starting with `$` is still stashed.
- Skipped: an unquoted colon-form value that contains whitespace is treated as prose. The exception is a key with a part ending in `PASSWORD`, `PASSWD`, `PASSPHRASE`, `SECRET`, `PWD`, or `PRIVATE`. `KEY=value` is never skipped as prose.

### PEM private keys

- The span runs from the BEGIN line to the END line, or to the end of the text when END is missing (a truncated read).
- A read that starts mid-key and shows only body lines is not detected.
- A key seen through Read or `grep` is stashed with its line-number prefixes. Restoring that ID into a file write includes them.

### openredaction patterns

Default list:

```
AWS_ACCESS_KEY, AWS_SECRET_KEY, AZURE_STORAGE_KEY, BEARER_TOKEN, FIREBASE_API_KEY,
GENERIC_API_KEY, GENERIC_SECRET, GITHUB_TOKEN, GOOGLE_API_KEY, HEROKU_API_KEY,
JWT_TOKEN, KUBERNETES_SECRET, MAILGUN_API_KEY, NPM_TOKEN, OAUTH_CLIENT_SECRET,
OAUTH_TOKEN, OPENAI_API_KEY, PRIVATE_KEY, PYPI_TOKEN, SENDGRID_API_KEY,
SLACK_TOKEN, SSH_PRIVATE_KEY, STRIPE_API_KEY, TWILIO_API_KEY, ANTHROPIC_API_KEY
```

- `ANTHROPIC_API_KEY` is added by this plugin and matches `sk-ant-...`. It is not in the library.
- Setting `patterns` replaces this list. `categories` and `preset` add to whichever list is in effect.
- `GENERIC_SECRET`, `GENERIC_API_KEY`, `OAUTH_CLIENT_SECRET`, `OAUTH_TOKEN`, and `BEARER_TOKEN` take the word after a keyword. When whitespace or `:` separates keyword and value (`secret management`, `failed to load secret: denied`), this plugin also requires the value to look like a secret. `key: value` lines are still caught by the key-name rule. When the separator holds `=` (`--password=value`), the library match stands unchanged.
- The prose check passes a value with a digit or a symbol. `-`, `_`, and `.` do not count as symbols. A letters-only value of 20 or more characters passes only if it mixes upper and lower case. Call syntax (`x()`) and `](` are rejected. So `secret management`, `password managers`, and `secret [x](x.md)` are left alone.
- Accepted gaps. A short letters-only passphrase after whitespace is missed (the key-name rule still catches it behind a key such as `DB_PASSWORD=`). A lowercase letters-only bearer token (`Bearer abcdefghijklmnopqrstuvwxyz`) is missed. A prose word that has a digit or symbol, such as `utf8mb4_bin` after "password", is still stashed.
- `AWS_SECRET_KEY` must be 40 characters with at least two of lowercase, uppercase, and digit, and must not be a run of lowercase path segments (`a/b/c`) or 40 hex digits (a git SHA-1). The character before it must not be a letter, digit, `+` or `/`, and the one after must not be a letter, digit, `+`, `/` or `=`, so a slice of a longer hash or path does not match. A word such as `aws`, `amazon`, `secret`, or `access key` must appear within 50 characters, before or after the value, on any line. This covers CSV headers, YAML values on the next line, and trailing comments.

## Custom patterns

Custom patterns are JavaScript regex source strings, restricted to a safe subset. A detector runs synchronously over whole tool results, and a runaway regex cannot be interrupted. The limits keep a mistake from freezing the session. They guard against errors, not a hostile author, and a static check cannot prove every pattern safe.

A pattern is accepted only if it:

1. is at most 500 characters and compiles;
2. starts with a literal prefix of at least 3 characters, after an optional `\b`;
3. uses only bounded quantifiers, `{n}` or `{n,m}` with `m` at most 512 (no `*`, `+`, `?`, or `{n,}`);
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

## Restoration

Real values return in two places:

- Tool arguments (`tool.call`): every string, recursively.
- Streamed response text.

Unknown IDs stay as written. Values under 8 characters are never restored, so their IDs stay.

Some tool fields feed a model or another party. These keep their IDs:

| Tool | Fields left unrestored |
| --- | --- |
| `WebFetch` | `prompt` |
| `WebSearch` | `query` |
| `Agent` | `prompt`, `description` |
| `SendMessage`, `SendFeedback` | all |
| `RemoteTrigger` | `body` |
| `Artifact`, `ArtifactData`, `ArtifactComments` | all |
| `mcp__claude_ai_*` | all |

`skipRestore` adds entries:

- Each entry is `{ "tool": "<name>" }`, or `{ "tool": "<name>", "fields": ["a", "b"] }` for top-level fields only.
- `tool` is an exact name or a prefix ending in one `*` (`mcp__acme_*`).
- Omit `fields` to skip every field. An empty `fields` list is an error.
- Entries only add. Matching rules combine, and a default cannot be narrowed.

## Failure behavior

Redaction fails closed. If a detector throws, overruns its limits, or the hook runs out of time, the content is replaced with:

```
[secret-stash: content withheld because redaction failed]
```

| Situation | Result |
| --- | --- |
| Invalid config (bad JSON, unknown key, rejected pattern, missing registered variable, short registered value) | Prompts are dropped with the error text. Other outbound content is replaced by the marker. Nothing falls back silently. |
| Restore fails in `tool.call` | The call is denied: `secret-stash: restore failed`. |
| Agent spawn, send, compact, and model calls | Denied, skipped, or not delivered, with the marker as the reason. |
| A document block holds a secret | The document is dropped, since a text document cannot be rewritten. A toast says so. |

- The status line shows the latest failure until a redaction succeeds.
- A toast appears once per failure kind per process.
- Messages carry paths and rule names, never values.

## Verify

1. Put a secret in a file, such as `DB_PASSWORD=<a value of 8 or more characters>` in a `.env`.
2. Start a session and ask Claude to read the file.
3. Search the session transcript under `~/.claude/projects/` for `__SS_`. The ID should appear, and the value should not.

```
claude plugin validate --strict plugins/secret-stash
```

Validation checks the manifest and hooks only. It does not exercise redaction.

To check a config, start a session. A bad `.secret-stash.json` shows its error in the status line and in a toast, and drops your next prompt.

## Limits

- Images are not scanned.
- Encoded secrets (base64, URL-escaped) are not caught. Only literal occurrences are.
- The local transcript keeps raw tool output in structured records (`toolUseResult`). It is never re-sent.
- `@`-mentioned attachment payloads are stored raw locally.
- `WebFetch` restores the URL, and a page that echoes it hands the real value to the summarizer request, which no hook covers. This was confirmed in a live test with httpbin. To close it, add `{ "tool": "WebFetch", "fields": ["url"] }` to `skipRestore`. The fetch then uses the ID, not the real value.
- Values are restored into every tool not on the skip list. The permission prompt is the only guard against Claude sending a restored value elsewhere.
- `$.state` holds the stash and is readable by other plugins. It is wiped on `/clear` and resume.
- Stashed values are lost on `/clear` and resume. Registered values are resolved again. IDs stay the same, because the HMAC key is per machine and kept in the plugin store, a plaintext JSON file at `~/.claude/plugins/store/secret-stash_*.json`. The key lets a holder confirm a guessed value, not recover one.
- Values under 8 characters show as IDs and are not restored.
- Auto mode: the classifier is active, but its requests never passed through `ANTHROPIC_BASE_URL`. Whether it sees restored tool input is UNCONFIRMED. For certainty, do not combine auto mode with secrets in tool arguments.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable secret-stash@adminhead` |
| Uninstall | `claude plugin uninstall secret-stash@adminhead` |

- Uninstalling stops redaction and restoration. Transcripts written while the plugin was active keep their IDs.
