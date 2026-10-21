# Java review checklist

Read the diff or class for intent first, then check each category, then report by severity. Cite file and line for every finding and include the fix.

## Output shape

```markdown
## Review: <file or feature>

### Critical
- <defect, line, fix>

### Improvements
- <suggestion and reason>

### Minor
- <style, optional>

### Done well
- <one or two real strengths>
```

Critical means wrong results, data loss, security holes, leaks, races or broken contracts. Do not pad. If a category is clean, say nothing about it.

## Categories, in priority order

1. **Correctness of contract.** Does it do what the name, Javadoc and callers expect? Changed public signatures, changed exception types, changed null behavior.
2. **Null safety.** Chained calls on possibly-null values; `Optional.get()` unchecked; `null` returned where an empty collection or `Optional` is right; missing `Objects.requireNonNull` on constructor arguments that are stored.
3. **Exceptions.** Empty or overly broad catch; lost cause (`throw new X(e.getMessage())`); exceptions used for flow control; checked exceptions leaking across API boundaries; log-and-rethrow producing duplicate logs; unclosed resources.
4. **Equality and mutability.** `equals` without `hashCode`; mutable fields in hash keys; records that keep references to caller-owned lists, arrays or dates; getters that return internal mutable state.
5. **Collections and streams.** Modification during iteration; `Collectors.toList()` result mutated; side effects in `map`/`filter`; streams where a loop is clearer; parallel streams without a measurement; `Map.of`/`Set.of` fed duplicates or nulls.
6. **Concurrency.** Shared mutable state without a guard; check-then-act; missing `volatile`; synchronizing on non-final or public objects; unbounded executors; unobserved `CompletableFuture` failures; swallowed interrupts. Details in [concurrency.md](concurrency.md).
7. **Security.** SQL, HTML or shell built by concatenation; deserializing untrusted data with `ObjectInputStream`; secrets in logs; weak randomness for tokens (`Random` instead of `SecureRandom`); path traversal on user-supplied file names.
8. **Performance.** String concatenation in loops, regex compiled inside loops, N+1 calls, boxing in hot paths. Report only with evidence or an obvious asymptotic problem.
9. **Style and API.** Naming, dead code, magic numbers, long parameter lists, missing Javadoc on public API. Lowest priority; follow the project's formatter, do not impose one.

## Rules for the reviewer

- Review what changed. Do not flag untouched legacy code unless the change depends on it.
- Verify a suspected defect (read the callee, trace the caller) before reporting it as Critical.
- State uncertainty plainly instead of inflating severity.
