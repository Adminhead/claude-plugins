# template.json validation rules

Read this when validating or reviewing a template.json. Parse the JSON first; on a parse error, report only the line, column and the smallest fix, then stop.

Locate the file at the given path, at `<dir>/.template.config/template.json`, or inside a given `.template.config` folder. If an absolute path fails, retry the user's relative path from the working directory before calling the file missing.

Check all eight categories. Verify schema-sensitive claims against the installed SDK (`dotnet new install` warnings, `--dry-run`) or the schema; don't infer a runtime failure from a field name alone.

## 1. Required and recommended fields

| Field | Severity if missing |
|---|---|
| `identity`, `name`, `shortName` | ERROR (empty counts as missing) |
| `sourceName` | WARNING: `--name` renames nothing |
| `author` | WARNING |
| `description`, `classifications`, `defaultName` | SUGGESTION |

## 2. Identity

- ERROR: contains spaces. Use dots or dashes (`Contoso.WebApi.CSharp`).
- WARNING: no `.` or `-` separator. Use reverse-DNS.

## 3. shortName

- ERROR: equals a `dotnet new` subcommand, case-insensitive. Read the live set from the `Commands:` section of `dotnet new --help`; on current SDKs it is `install`, `uninstall`, `update`, `list`, `search`, `details`, `create`. Top-level `dotnet` verbs (`build`, `run`, `test`, `publish`) do not conflict.
- WARNING: one character long.
- WARNING: already used by an installed template (`dotnet new list <shortName>`).
- `shortName` may be a string or an array; check every value.

## 4. Symbols

Every symbol: ERROR if `type` is missing.

`type: "parameter"`:

- WARNING: no `datatype` (defaults to `string`).
- SUGGESTION: no `description` (it feeds `dotnet new <shortName> --help`; custom parameters never appear in the global `dotnet new --help`).
- ERROR: `datatype` not one of `string`, `bool`, `choice`, `int` (or `integer`), `float`, `hex`, `text`.
- `choice`: ERROR if `choices` is missing, empty, or not an array of objects with a `choice` field; ERROR if `defaultValue` is not among the choices; WARNING if optional with no `defaultValue`.
- `bool`: ERROR if `defaultValue` is not `true`/`false`.
- `int`: ERROR if `defaultValue` is not an integer.
- WARNING: a parameter name is a prefix of another (`Auth` and `AuthMode`).

`type: "computed"`: ERROR if `value` is missing.

`type: "generated"`: ERROR if `generator` is missing or not one of `casing`, `coalesce`, `constant`, `port`, `guid`, `now`, `random`, `regex`, `regexMatch`, `switch`, `join`.

## 5. Sources

- WARNING: a modifier `condition` without parentheses around the expression (`IncludeTests` instead of `(IncludeTests)`).
- WARNING: a condition references a symbol that isn't defined.

## 6. Post-actions

- ERROR: missing `actionId`.
- WARNING: missing `description`.
- SUGGESTION: missing `manualInstructions`.
- ERROR: a restore action (`210D431B-A78B-4D2F-B762-4ED3E3EA9025`) carrying run-script fields such as `executable`; it uses `primaryOutputs` or `args.files`.

## 7. Constraints

- ERROR: missing `type`. WARNING: missing `args` (most types need them).
- `host`: ERROR if `args` is missing, not an array, or an entry lacks `hostname`/`hostName`. Valid IDs include `dotnetcli`, `dotnetcli-preview`, `vs`, `vs-mac`, `ide`; `dotnet-cli` is invalid. Optional `version` uses NuGet range syntax. ERROR on unrelated fields such as `pattern` or `value`.
- `sdk-version`: `args` is a version range string or an array.

## 8. Tags

- SUGGESTION: no `tags.language` (`"C#"`); it drives `dotnet new list --language`.
- SUGGESTION: no `tags.type` (`"project"`, `"item"`, `"solution"`).

## Report format

Verdict line, one of:

- `Not ready: N error(s), M warning(s)`
- `Publishable with N warning(s)`
- `Ready to publish: 0 errors, 0 warnings` (suggestions may remain)

Then one table, errors first, then warnings, then suggestions:

| Severity | Location | Issue | Fix |
|---|---|---|---|
| ERROR | `shortName` | `"list"` conflicts with a `dotnet new` subcommand | Rename, e.g. `"contoso-list"` |
| ERROR | `symbols.maxRetries.defaultValue` | `"abc"` is not a valid `int` | `"defaultValue": "3"` |
| WARNING | `sourceName` | missing, so `--name` renames nothing | `"sourceName": "Contoso.Library"` |

Every ERROR and WARNING has a concrete fix. Close with "N error(s), M warning(s), K suggestion(s)."

For malformed JSON the whole reply is two parts: `Not ready: JSON parse error at line N, column M: <message>.` and a snippet showing the exact corrected fragment. No findings table until it parses.
