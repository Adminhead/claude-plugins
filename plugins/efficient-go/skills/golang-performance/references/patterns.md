# Performance patterns

Read this after a profile has named the cost. Each pattern lists the signal that justifies it. Apply one, measure, and keep it only if the benchmark improves. These are the common fixes, not a checklist to apply up front.

## Allocations

Signal: `alloc_objects` or `allocs/op` is high, or `mallocgc` and GC work show up in the CPU profile.

- Give slices and maps their size when it is known: `make([]T, 0, n)`, `make(map[K]V, n)`, `slices.Grow`. Growth by `append` copies and allocates repeatedly.
- Build strings with `strings.Builder` (call `Grow` when you can estimate the size) instead of `+=` in a loop. Use `strconv` rather than `fmt` for simple conversions in hot paths.
- Reuse a buffer across iterations with `buf = buf[:0]` before an `append` refill.
- Converting a value to an interface allocates when the value escapes, and `fmt` functions do it for every argument. Use concrete types in hot paths.
- Return a package-level sentinel error where callers only compare it. `fmt.Errorf` allocates on every call.
- `sync.Pool` suits temporary objects reused across many goroutines, like buffers. The runtime may drop pooled items at any time, so never rely on one surviving. Reset the object before `Put`, and add a pool only when the profile shows the allocation matters, since it adds lifetime bugs.
- Leaks through retention: a small subslice keeps the whole backing array alive (copy it, or `slices.Clip`), and a substring keeps its parent string (`strings.Clone`). A map doesn't return memory after deletes. On Go 1.27, deleting a million entries left the heap unchanged until the map was rebuilt. Build a new map when a large one empties out for good.
- Struct field order affects padding. `fieldalignment` (from `golang.org/x/tools`) reports wasted bytes. Apply it by hand only where a large slice of the struct exists, since readability usually wins elsewhere.
- Fewer pointers means less GC scanning. Prefer `[]T` over `[]*T` and flat structs for large collections.

Confirm what escapes with [compiler-analysis.md](compiler-analysis.md).

## CPU

Signal: one function dominates flat CPU time.

- Fix the algorithm or data structure first. A map lookup instead of a slice scan, or removing a nested loop, beats any micro-tuning.
- Hoist work out of loops: compile regular expressions once at package level (`regexp.MustCompile`), parse templates once, and precompute lookup tables.
- Avoid `reflect` and repeated type switches in hot paths. Typed comparisons (`slices.Equal`, `bytes.Equal`, `maps.Equal`) are cheaper than `reflect.DeepEqual`.
- Keep hot data contiguous. Iterate a 2D array in row order, and prefer a slice of structs to a slice of pointers to structs.
- Counters updated by many goroutines on adjacent memory can falsely share a cache line. Pad them apart or shard them, and confirm with a benchmark using `-cpu=1,4,8`.
- In a hot loop, a log call costs even when its level is off if its arguments are built eagerly. Use `slog.LogAttrs` or check `Enabled` first.
- Don't use `panic` and `recover` for control flow. Return errors.

## Memory and GC

See [runtime-tuning.md](runtime-tuning.md) for `GOGC`, `GOMEMLIMIT`, and container behavior.

## I/O and network

Signal: goroutines wait on I/O, or latency is high with CPU low.

- Reuse one `http.Client` and its `Transport`. `DefaultMaxIdleConnsPerHost` is 2, so a service making many concurrent calls to one host should raise `Transport.MaxIdleConnsPerHost` to match its concurrency.
- Read each response body to EOF and close it, or the Transport may not reuse the connection. Set timeouts on the client and on servers.
- Stream rather than buffer: `json.NewDecoder(r)` or `io.Copy` instead of `io.ReadAll` for large payloads.
- Wrap file and socket writes that happen in small pieces with `bufio`.
- Batch round trips: multi-row inserts or `COPY` instead of row by row, and one request carrying many items where the API allows it.
- Collapse duplicate concurrent loads of the same key with `golang.org/x/sync/singleflight`, which prevents a cache stampede.
- Cap concurrency to what the downstream can take, rather than one goroutine per item.

## Caches

Add a cache only after a profile or trace shows repeated identical work, and define invalidation before writing it. A bounded cache with a clear eviction rule beats an unbounded map.
