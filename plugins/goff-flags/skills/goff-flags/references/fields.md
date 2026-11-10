# Flag fields

Source: GO Feature Flag docs v1.58.1 plus the repo's JSON schema. Items marked "verify" are unconfirmed; check the docs or run `lint`.

## Flag-level fields

| Field | Required | Notes |
|---|---|---|
| `variations` | yes | Map `name: value`. Types: string, float, int, object, array, bool. All variations must share one type. The schema says at least 2 variations. Never change the type once in use. |
| `defaultRule` | yes | A rule (below) applied when no targeting rule matches. `query` is ignored here. |
| `targeting` | no | Array of rules, in order, first match wins. |
| `bucketingKey` | no | String. Context attribute used instead of `targetingKey` for hashing. Dots address nested attributes (`company.id`). |
| `trackEvents` | no | Bool, default `true`. `false` stops evaluation events being exported for this flag. |
| `disable` | no | Bool, default `false`. `true` disables the flag: the SDK default is served with reason `DISABLED`. |
| `version` | no | Free-form string, default `""`. You maintain it; shown in notifiers and exported events. |
| `metadata` | no | Free-form map (description, issue link). Returned in evaluation metadata. |
| `scheduledRollout` | no | Array of dated steps, see rollouts.md. |
| `experimentation` | no | `{start, end}`, both required. |

Do not generate: `prerequisite` (not in the docs or JSON schema), `converter` (in the schema, purpose undocumented).

## Rule fields (in `targeting[]` and `defaultRule`)

| Field | Notes |
|---|---|
| `query` | Mandatory in every `targeting` rule, ignored in `defaultRule`. See queries.md. |
| `name` | Optional. Needed to patch the rule from a `scheduledRollout`. Returned as `evaluatedRuleName`. |
| `variation` | Variation name to return. |
| `percentage` | Map `variationName: number`. Need not sum to 100 (10 and 50 means 10/60 and 50/60). Floats allowed (`10.59`). |
| `progressiveRollout` | `{initial: {variation, percentage, date}, end: {variation, percentage, date}}`. |
| `disable` | Turns one rule off. The docs table spells it `disabled`; the schema says `disable`. Use `disable` and confirm with `lint` (verify). |

At least one of `variation`, `percentage`, `progressiveRollout` is required. Precedence: `progressiveRollout` > `percentage` > `variation`.

## Scheduled rollout step keys

`date` plus any of: `variations`, `targeting`, `bucketingKey`, `defaultRule`, `experimentation`, `scheduledRollout`, `trackEvents`, `disable`, `version`, `metadata`. Step values override the existing ones. A step without `date` is skipped. A step does not trigger notifiers.

## Value type examples

```yaml
variationString: test
variationBool: true
variationInt: 1000
variationFloat: 1000.23
variationArray:
  - item1
  - item2
variationObj:
  item1: 123
  item2: this is a string
  item3: false
```

(Use one type per flag; this block only shows the syntax of each type.)

## Evaluation context

```json
{"targetingKey": "34c7f8ab-6d14-4aa6-a77f-effc6245da6f", "email": "mike@monster.inc", "device": "iPad"}
```

- `targetingKey` is mandatory: unique and stable (user id, session id).
- The key `gofeatureflag` is reserved:

| Field | Meaning |
|---|---|
| `gofeatureflag.currentDateTime` | RFC3339 value used as "now" by experimentation, progressive and scheduled rollouts. Use it to test them. |
| `gofeatureflag.flagList` | `[]string`. In bulk evaluation only these flags are evaluated; any other flag returns the default with `FLAG_NOT_FOUND`. |
| `gofeatureflag.exporterMetadata` | Map of string, number or bool added to exported events. |

- Server-side `evaluationContextEnrichment` is merged into every context and overrides same-named fields. It can add an `env` attribute usable in queries (`env eq "prod"`).

## Reasons and error codes

Reasons: `TARGETING_MATCH`, `TARGETING_MATCH_SPLIT`, `SPLIT`, `DISABLED`, `DEFAULT`, `STATIC`, `UNKNOWN`, `ERROR`, `OFFLINE`.

Error codes: `PROVIDER_NOT_READY`, `FLAG_NOT_FOUND`, `PARSE_ERROR`, `TYPE_MISMATCH`, `GENERAL`, `INVALID_CONTEXT`, `TARGETING_KEY_MISSING`, `FLAG_CONFIG`.

## Editor support

`.goff.yaml` files get autocomplete from a JSON schema on schemastore. A web editor is at https://editor.gofeatureflag.org.
