# PostgreSQL remedies

Read this after the evidence has ranked a cause and before proposing a fix. Choose the narrowest remedy that fits the observed cause. Check version-specific syntax and behavior against the Postgres docs for the server's major version.

## Query, index, or statistics

- Simplify the query only when its semantics stay identical.
- Add or change an index only for a demonstrated filter, join, ordering, uniqueness, or access pattern. Account for its write and storage cost.
- Start with B-tree. Use another type only when the observed operator and data type call for it:

  | Type | Typical fit |
  | --- | --- |
  | Hash | equality only |
  | GIN | arrays, `jsonb` containment, full-text, trigram |
  | GiST / SP-GiST | ranges, geometry, nearest-neighbor, exclusion constraints |
  | BRIN | very large tables whose values correlate with physical order (append-only timestamps) |

- **Composite indexes.** Order keys by the observed predicate and ordering, usually equality keys before a range key.
- **`INCLUDE`, partial, and expression indexes.** Use these only when the real plan and predicate support them. The query's expression or predicate must match the index definition exactly, or the planner won't use it.
- **Seek (keyset) pagination.** Use it only when a stable ordering exists and the workload or UX justifies it.
- **Statistics.** Run `ANALYZE` or raise per-column statistics targets, or add extended statistics (`CREATE STATISTICS`) for correlated columns, only when estimates are demonstrably wrong. Remeasure afterward. Don't assume `ANALYZE` fixed the plan.

## Locking, MVCC, isolation

- Shorten transactions. Never hold one open across user input or network calls, since `idle in transaction` sessions block vacuum and hold locks.
- Make the lock order consistent where the application controls it.
- Set bounded, scoped timeouts (`lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`) only where the caller handles the resulting error.
- **Queues.** Use `FOR UPDATE SKIP LOCKED` only with an explicit atomic-claim policy, a retry and recovery policy, and a policy for stuck work.
- **Isolation.** Postgres defaults to Read Committed. Don't raise the isolation level to hide a race. When Repeatable Read or Serializable is required, the application must retry the **whole transaction** on SQLSTATE `40001`, and `40P01` for deadlocks. Bound the retries and review idempotency.

## Maintenance

- Let autovacuum handle routine cleanup. Tune it per table, or run a manual operation, only when the observed workload, vacuum lag, or wraparound risk (`age(datfrozenxid)`) shows a need.
- Avoid routine `VACUUM FULL`. It takes `ACCESS EXCLUSIVE` and rewrites the table, which makes it a rewrite decision, not maintenance. For online compaction, consider an approved tool such as `pg_repack`, if it is available.
- A backup is incomplete until a restore test meets the recovery objective.

## Partitioning

Partition only when measured pruning, retention, maintenance, or lifecycle needs outweigh the added routing, constraint, index, and operational complexity. A large table alone is not a reason. Before creating partitions, define:

- the key and bounds
- default and out-of-range behavior
- evidence that queries prune (`EXPLAIN` shows the pruned partitions)
- the retention procedure (detach and drop)
- rollback

## Advanced features

Before using an extension, materialized view, logical replication, row-level security, generated column, full-text search, or similar feature, verify the following:

- server version and provider support (managed services restrict extensions)
- privileges
- failure modes
- ownership
- monitoring
- impact on backup and restore
- an exit path

Prefer a capability you already have over a new extension or background process.
