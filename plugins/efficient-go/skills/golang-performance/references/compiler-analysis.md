# Compiler analysis

Read this when a profile shows allocations or a hot call you didn't expect, and you need to know what the compiler decided. These flags cost nothing at runtime. Apply them to the package the profile pointed at, not the whole module, or the output is unreadable.

## Escape analysis

```sh
go build -gcflags='-m' ./pkg/parser 2>&1 | rg 'escapes to heap|moved to heap'
go build -gcflags='-m -m' ./pkg/parser 2>&1 | rg -A6 'Parse'    # adds the reason chain
```

`moved to heap: x` or `x escapes to heap` means the value is heap-allocated and adds GC work. `does not escape` means it stays on the stack. Typical causes:

- Returning a pointer to a local, or storing one in something that outlives the call.
- Converting a concrete value to an interface (`any`), including arguments to `fmt.Sprintf` and `slog` calls.
- A closure that captures a variable and runs later (`go func() {...}()`).
- `append` past capacity, which allocates a new backing array.
- Sending a pointer on a channel.
- Passing a pointer to a function the compiler can't see into, such as an interface method call.

Only chase escapes in functions the allocation profile names. A call that happens once at startup can escape freely. A confirmed fix shows up as fewer `allocs/op` in the benchmark.

## Inlining

```sh
go build -gcflags='-m -m' ./pkg/parser 2>&1 | rg 'inline'
```

Lines read `can inline F`, `inlining call to F`, or `cannot inline F: function too complex: cost 117 exceeds budget 80`. The budget and the reasons are Go-version specific, so read them from your toolchain's output instead of memorizing them. In Go 1.27 a function containing `defer` is reported as `cannot inline ...: unhandled op DEFER`. Inlining matters for tiny functions in hot loops, because it removes call cost and can let a value stay on the stack. If a hot function is not inlined, split the cold path into its own function or remove constructs the report names. Confirm the effect with a benchmark, not the report alone.

## Assembly and SSA

Reach for these only to check a specific claim, such as a surviving bounds check.

```sh
go build -gcflags='-S' ./pkg/parser 2>&1 | less
go tool objdump -s 'Parse' ./bin/app
GOSSAFUNC=Parse go build ./pkg/parser     # writes ssa.html
```

## Profile-guided optimization

Go builds with `default.pgo` in the main package directory by default (`-pgo=auto`, since Go 1.21). Use a CPU profile from representative production load, not a microbenchmark. The Go docs report gains of 2 to 14% as of Go 1.22, at the price of longer builds and somewhat larger binaries. Commit `default.pgo` for reproducible builds, refresh it as the code changes, and merge several profiles with `go tool pprof -proto a.pprof b.pprof > merged.pprof`. Measure before and after like any other change. See https://go.dev/doc/pgo.
