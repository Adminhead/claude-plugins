# EF Core query fixes

Contents: materialization and bounds, index-compatible predicates, compiled queries, parameterization, dynamic expression shapes, tracking, N+1, split queries, pagination, indexes, hidden saves, change detection in imports, bulk updates and deletes, overlapping operations.

Each fix lists when it is safe and how to verify it. A source review can identify a likely problem; only SQL logs, plans or timings prove an improvement.

## Materialization and result bounds

Materializing inside a helper is still an execution boundary. Keep translatable filters, projections and aggregates on `IQueryable<T>` until execution:

```csharp
// Loads every candidate, then filters in memory.
var candidates = await repository.LoadCandidatesAsync(ct);
return candidates.Where(o => o.CreatedAt < cutoff).ToList();

// Filters in SQL.
return await repository.QueryCandidates()
    .Where(o => o.CreatedAt < cutoff)
    .ToListAsync(ct);
```

- `AnyAsync` for existence; keep `CountAsync` when the number is needed.
- Fold repeated full-sequence calculations into one server-side aggregate instead of caching an unbounded list or running parallel queries on one context.
- Page or cap interactive results. For complete exports, stream (`AsAsyncEnumerable()`) or chunk without truncating the contract.

## Index-compatible predicates

A function or arithmetic on a column, or an unanchored substring match, usually prevents a seek on an ordinary index. Compare the bare column, often with a half-open range:

```csharp
db.Logs.Where(l => l.CreatedAt.Year == year);                              // expression on the column
var start = new DateTime(year, 1, 1);
db.Logs.Where(l => l.CreatedAt >= start && l.CreatedAt < start.AddYears(1)); // range on the column
```

- Case-insensitive text: an indexed normalized or computed column, or a column collation that matches; per-query collation changes can also defeat an index. `StringComparison` overloads generally don't translate, and current EF throws for untranslatable predicates rather than filtering client-side.
- `column * k > x`: compare against the precomputed constant.
- `total.ToString().StartsWith(p)` and similar conversions: filter on the typed column.
- `name.Contains(term)` isn't seekable with a B-tree; a prefix match may be. Neither prefix nor full-text search is a drop-in replacement for substring semantics; keep the required behavior or say clearly that it changes.
- Don't claim a full scan from LINQ alone: providers, computed or expression indexes and other predicates change plans.

Verify: the plan uses a seek. Adding an index doesn't fix an incompatible expression.

## Compiled queries

EF already caches translation for matching shapes. For a very hot, minimal query, a compiled delegate skips the cache lookup; it doesn't make I/O cheaper.

```csharp
private static readonly Func<AppDbContext, int, Task<ProductListItem?>> GetProduct =
    EF.CompileAsyncQuery((AppDbContext db, int id) =>
        db.Products.Where(p => p.Id == id)
            .Select(p => new ProductListItem(p.Id, p.Name, p.Price))
            .FirstOrDefault());

var item = await GetProduct(db, id);
```

Only for one shape executed at very high frequency. Verify: mean time drops with identical results.

## Parameterization and plan reuse

EF's translation cache is not the database plan cache. Captured values normally become parameters (stable SQL, plan reuse); literals stay constants (value-specific plans, more cache entries). Keep defaults unless workload evidence says otherwise.

| Override | Effect | Use when |
|---|---|---|
| `EF.Parameter(value)` (EF 9+) | Forces a parameter, even for a literal | Reusable SQL across values matters |
| `EF.Constant(value)` (EF 8.0.2+) | Forces an inline constant, even for a captured value | Measured value-specific plan benefit outweighs extra SQL variants |

```csharp
db.Orders.Where(o => o.Status == EF.Parameter("Pending"));
db.Orders.Where(o => o.CustomerId == EF.Constant(customerId));
```

Neither is inherently faster. EF 9 doesn't support these overrides inside compiled queries. Collection parameters have their own modes in EF 10 (see `ef-core-10.md`).

## Stable shapes for dynamic expressions

`Expression.Constant(requestValue)` in a hand-built predicate creates a new cache entry and new SQL per value. Use a captured-value expression instead:

```csharp
Expression<Func<string>> valueAccess = () => filterValue;
var comparison = Expression.Equal(propertyExpression, valueAccess.Body);
```

Ordinary captured LINQ arguments are already parameterized; fixed structural constants aren't defects. Caching a delegate per value or compiling every new expression doesn't stabilize the shape. Report likely cache churn, not a proven leak.

## Tracking

| Result and consumer | Decision |
|---|---|
| Scalar or value-only projection | Nothing to track; no `AsNoTracking` finding |
| Entities (or DTOs holding entities) edited later | Keep tracking |
| Read-only entity graph | Narrow the projection first; else `AsNoTracking()` |
| Read-only graph with heavily shared entities or identity-dependent consumers | `AsNoTrackingWithIdentityResolution()` or key-based DTO handling |

Identity resolution is per query, costs bookkeeping, and doesn't shrink joined payload. Filtered Includes on a tracking context can gain children already tracked by earlier queries (navigation fixup) and the navigation is marked loaded: use a detached projection with its own child filter, a no-tracking read, or a fresh context when the subset matters. Don't `ChangeTracker.Clear()` a context with pending writes just to tidy a read.

## N+1 and lazy loading

