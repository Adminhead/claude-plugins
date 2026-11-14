# Targeting queries

A rule's `query` is either nikunjy/rules syntax or a JsonLogic string. Only attributes sent in the evaluation context are available; a missing attribute means the query does not match.

## nikunjy/rules

Operators are case-insensitive (`eq` or `EQ`). Logical: `and`, `or`, `not`, with parentheses.

| Operator | Meaning |
|---|---|
| `eq`, `==` | equals |
| `ne`, `!=` | not equals |
| `lt`, `<` | less than |
| `gt`, `>` | greater than |
| `le`, `<=` | less or equal |
| `ge`, `>=` | greater or equal |
| `co` | contains |
| `sw` | starts with |
| `ew` | ends with |
| `in` | in a list |
| `pr` | attribute present |
| `not` | negation |

Examples from the docs:

```
targetingKey eq "12345"
key eq "example@example.com"
anonymous ne true
admin eq true
beta eq "true"
user_segment eq "early_adopters"
version gt 0.4.0-beta.1
(key ew "@test.com") and (role eq "backend engineer") and (env eq "pro") and (company eq "go-feature-flag")
```

Unverified (verify against docs or the nikunjy/rules README):
- The `in` list literal syntax. It is not shown on the GOFF docs pages.
- Dot notation for nested attributes in queries. It is documented for `bucketingKey`, not for queries.

Quote strings. `admin eq true` compares a boolean; `beta eq "true"` compares a string. Match the type the caller sends.

## JsonLogic

Write the JSON expression as a string in `query`. It must evaluate to `true`.

```yaml
targeting:
  - query: '{ "==" : [ { "var" : "key" }, "example@example.com"] }'
    variation: enabled
  - query: '{"and": [{"endsWith": [{"var": "ids"}, "@test.com"]}, {"==": [{"var": "role"}, "backend engineer"]}]}'
    variation: enabled
```

## Context facts

- Reference the key as `targetingKey` in queries (older docs examples use `key`).
- The proxy's `evaluationContextEnrichment` can add attributes such as `env` (`env eq "prod"`).

Test a query with `go-feature-flag-cli evaluate` (flags-authoring.md), once with a context that should match and once with one that should not.
