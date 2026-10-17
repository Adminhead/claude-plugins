# Errors and gateways

Read when errors cross a transcoding edge (Envoy, grpc-gateway, Connect) or when you design the error contract for a public surface.

## Status model

`google.rpc.Status` has `code` (a `google.rpc.Code`), `message` (developer-facing, in English), and `details` (a list of `Any`). AIP-193 adds two rules: every error carries an `ErrorInfo` in `details`, and each detail type appears at most once. Put localized text in a `LocalizedMessage` detail, not in `message`.

Typical detail choices:

| Need | Detail |
| --- | --- |
| Stable machine-readable reason | `ErrorInfo` (reason, domain, metadata) |
| Field-level validation errors | `BadRequest` |
| Back-off hint, paired with `RESOURCE_EXHAUSTED` | `RetryInfo` |
| Docs link | `Help` |

Strip `DebugInfo` (stack traces, internal detail) before a response leaves the trust boundary. Cleaning `message` alone is not enough.

## Code choice

Use the most specific code: `INVALID_ARGUMENT` for input that is wrong whatever the state, `FAILED_PRECONDITION` for state that must change first, `OUT_OF_RANGE` for a valid-shaped value outside bounds, `ABORTED` for a transaction conflict worth retrying as a whole, `UNAVAILABLE` for transient failure, `RESOURCE_EXHAUSTED` for quota, `UNAUTHENTICATED` for missing or bad credentials, `PERMISSION_DENIED` for an authenticated caller who lacks permission. Changing an established code is a behavior change, so check client retry logic, metrics, and alerts first.

## Two traps

**Table direction.** The gRPC project's `http-grpc-status-mapping.md` says "Servers must not use this table to determine an HTTP status code to use; the mappings are neither symmetric nor 1-to-1." The table is for clients that receive an HTTP response with no `grpc-status`. A gateway that translates errors outward needs its own deliberate mapping, checked against the implementation in use.

**The HTTP line is lossy.** In grpc-gateway's `HTTPStatusFromCode`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, and `OUT_OF_RANGE` all map to 400, `ABORTED` and `ALREADY_EXISTS` to 409, and `CANCELLED` to 499. Tell consumers that the body's structured status is the source of truth.

## Per-gateway behavior

- **Envoy gRPC-JSON transcoder.** `convert_grpc_status: true` turns a gRPC error that arrived with no body into a JSON `google.rpc.Status`. It reads `grpc-status-details-bin` when present, and otherwise builds the status from `grpc-status` and `grpc-message`. The Envoy docs don't say how `Any` details are rendered. Assume the detail types must be known to the transcoder (check the descriptor set), and test one error with details end to end.
- **grpc-gateway.** `DefaultHTTPErrorHandler` marshals the `Status` proto, maps the code through `HTTPStatusFromCode`, and for `UNAUTHENTICATED` copies the status message into a `WWW-Authenticate` header, so keep that message free of internal detail. Override it with `runtime.WithErrorHandler` for a custom envelope, and `runtime.WithStreamErrorHandler` for streams.
- **Connect.** Errors serialize as JSON natively and the same server speaks Connect, gRPC, and gRPC-Web, so no proxy is needed for browsers.

Pick the edge by what the team already runs. Connect suits new surfaces that need browser reach without a proxy. The Envoy transcoder fits where Envoy is already the data plane. grpc-gateway fits an existing Go investment with a custom error handler.

## Sources

github.com/grpc/grpc `doc/http-grpc-status-mapping.md`; google.aip.dev/193 and /194; googleapis `google/rpc/status.proto`; Envoy `grpc_json_transcoder` v3 API reference; grpc-gateway `runtime/errors.go` and its customization docs.
