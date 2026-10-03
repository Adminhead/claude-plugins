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
- **Unindexed foreign keys.** Postgres doesn't index the referencing column. A missing index slows joins on the key and makes each parent `DELETE` or key `UPDATE` scan the child table. Index it only when the workload does one of those. To list candidates, compare each constraint's columns with the leading columns of a valid, non-partial index:

  ```sql
  SELECT c.conrelid::regclass AS child_table, c.conname
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indpred IS NULL
        AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
        AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
    );
  ```

  A plain `attnum = ANY(indkey)` test is too loose. It treats a trailing index column or a partial index as coverage.
- **Unused indexes.** `pg_stat_user_indexes.idx_scan = 0` marks a candidate, not proof. Counters run from the last stats reset and are per server, so reads served by a replica don't show on the primary. An index may also exist to back a unique or primary-key constraint. Check all replicas and a full business cycle before dropping anything.

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

## Online DDL

Pick the form of a schema change that avoids a table rewrite or a long `ACCESS EXCLUSIVE` hold, then set a `lock_timeout` so a blocked `ALTER TABLE` fails instead of queueing behind a long transaction. Behavior below was checked against the Postgres 18 `ALTER TABLE` docs and a live 18.6 server.

- **`ADD COLUMN` with a constant default** stores the default in the catalog, so it is fast even on a large table. A volatile default (such as `clock_timestamp()`), a stored generated column, an identity column, or a column whose domain has constraints rewrites the table and its indexes.
- **`ADD COLUMN ... NOT NULL` with no default fails** on a populated table with `column "x" contains null values`. It doesn't rewrite. Stage it instead:
  1. Add the column as nullable.
  2. Backfill in bounded batches (see `efficient-db:database-design` `references/migrations.md`).
  3. `ALTER TABLE t ADD CONSTRAINT t_x_nn CHECK (x IS NOT NULL) NOT VALID;`
  4. `ALTER TABLE t VALIDATE CONSTRAINT t_x_nn;` which scans the table without blocking writes.
  5. `ALTER TABLE t ALTER COLUMN x SET NOT NULL;` which skips its own scan because the valid `CHECK` proves no nulls exist.
  6. `ALTER TABLE t DROP CONSTRAINT t_x_nn;`

  On Postgres 18, `ADD CONSTRAINT ... NOT NULL x NOT VALID` followed by `VALIDATE CONSTRAINT` works directly. Use the `CHECK` path on older versions.
- **Foreign keys and checks.** `ADD CONSTRAINT ... NOT VALID` takes its lock briefly and skips the scan. `VALIDATE CONSTRAINT` then checks existing rows while concurrent writes continue. `ADD FOREIGN KEY` needs only `SHARE ROW EXCLUSIVE`, on both tables.
- **Indexes.** `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` can't run in a transaction block. Check `indisvalid` after a failed build, as described in the SKILL.md operational step.
- **Type changes** and other rewrites need an expand-contract plan from `efficient-db:database-design`, not an in-place `ALTER`.

## Row-level security

- Run each policy's helper call once per statement instead of once per row. Wrap function calls that don't depend on the row in a scalar subquery, for example `USING ((SELECT auth.uid()) = user_id)`. The planner then evaluates the call as an `InitPlan`. Supabase documents this for `auth.uid()` and `auth.jwt()`. It applies to any stable function or `current_setting()` call that doesn't read the row, and it matters most for functions the planner can't inline. Confirm with `EXPLAIN` that an `InitPlan` appears.
- Index the columns a policy filters on, and name the roles with `TO` so the policy doesn't run for roles it can't affect.
- A `SECURITY DEFINER` function skips RLS when its owner does: a superuser, a role with `BYPASSRLS`, or the table's owner unless the table has `FORCE ROW LEVEL SECURITY`. Set `FORCE ROW LEVEL SECURITY` on the table, or create such functions under a role that doesn't own the table, and verify the behavior before relying on it.

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
