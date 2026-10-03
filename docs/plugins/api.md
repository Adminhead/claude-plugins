# api

Adds eight skills for designing and reviewing public APIs: REST contracts, idempotency and retries, webhooks, versioning and deprecation, gRPC, GraphQL, API keys, and OAuth providers. They produce designs, reviews, and written policies. None of them runs commands against a live service.

## What it adds

| Skill | Purpose |
| --- | --- |
| `api:rest-design` | Design and review REST/HTTP contracts: resource and method semantics, status codes, one RFC 9457 error envelope, pagination, rate-limit signaling, and a contract-first OpenAPI workflow with drift checks |
| `api:idempotency-retry` | Idempotency keys and safe retries, server and client side: per-account keys, payload-mismatch rejection, an atomic claim, in-flight and complete states, replay windows, full-jitter backoff, and retry budgets |
| `api:webhooks` | Provider side of outbound webhooks: event catalog, payloads, Standard Webhooks signing, at-least-once delivery, retry and dead-letter policy, SSRF defenses, and the delivery log and replay surface |
| `api:versioning` | Write a versioning and deprecation policy: breaking-change definition, scheme choice, notice windows, `Deprecation` and `Sunset` headers, enforcement at sunset, and governance |
| `api:grpc` | Design and review gRPC and protobuf contracts: AIP conventions, `buf lint` and `buf breaking` gates, compatibility review of `.proto` diffs, streaming, `google.rpc.Status` errors, and gateway traps |
| `api:graphql` | Design and review a public GraphQL schema: whether GraphQL fits, naming and nullability, Relay connections, typed error results, depth, breadth and cost ceilings, the federation boundary, and persisted queries |
| `api:keys` | Design the API-key system a platform issues: key format with prefix and checksum, hash-only storage, scopes, dual-key rotation, service-account ownership, and offboarding |
| `api:oauth-provider` | Design the OAuth 2.1 authorization-server side: grant and PKCE profile per RFC 9700, redirect matching, refresh rotation with reuse detection, scopes, consent, client registration, and discovery metadata |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

Each skill names its neighbors in its description and hands off to them. For example, `api:rest-design` routes deprecation questions to `api:versioning`, and `api:webhooks` routes consumer-side deduplication to `api:idempotency-retry`. Cross-references to skills in other plugins (`efficient-go:golang`, `efficient-auth:auth`, and similar) say "if installed" and are optional.

## Requirements

- No CLI is required to use the skills.
- Optional, used only when the repo already has them: Spectral or Redocly CLI for OpenAPI linting (`api:rest-design`), `buf` for protobuf checks (`api:grpc`), and `oasdiff` for breaking-change diffs (`api:versioning`). If `buf` is missing, `api:grpc` is told to say so and not claim a check passed.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install api@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/api
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/api
   ```
2. Start a fresh session. The skill list should show `api:rest-design`, `api:idempotency-retry`, `api:webhooks`, `api:versioning`, `api:grpc`, `api:graphql`, `api:keys`, and `api:oauth-provider`.

## Safety

The skills write designs, reviews, and policy documents. The rules that matter:

- `api:grpc` runs `buf lint` and `buf breaking` only when `buf` is in the repo. It reports which commands it ran and which risks stayed unverified.
- `api:versioning` offers candidate policies and drafts the document section by section. It confirms each section before writing the next and asks for approval of the whole document before calling it final.
- `api:rest-design` marks a finding Must-change only when it can cite a written rule. Otherwise the finding is an Improvement. On a shipped API it routes a behavior fix through `api:versioning` instead of demanding a silent in-place change.
- `api:keys` shows design and SQL for hash-only key storage. It applies to keys you issue, not to keys you consume from another vendor.
- The `api:idempotency-retry` verify gates (concurrency and crash tests) fire real requests at a state-changing endpoint. Point them at a test environment.

## Limits

- Design guidance, not code generation. Server code belongs to the language skills, for example `efficient-go:golang` or `efficient-auth:auth`, if installed.
- Standards move. `api:oauth-provider` records that OAuth 2.1 was still an Internet-Draft (revision 16) when it was checked, and `api:idempotency-retry` records that the `Idempotency-Key` header draft is expired. Recheck both before citing them.
- Notice windows, retry schedules, and similar numbers in the skills are common practice, not standards. Write your own commitment.
- Each skill's scope is narrow by design. `api:webhooks` does not cover receiving webhooks in your own app, and `api:keys` does not cover consuming another vendor's keys.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable api@adminhead` |
| Uninstall | `claude plugin uninstall api@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
