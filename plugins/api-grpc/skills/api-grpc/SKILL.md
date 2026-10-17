---
name: api-grpc
description: Designs and reviews gRPC and protobuf contracts. Use when adding or changing .proto files or RPC methods, reviewing a proto diff for rollout safety, setting up buf lint and breaking checks, choosing streaming or error models, or exposing gRPC through Envoy, grpc-gateway or Connect.
---

# gRPC and protobuf contracts

A `.proto` file is a long-lived contract. Wire format, JSON names, generated client code, and runtime behavior each break independently, so judge every change on all four.

Not for Go server code (`golang`), REST contracts or version-sunset policy (`api-rest-design`), or retry and backoff policy (`api-idempotency`). Each named skill applies if installed.

## Decide whether gRPC belongs here

Run this gate first for a new surface, and skip it for a diff to an existing one.

- Keep gRPC for service-to-service traffic where you control both ends. Offer REST or transcoded JSON to consumers you don't control.
- Browsers can't speak gRPC framing, so any browser consumer needs Connect, gRPC-Web, or a transcoding gateway.
- Raw public gRPC fits when consumers are known SDK users or proto-fluent engineers, the workload is truly streaming, or measured performance needs it. Dual-publish an HTTP surface even then.
- A service built internal-first carries admin, debug, and reflection RPCs nobody reviewed for outside eyes. Audit the full method list and disable server reflection before opening the port.

## Set conventions (new APIs)

Adopt Google's AIPs rather than inventing house rules.

- One package per API, ending in a major version such as `acme.billing.v1` (AIP-215). The directory mirrors the package, and no file name carries a version (AIP-191).
- Expose the major version only. `v1` is stable, and `v1beta` or `v1alpha` are pre-stable channels. Never ship beta behavior in a `v1` package (AIP-185). A new major version does not import the previous one.
- Give each RPC its own `<Method>Request` and `<Method>Response` message. A shared or bare-scalar message turns every field change into a change to every RPC that uses it.
- Reserve the number (and usually the name) of every removed field. End every enum zero value in `_UNSPECIFIED`. Prefer well-known types such as `Timestamp` and `FieldMask`.
- Set per-language package options (`java_package` and friends) so generated code isn't named after the proto path.
- Model resources and standard methods first (AIP-121). Reach for custom methods only when no standard verb fits.

## Gate changes with buf

```bash
buf lint
buf breaking --against '.git#branch=main'
```

- Run both in CI on every pull request. `buf lint` uses the STANDARD category by default, which includes `PACKAGE_VERSION_SUFFIX`, `PACKAGE_DIRECTORY_MATCH`, `ENUM_ZERO_VALUE_SUFFIX`, and the `RPC_REQUEST_STANDARD_NAME` and `RPC_RESPONSE_STANDARD_NAME` pair.
- `buf breaking` defaults to the FILE category, the strictest. Keep it for a public surface, because generated imports break when a message moves between files. Loosen to PACKAGE, WIRE_JSON, or WIRE only on purpose, and say why.
- Buf's breaking rules do not read custom options, so a change to a `google.api.http` annotation can break the REST mapping while every proto check stays green. Snapshot the annotation-derived routes (verb, path, body) and diff them in CI, or contract-test the transcoded paths. Buf check plugins are the other route.
- A green buf run says the schema evolved safely, not that mixed versions work. Test old client against new server and new client against old server where both exist.
- To enforce unary-only, enable the `UNARY_RPC` lint category (rules `RPC_NO_CLIENT_STREAMING` and `RPC_NO_SERVER_STREAMING`).

If buf isn't in the repo, say so, compare descriptors with the project's own `protoc`, Gradle, or Bazel task, and don't claim a check passed that you didn't run.

## Review a proto diff

1. **Collect the envelope.** Get the old and new schema, which encodings are in use (binary, ProtoJSON, both), whether messages persist in databases, queues, or logs, whether clients outside the repo release on their own, and the rollout and rollback order. If any is unknown, state the assumption and lower your confidence.
2. **Inventory changes** by fully qualified symbol: fields (number, name, type, cardinality, presence, `oneof`), enums, services and methods (streaming mode included), and package or language options.
3. **Judge four dimensions** per symbol: binary wire, named formats (ProtoJSON, text, transcoded REST), source and generated API, and behavior (status codes, retry safety, deadlines, auth, resource bounds). Read `references/protobuf-compatibility.md` for field, enum, and `oneof` rules, and for the type-change table.
4. **Trace mixed versions.** Walk old writer to new reader, new writer to old reader, old reader that edits and reserializes a new message, rollback after new writers ran, and old persisted data read after migration.
5. **Report.** Lead with one verdict, then findings.

