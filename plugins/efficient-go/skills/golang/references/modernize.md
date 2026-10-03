# Modernizing Go

Read this when asked to modernize Go, bump the `go` directive, or when a deprecation warning appears. The module's `go` line caps what you may use (see Orient in `SKILL.md`), so modernize only toward that version, and only in code you are already changing. A drive-by rewrite buries the real diff, so list other opportunities in your report instead.

Release notes are the source for the rows below: <https://go.dev/doc/go1.24> through <https://go.dev/doc/go1.27>.

## Superseded APIs

"Since" is the Go version in which the replacement became available. Use it only if the module's `go` directive allows it.

| Old | New | Since | Status |
| --- | --- | --- | --- |
| `math/rand` (and `rand.Seed`) | `math/rand/v2` | 1.22 | Older API still works |
| `runtime.SetFinalizer` | `runtime.AddCleanup` | 1.24 | Not deprecated. `AddCleanup` is preferred for new code |
| `runtime.GOROOT()` | `go env GOROOT` | 1.24 | Deprecated in 1.24 |
| `tools.go` blank imports | `tool` directive in `go.mod`, added with `go get -tool` | 1.24 | Older pattern still works |
| `x/crypto` `sha3`, `hkdf`, `pbkdf2` | `crypto/sha3`, `crypto/hkdf`, `crypto/pbkdf2` | 1.24 | New stdlib packages |
| `cipher.NewOFB`, `NewCFBEncrypter`, `NewCFBDecrypter` | an AEAD mode, or CTR with a MAC | 1.24 | Deprecated in 1.24 |
| `synctest.Run` (experiment API) | `synctest.Test` | 1.25 | `Run` exists only under `GOEXPERIMENT=synctest` in 1.25 and is removed in 1.26 |
| `httputil.ReverseProxy.Director` | `ReverseProxy.Rewrite` | 1.20 | `Director` deprecated in 1.26 |
| `rsa.EncryptPKCS1v15` | OAEP | 1.0 | Deprecated in 1.26 |
| `tls.Config.Rand` in tests | `testing/cryptotest.SetGlobalRandom` | 1.26 | `Config.Rand` deprecated in 1.27 |

## Language and library by version

| Go | Use |
| --- | --- |
| 1.21 | `min`, `max`, `clear`; `slices` and `maps` packages; `log/slog`; `sync.OnceFunc`, `OnceValue`; `context.WithoutCancel`, `AfterFunc` |
| 1.22 | Per-iteration loop variables (delete `v := v` copies); `for i := range n`; `cmp.Or`; `sql.Null[T]` |
| 1.23 | Range-over-func iterators; `slices.Collect`, `Sorted`, `maps.Keys` as iterators; unreferenced timers are collected |
| 1.24 | `testing.B.Loop`, `T.Context`, `T.Chdir`; `os.Root`; `strings.SplitSeq`, `Lines`, `FieldsSeq`; `omitzero` JSON tag; generic type aliases; `weak` package |
| 1.25 | `sync.WaitGroup.Go`; `testing/synctest.Test`; container-aware `GOMAXPROCS`; `reflect.TypeAssert` |
| 1.26 | `new(expr)` for pointer-to-value; `errors.AsType[T]`; `go fix` rewritten with many modernizers and `//go:fix inline` |
| 1.27 | Methods with their own type parameters; `strings.CutLast`; `encoding/json` backed by json/v2 |

## Tools

- `golangci-lint` has a `modernize` linter (from `golang.org/x/tools/go/analysis/passes/modernize`). Enable it only if the repo already runs golangci-lint, and let it list candidates before editing.
- `go fix ./...` applies its modernizer fixes. Run it on a clean tree and review the diff.
- On Go 1.27+, `go test` runs the `stdversion` vet check by default. It flags standard-library symbols newer than the `go` directive. Fix the code or raise the directive, but don't suppress it.

## Before raising the `go` directive to 1.27

- Remove or update `godebug` settings (a `godebug` line in `go.mod` or `//go:debug` comment) for keys that 1.27 removed: `asynctimerchan`, `tlsunsafeekm`, `tlsrsakex`, `tls3des`, `tls10server`, `x509keypairleaf`, and `gotypesalias`. Pinning a removed key to its old value fails the build.
- `encoding/json` is now backed by json/v2 with v1 semantics preserved (error text may differ). Only code migrated to `encoding/json/v2` gets strict UTF-8 and duplicate-name rejection.

## Order of work

1. Safety and correctness: remove loop-variable copies, replace `math/rand` and deprecated crypto, use `os.Root` for user paths, run `govulncheck`.
2. Readability: `min`/`max`, `range` over int, `slices`/`maps`, `any`, `cmp.Or`, `t.Context`, `b.Loop`, `WaitGroup.Go`.
3. Optional: iterators, `slog` migration, tool directives. Do these only when the task asks for them.

Verify with `go build ./...`, `go vet ./...`, and the tests after each batch, and keep each class of rewrite in its own commit.