```csharp
var summaries = await db.Orders
    .Select(o => new OrderSummary(o.Id, o.Items.Count, o.Items.Sum(i => i.Price)))
    .ToListAsync(ct);
```

Project or `Include` instead of lazy loading, which causes N+1 and synchronous I/O. Don't enable `Microsoft.EntityFrameworkCore.Proxies` or make navigations `virtual` for lazy loading in server apps. Verify: a small fixed query count regardless of row count.

## Split queries and row duplication

Sibling collection Includes multiply each other's rows; references don't. Even one collection repeats wide parent columns per child.

```csharp
db.Blogs.Include(b => b.Posts).Include(b => b.Contributors).AsSplitQuery();
```

Prefer a narrow projection when the consumer doesn't need the graph. Splitting adds round-trips and can buffer; it reads at different instants, so consistency-sensitive reads may need a snapshot or serializable transaction. Paged split queries need a unique ordering (EF 10 makes the subquery ordering consistent; earlier versions need you to add the key). Keep deliberate `AsSingleQuery()`. Configure a default with `UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)` only on evidence.

## Pagination

```csharp
db.Orders.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(pageSize);
```

- Keyset on a unique, stable, indexed order. A descending `(CreatedAt, Id)` cursor needs `o.CreatedAt < lastDate || (o.CreatedAt == lastDate && o.Id < lastId)`.
- Keyset doesn't support jumping to page N; keep offset paging when the UI needs random page access, and say so.
- `Skip`/`Take` without a unique order is nondeterministic. Even ordered offset pages shift under concurrent writes.
- `OrderBy(...).Skip(...).Take(...).AsEnumerable().OrderBy(...)` reorders only the fetched window; that can be intentional.

Verify: latency stays flat from early to deep pages.

## Indexes from the model

Inspect configuration and conventions: EF creates an index on each dependent foreign key unless an existing index or key covers its ordered prefix. Status, timestamps and other filter columns may need explicit indexes. Recommend an index only for an evidenced hot query.

```csharp
modelBuilder.Entity<Order>()
    .HasIndex(o => new { o.CustomerId, o.CreatedAt });   // equality column first, then range/sort
```

Then `dotnet ef migrations add AddOrderCustomerCreatedIndex` and show it; applying it is the user's call. If EF doesn't own the schema, hand the index to whoever does. Equality columns first, then range or sort keys; an unconstrained middle key blocks the range. Add a workload index rather than replacing one another path uses. Every index slows writes.

## Saves hidden in repositories

A service loop can hide `SaveChanges` in a repository, audit journal or progress hook. A final unit-of-work commit doesn't undo earlier writes; check for an enclosing transaction before claiming per-item commits.

- Stage bounded batches and save together when the contract allows. Keep audit and outbox records, generated keys, relationship fixup, ordering, concurrency and domain events.
- Read generated IDs from the entity references after saving; don't assume allocation order.
- Retried feeds need durable row identity with a unique constraint and replay handling, or acknowledged checkpoints. Chunking isn't idempotency; check-then-insert isn't race-safe.

## Change detection in growing imports

Saved entities stay tracked. `ChangeTracker.Entries<T>()`, `HasChanges()` and `SaveChanges()` scan everything tracked, so per-row inspection of a growing graph turns superlinear.

- Track progress with your own counters, not tracker enumeration.
- When the batch owns the context, save and then `ChangeTracker.Clear()` or start a new context per batch.
- `ChangeTracker.AutoDetectChangesEnabled = false` only for a demonstrated redundant scan; restore it in `finally` and call `DetectChanges()` before saving if entities were mutated.

## Bulk updates and deletes

```csharp
await db.Products
    .Where(p => p.LastSoldDate < cutoff)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, false), ct);
```

Safe when the change is large, simple and needs no per-entity logic. Check the whole workflow:

- It doesn't update entities already loaded; a later tracked change to the same property overwrites it, even in one request.
- Concurrency tokens aren't checked automatically: add the token to the predicate, update it, and check the affected-row count.
- Each call is its own statement; a later `SaveChanges` neither batches it nor makes it atomic with audit or outbox writes. Use an explicit transaction (`await using var tx = await db.Database.BeginTransactionAsync(ct)`) when they must commit together.
- Client-side cascades and `SaveChanges` interceptors don't run (command interceptors do).

Verify: one `UPDATE`/`DELETE` with a `WHERE` and no preceding `SELECT`.

## No overlapping operations on one context

EF Core doesn't support concurrent operations on one `DbContext`, including through two repositories built on the same context. Starting two queries before awaiting either is enough to fail; `Task.WhenAll` doesn't make it safe. Await sequentially, or create one context per concurrent operation from `IDbContextFactory<T>`. Static or singleton contexts are lifetime and thread-safety bugs.

## Pitfalls

| Pitfall | Fix |
|---|---|
| Function-wrapped predicate on an indexed column | Range or indexed computed column |
| Query composition fixed, index coverage ignored | Match equality, range and order keys, including convention indexes |
| Compiling an occasional query | Compile only hot single-shape queries |
| Treating EF translation reuse as DB plan reuse | Inspect SQL parameters vs literals; justify overrides with workload evidence |
| DTO holding entities assumed untracked | Inspect the materialized graph |
| Bulk update followed by tracked math on stale values | Unify the write path; keep concurrency and atomicity |
| Enumerating a repository's deferred `IEnumerable` twice | Compose aggregates before switching to local operators |