Verdicts:

| Verdict | Meaning |
| --- | --- |
| Compatible | Safe inside the stated envelope |
| Rollout-dependent | Parses, but is safe only with sequencing or value constraints (readers before writers, old field kept until rollback closes) |
| Breaking | Breaks wire, named-format, source, or behavior |
| Insufficient context | Old schema, encoding, consumers, or deployment unknown |

Per finding give severity, location, dimension, old contract to new contract, the concrete failing scenario, and the smallest safe fix or staged migration. Reserve blocker for tag reuse, unparsable data, or an unavoidable production break. Close with a compatibility matrix for the changed symbols and the tests that would settle remaining assumptions.

False positives to avoid: a new optional field is not breaking just because old clients ignore it, and a field that never shipped needs no reservation (ask for release history). A renamed field is not harmless when JSON, text format, reflection, or generated source consumes the name.

## Streaming

Expose unary RPCs by default and record every streaming method as a decision. Server streaming is the first choice for push or tail workloads. Client and bidirectional streaming force every external consumer to write restart and resume logic that a unary retry never needs.

- AIP-127 says bidirectional streaming RPCs carry no `google.api.http` annotation, so offer a non-streaming alternative for any consumer behind HTTP/1.1.
- Behind an L4 balancer all of a client's streams pin to one backend for the connection's life. Use L7 HTTP/2-aware balancing, and set client keepalive below the balancer's idle timeout.
- For a streaming method, define ordering, half-close, backpressure, message size caps, cancellation cleanup, auth lifetime, and resume or replay behavior.

## Errors, deadlines, retries

- Return `google.rpc.Status`. Per AIP-193, every error includes an `ErrorInfo` in `details`, and `message` is developer-facing English. Use the most specific canonical code. Mapping everything to `UNKNOWN` or `INTERNAL` flattens dashboards and breaks client retry logic.
- Clients set a deadline, because gRPC has none by default. Servers stop spawned work when the call is cancelled, and pass the remaining deadline downstream.
- gRPC has no default retry policy. A response header commits the RPC and ends retry attempts. Never retry a mutating RPC on `UNAVAILABLE` or `DEADLINE_EXCEEDED` without an idempotency key or server-side deduplication (`api-idempotency`, if installed). AIP-194 treats only `UNAVAILABLE` as retryable by default.
- Read `references/errors-and-gateways.md` before wiring errors through Envoy, grpc-gateway, or Connect. The HTTP status line there is lossy, and the gRPC project forbids servers from deriving HTTP status from its client-side table.

## Auth and exposure at a public edge

- Credentials ride as metadata, so require TLS. mTLS authenticates workloads and doesn't scale to developers you've never met, so authenticate apps and users with OAuth tokens (`Authorization: Bearer <token>` metadata, validated in an interceptor) and enforce scopes per method.
- API keys identify a consumer for quota. They don't authenticate a user.
- Over quota, return `RESOURCE_EXHAUSTED` with a `RetryInfo` detail.
- Add a new method to any per-path auth policy map in the same change. A new method outside the map is the usual route to an unauthenticated RPC.

## Report

State the verdict or design decisions, the buf commands you ran with their results, and which risks stayed unverified. Go server mechanics (interceptors, `status.Error`, context cancellation) belong to `golang`, if installed.

## Sources checked

Primary sources: buf.build/docs (breaking, lint rules), google.aip.dev (121, 127, 185, 191, 193, 194, 215), grpc.io guides (deadlines, retry), github.com/grpc/grpc `doc/http-grpc-status-mapping.md`, googleapis `google/rpc/status.proto`, and protobuf.dev (updating a message type, ProtoJSON). Buf defaults (STANDARD lint, FILE breaking, the UNARY_RPC category) rechecked at buf.build/docs in October 2026.

Adapted in part from `public-grpc-api-design` in [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) (MIT) and `protobuf-grpc-api-review` in [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT); see LICENSE at the plugin root.
