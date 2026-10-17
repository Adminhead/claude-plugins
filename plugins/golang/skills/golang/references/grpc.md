# Go gRPC

Read this when the code imports `google.golang.org/grpc`. Service and message design (proto layout, versioning, error model across services) belongs to `api-grpc` if installed. This file covers the Go server and client code.

Sources: <https://pkg.go.dev/google.golang.org/grpc>, <https://grpc.io/docs/languages/go/>.

## Server

- Return errors as `status.Error(codes.X, msg)` or `status.Errorf`. A plain `error` reaches the client as `codes.Unknown`, which gives it nothing to act on. Map domain errors to codes at the handler boundary, and log the internal cause server-side rather than putting it in the message.

| Code | Use for |
| --- | --- |
| `InvalidArgument` | Malformed or invalid input |
| `NotFound` / `AlreadyExists` | Missing or duplicate entity |
| `Unauthenticated` / `PermissionDenied` | No valid identity / identity lacks rights |
| `FailedPrecondition` | System state forbids the call |
| `ResourceExhausted` | Quota or rate limit |
| `Unavailable` | Transient, safe to retry |
| `DeadlineExceeded` | Timeout |
| `Internal` | A bug on the server |

- Embed `pb.UnimplementedXServer` in the implementation so adding an RPC to the proto doesn't break compilation.
- Register the standard health service (`google.golang.org/grpc/health` with `grpc_health_v1`) so Kubernetes probes can check readiness.
- Put logging, auth, metrics, and panic recovery in interceptors (`grpc.ChainUnaryInterceptor`, `grpc.ChainStreamInterceptor`). Keep business logic out of them.
- Shut down with `GracefulStop()`, and fall back to `Stop()` after a timeout so a stuck stream can't hang exit.
- Don't register server reflection in production. It lists the whole API surface.
- Use TLS or mTLS in production, because credentials travel in metadata.
- Check `ctx.Err()` in long handlers and stream loops so a client cancel stops the work.

## Client

- Create the connection with `grpc.NewClient` (grpc-go v1.63+). `Dial` and `DialContext` are deprecated. `NewClient` doesn't connect until first use and defaults to the `dns` resolver, where `Dial` used `passthrough`.
- Create one `ClientConn` per target and share it. It multiplexes RPCs and reconnects on its own. Close it at shutdown.
- Give every call a deadline with `context.WithTimeout`. Without one, a slow upstream pins the caller indefinitely.
- Retry only idempotent calls and only on `Unavailable`. Use the service-config retry policy or a single interceptor, not both.
- Send auth tokens and trace IDs as metadata (`metadata.AppendToOutgoingContext`), or with `credentials.PerRPCCredentials`.

## Testing

- Use `google.golang.org/grpc/test/bufconn` for an in-memory listener. It exercises serialization, interceptors, and metadata without opening a port.
- Assert the status code, not the message: `status.Code(err) == codes.NotFound`.
- Test the deadline path and the cancellation path with a short-lived context.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Returning `fmt.Errorf` from a handler | Return a `status` error with a code |
| New connection per request | Share one `ClientConn` |
| No call deadline | `context.WithTimeout` on every call |
| `Stop()` on SIGTERM | `GracefulStop()` with a timeout fallback |
| Not embedding `UnimplementedXServer` | Embed it |
| Reflection enabled in production | Register it only in dev builds |
