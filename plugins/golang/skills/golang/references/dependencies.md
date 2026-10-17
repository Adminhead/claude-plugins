# Modules, dependencies and wiring

Read this when adding, updating or removing a module, editing `go.mod`, publishing a module version, or deciding how services get their dependencies.

## Modules

- Use existing project dependencies when they fit. Otherwise prefer the stdlib, for example `net/http` and `httptest`, `errors`, `log/slog`, `slices`/`maps`/`cmp`/`strings`, and `testing`.
- Add a module only for a capability the stdlib and current dependencies lack, after checking maintenance, license and version compatibility. Then run `go mod tidy`.
- Don't wrap a dependency just to anticipate replacing it.
- Commit `go.sum`. Track developer tools with `go get -tool` (Go 1.24+ `tool` directives) instead of a `tools.go` file.
- Update with `go get -u=patch ./...`, then `go mod tidy`, tests and `go vet`. Run `govulncheck ./...` before a release.
- `replace` directives apply only in the main module, so they don't reach consumers. Use `retract` to withdraw a bad release of your own module. A module at v2 or above needs the `/vN` suffix in its path.

## Dependency injection

Pass dependencies as constructor arguments and wire them in `main`. Don't use globals or `init` for services, and don't pass a container around.

| Size | Approach |
| --- | --- |
| Under about 10 services | Manual constructors in `main` |
| Large graph, compile-time checks wanted | `google/wire` (generates code; the repository is archived, so keep it only where the repo already uses it) |
| Large graph, runtime wiring accepted | `uber-go/dig` or `uber-go/fx` (an `fx` `OnStart` hook must not block) |

Point a new graph at manual wiring, or `dig`/`fx` if a framework is justified. Otherwise follow the repo's existing choice.
