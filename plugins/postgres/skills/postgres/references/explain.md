# Reading plans and finding expensive queries

Read this when reading an `EXPLAIN` plan or ranking queries by cost. Column names below were checked against the Postgres 18 docs. The `pg_stat_statements` timing columns were renamed in Postgres 13 (`total_time` became `total_exec_time`, `mean_time` became `mean_exec_time`), so older snippets fail on current servers.

Adapted in part from the `sql-optimization-patterns` skill in wshobson/agents (MIT, see LICENSE). Its stats-view queries were corrected.

## Running EXPLAIN safely

```sql
EXPLAIN SELECT ...;                         -- plan only, nothing runs
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;      -- runs the query, adds real rows, time, buffers
BEGIN; EXPLAIN (ANALYZE, BUFFERS) UPDATE ...; ROLLBACK;   -- writes: disposable DB only
```

Use the real parameters. A plan for one value can differ completely from another (skewed data, generic vs custom plans for prepared statements). `EXPLAIN (ANALYZE)` on a production replica still loads it, so ask first.

## Reading a plan

Read from the innermost (most indented) node outwards. Each node shows estimated `cost=startup..total`, estimated `rows`, and with `ANALYZE` the `actual time`, `rows` and `loops`. Actual rows and time are per loop, so multiply by `loops`.

| Node | Meaning | Look at |
| --- | --- | --- |
| Seq Scan | Reads the whole table | Fine for small tables or when most rows match. Suspect it when a selective filter discards most rows (`Rows Removed by Filter`) |
| Index Scan | Walks an index, then fetches each heap row | Random I/O. Many matches can make it slower than a seq scan |
| Index Only Scan | Answers from the index alone | `Heap Fetches` high means the visibility map is stale (vacuum) |
| Bitmap Index / Heap Scan | Collects matching pages, then reads them in order | `lossy` blocks or `Recheck Cond` work mean `work_mem` was too small for the bitmap |
| Nested Loop | Runs the inner side once per outer row | Good when the outer side is small and the inner side is indexed. Bad when an underestimate makes the outer side large |
| Hash Join | Builds a hash of one side | `Batches` above 1 means it spilled to disk |
| Merge Join | Joins two sorted inputs | Watch for an explicit Sort feeding it |
| Sort | Sorts rows | `Sort Method: external merge  Disk: ...` means a spill past `work_mem` |

What to check, in order:

1. **Estimate vs actual rows.** A gap of 10x or more at a node usually explains a bad join choice above it. Causes: stale statistics, correlated columns (`CREATE STATISTICS`), functions or casts on columns, skewed values.
2. **Where the time goes.** Find the node whose actual time (times loops) dominates the total.
3. **Buffers.** `shared read` is disk or OS cache, `shared hit` is the buffer cache. A cold-cache run reads far more than a warm one, so compare like with like.
4. **Spills.** Disk sorts, hash batches and lossy bitmaps point at `work_mem` or at a query that processes more rows than it needs.

## Ranking queries by cost

`pg_stat_statements` must be in `shared_preload_libraries` and created with `CREATE EXTENSION pg_stat_statements` in the database. Times are in milliseconds and accumulate since the last reset.

```sql
-- total time is usually the right first sort: it finds what costs the server most
SELECT queryid, calls, round(total_exec_time) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms, rows,
       100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_pct,
       left(query, 80) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

Sort by `mean_exec_time` to find slow individual calls, and by `calls` to find chatty code (N+1 patterns). Query text can contain sensitive literals in some setups, so redact before reporting.

```sql
-- tables read mostly by sequential scans (candidates, not proof, of a missing index)
SELECT schemaname, relname, seq_scan, seq_tup_read, idx_scan,
       seq_tup_read / nullif(seq_scan, 0) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;

-- indexes never scanned since the last stats reset (see remedies.md before dropping any)
SELECT schemaname, relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

The stats views name the table `relname` and the index `indexrelname`, not `tablename` or `indexname` (those belong to `pg_indexes`).

## Query pitfalls that defeat an index

- **Function or cast on the column.** `WHERE lower(email) = $1` or `WHERE created_at::date = $1` can't use a plain index on the column. Rewrite as a range (`created_at >= $1 AND created_at < $1 + 1`) or add a matching expression index.
- **Implicit type conversion.** Comparing a `text` column with a number, or a `bigint` column with a `numeric` parameter, can force a cast on the column side. Bind parameters with the column's type.
- **Leading wildcard.** `LIKE '%abc'` can't use a B-tree. Use a `pg_trgm` GIN index if the extension is available, or full-text search.
- **`LIKE 'abc%'` under a non-C collation** needs a `text_pattern_ops` index (or a `C` collation column) to use a B-tree.
- **`OR` across different columns.** It may become a BitmapOr or a seq scan. A `UNION ALL` of two indexable queries can be cheaper; compare plans.
- **Composite index order.** `(a, b)` serves `WHERE a = ?` and `WHERE a = ? AND b > ?`. `WHERE b = ?` alone usually can't use it (Postgres 18 can sometimes skip-scan a low-cardinality leading column; check the plan).
- **Deep `OFFSET`.** It reads and discards every skipped row. Use keyset pagination with a matching index: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 50`.
- **`NOT IN (subquery)`** returns no rows if the subquery yields a NULL, and plans poorly. Use `NOT EXISTS`.
- **`SELECT *`** blocks index-only scans and drags wide or TOASTed columns through the plan. Name the columns.
- **N+1 queries** from an ORM show up as one cheap statement with a huge `calls` count. Batch with a join or `WHERE id = ANY($1)`.
- **`count(*)` on a whole large table** scans it. When an estimate is enough, read `reltuples` from `pg_class` (current only after a vacuum or analyze).

## Things not to reach for first

- `enable_seqscan = off` or other planner switches are diagnosis tools for one session. Don't set them globally to force a plan.
- `VACUUM FULL` and `REINDEX` without `CONCURRENTLY` take exclusive locks. See the maintenance section of `remedies.md`.
- More indexes. Each one slows every write to the table; tie each to a query you can name.
