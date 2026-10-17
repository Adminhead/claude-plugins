---
name: postgres
description: "Measured PostgreSQL diagnosis and change: EXPLAIN/ANALYZE, index choice (B-tree, GIN, BRIN, partial, expression, INCLUDE), statistics, locks and wait events, MVCC/vacuum, isolation and serialization retries, SKIP LOCKED queues, partitioning, CREATE INDEX CONCURRENTLY, online DDL, row-level security policy cost, pgvector indexes, and backup/restore checks. Use for slow queries, lock stalls, bloat, Postgres-specific schema choices, or vector search. Not for portable schema modeling or migration staging (db:database-design), MySQL/MariaDB (db:mysql), or caching/queues on Redis (db:redis)."
---

# Efficient PostgreSQL

Make a measured PostgreSQL change or investigation. Establish the workload and failure mode before changing SQL, config, indexes, layout, or maintenance. Prefer the smallest reversible change that improves an observed outcome.

For portable tables, keys, constraints, relationships, and migration staging, use `db:database-design`. Never assume Postgres is deployed, what version it runs, or that an extension, replica, superuser, or production access exists. Verify each fact on the target. Behavior and syntax vary by major version, so check the Postgres docs for that version through Context7.

## 1. Set the operational boundary

- Identify the server version (`SELECT version()`), the topology (managed or self-hosted, replicas, pooler), the owner, the maintenance window, the privileges you have, data sensitivity, the rollback path, and whether the target is production.
- State the symptom and a measurable completion condition, such as query latency with its row count, a lock wait, a failed-transaction rate, or a recovery objective.
- **Never run writes, DDL, `pg_cancel_backend`/`pg_terminate_backend`, or load-generating probes against production without authorization and a recovery plan.**

## 2. Capture a minimal baseline

- Record the query or transaction shape, parameter ranges, call frequency and concurrency, the relevant schema and indexes, table sizes, and a time-bounded sample of latency, rows, and errors.
- Start with existing stats views: `pg_stat_statements` if installed, `pg_stat_activity`, `pg_stat_user_tables`, `pg_stat_user_indexes`, and `pg_locks`. Record the collection time, since stats can be cached or lagging.
- Redact literals, identifiers, and plans that expose sensitive data.
- If you can't reproduce or sample the symptom, stop and report the missing access, workload, or artifact.

## 3. Choose the investigation path

- **Slow query.** Start with `EXPLAIN`. Compare estimated rows, access paths, joins, sorts, and aggregates with the real parameters. `EXPLAIN (ANALYZE, BUFFERS)` *executes* the statement, so use it only when that is safe and representative. For writes, run it in a disposable environment or inside `BEGIN … ROLLBACK`.
- **Lock or stall.** Inspect active sessions, `wait_event_type`/`wait_event`, transaction age, blockers (`pg_blocking_pids()`), and lock modes before acting. A blocked session is not proof of the root cause. Find the application path that holds the lock.
- **Write cost, growth, vacuum pressure, stale estimates, or I/O.** Inspect table and index activity, dead tuples, `last_autovacuum`/`last_autoanalyze`, and the workload that creates dead tuples. Don't call ordinary MVCC churn bloat without evidence.
- **Failed transaction.** Keep the SQLSTATE, the error text, the isolation level, the retry behavior, and the concurrent operation. Reproduce with the smallest concurrent case that separates the candidate causes.

## 4. Interpret before proposing

- Rank a few falsifiable causes. For plans, separate bad estimates and stale stats from query shape, data distribution, memory (`work_mem` spills), I/O, and concurrency.
- A seq scan, nested loop, or sort is not wrong in itself. Compare its actual work and time with the completion condition.
- Change one variable per probe and keep the plans and measurements from before and after.
- Without a representative workload, limit the result to a hypothesis and ask for the smallest safe sample.

## 5. Choose the narrowest remedy

**Read [references/remedies.md](references/remedies.md) before proposing a fix.** It covers queries, indexes, and statistics; locking, MVCC, and isolation; maintenance; partitioning; online DDL; row-level security; and advanced features, with the conditions each remedy requires.

Two further references apply only to their own branch:

- Read [references/schema-design.md](references/schema-design.md) when choosing Postgres types, keys, constraints, or partitioning for a new or changed table.
- Read [references/pgvector.md](references/pgvector.md) when the work involves embeddings, nearest-neighbor queries, or hybrid keyword and vector search.

## 6. Plan the operational change

- Make the change additive and reversible where feasible. Test it on representative data under concurrent load in an approved non-production environment first.
- For a production index that must not block writes, prefer `CREATE INDEX CONCURRENTLY` when its restrictions fit. It can't run inside a transaction block (many migration tools wrap one by default), it takes longer, and a failure leaves an `INVALID` index. Afterward, check `pg_index.indisvalid`, then drop or rebuild an invalid index explicitly.
- Hold changes that need disruptive locks, table rewrites, restarts, or replication changes until the owner accepts the impact. Many `ALTER TABLE` forms take `ACCESS EXCLUSIVE`, so set a `lock_timeout` for DDL. The online DDL section in `references/remedies.md` lists which column and constraint changes avoid a rewrite.

## 7. Verify outcome and guardrails

- Rerun the same query, transaction, or workload after the single change. Compare plan shape, estimated vs. actual rows, time, buffers, lock waits, error rate, and write overhead.
- Confirm results are semantically unchanged with focused tests. Use `testing:unit` when an application contract changed.
- For operational work, also watch connection health, replication lag, backup signals, invalid indexes, lock waits, and error spikes through an agreed observation window.

## 8. Handle failure without improvising

- Stop or roll back when a guardrail breaches, an unexpected lock appears, a plan regresses, results change, or a prerequisite is unverified.
- Without owner approval and impact evidence, never disable safety checks, force a plan, kill sessions, drop an index, or rewrite a table as a shortcut.
- Keep the command, timestamps, error, plan, and rollback result. Classify the cause before the next probe. It is query semantics, application concurrency, database state, infrastructure, or unavailable access.

Stop when the completion condition and guardrails are met, or when missing evidence blocks a safe conclusion. Don't add indexes, partitions, tuning, extensions, or maintenance for hypothetical future scale.
