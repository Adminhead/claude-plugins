# Go pitfalls

Read this when writing or reviewing Go that touches interfaces returning errors, maps, slices, loops with `defer`, numeric conversions, timers, or context values. Each item is a bug that compiles and often passes a quick test.

## Nil and zero values

- A nil pointer stored in an interface is not `== nil`, because the interface still holds the type. Return a literal `nil`, never a typed nil variable, from any function whose result is an interface (`error` included).
- Writing to a nil map panics. Reading from it, `len`, and `range` are safe. Initialize with `make` in the constructor, or lazily in the method that writes, when the zero value must be usable.

| Operation | nil map | nil slice | nil channel |
| --- | --- | --- | --- |
| Read or index | zero value | panics | blocks forever |
| Write | panics | panics (use `append`) | blocks forever |
| `len`, `cap` | 0 | 0 | 0 |
| `range` | no iterations | no iterations | blocks forever |

- Nil slices are idiomatic: `append`, `len`, and `range` all work. Don't preallocate an empty slice just to avoid nil. Convert at JSON boundaries, where a nil slice encodes as `null` and `[]string{}` encodes as `[]`, so API responses that promise an array need a non-nil value.
- A bare type assertion (`v := x.(T)`) panics on mismatch. Use `v, ok := x.(T)` or a type switch. On Go 1.25+, `reflect.TypeAssert[T](val)` replaces `val.Interface().(T)` without the allocation.
- Methods on a nil pointer receiver run. They panic only when they dereference. Say in the doc comment whether nil is valid.

## Slices and maps

- `append` writes into the shared backing array when capacity allows, so two slices can overwrite each other. Force a copy with the full slice expression `append(a[:len(a):len(a)], x)`, or `slices.Clone`.
- A small subslice of a large slice keeps the whole backing array alive. Copy out (`slices.Clone`, `bytes.Clone`) before storing it long term.
- Return a copy from exported getters that expose a slice or map field, and copy on the way in when the caller may mutate it later. `maps.Clone` and `slices.Clone` cover both.
- Maps never release bucket memory after deletes. For a map that grows large then drains, rebuild it.
- `make([]T, 0, n)` and `slices.Grow` avoid repeated growth when `n` is known. Don't preallocate on a guess.
- `bufio.Scanner` fails on tokens over 64 KiB by default (`scanner.Err()` reports it). Call `Buffer` to raise the limit, or use `bufio.Reader`.
- Map iteration order is random. Sort keys (`slices.Sorted(maps.Keys(m))`, Go 1.23+) wherever output must be stable.

## Loops and defer

- `defer` runs at function exit, not at the end of an iteration. A `defer f.Close()` in a loop holds every file open until return. Move the body into a function so each call has its own defer.
- Go 1.22+ gives each iteration its own loop variable when `go.mod` declares `go 1.22` or later. Older modules still share one variable, so closures and `&v` need a copy.
- `break` inside a `select` or `switch` exits only that statement. Use a labeled `break` or `return` to leave the surrounding `for`.

## Numbers

- Integer conversions truncate silently (`int32(int64Val)` wraps). Range-check before narrowing, and use `strconv.ParseInt(s, 10, 32)` with the right bit size instead of parsing 64 bits and casting.
- Integer division by zero panics. Float division yields `Inf` or `NaN`.
- Don't compare floats with `==` for computed values. Compare within a tolerance, or use integers (cents) or `math/big` for money.

## Time

- Compare `time.Time` with `Equal`, not `==`. `==` also compares location and the monotonic reading.
- `time.After` allocates a timer per call. With `go.mod` at `go 1.23` or later, unreferenced timers are garbage collected, so the old leak is gone, but a hot `select` loop still allocates. Reuse one `time.NewTimer` with `Reset` there. Below `go 1.23`, an unfired `time.After` stays alive until it fires.

## Context values

- Use an unexported named type for context keys (`type ctxKey struct{}` or `type ctxKey int`), never a bare `string`, so packages can't collide. Expose typed accessor functions instead of the key.
- Carry only request-scoped data (request ID, auth principal) in context values, not optional parameters.

## Receivers and copying

- Pick one receiver kind per type. If any method needs a pointer (mutation, a lock, a large struct), make all of them pointers. A mixed method set means a value in an interface may not satisfy it.
- Never copy a value that contains a `sync.Mutex`, `sync.WaitGroup`, or another `noCopy` type. `go vet` (`copylocks`) catches many copies. Pass and store pointers to such types.
- Add `var _ Iface = (*T)(nil)` where a type must satisfy an interface that no code in the package otherwise forces.
