---
name: mysql
description: "Measured MySQL and MariaDB diagnosis and change: engine and version checks, EXPLAIN risk signals, composite index choice, upsert syntax differences, keyset pagination, InnoDB lock waits and deadlocks, SKIP LOCKED queue claims, online DDL, connection-pool timeouts, replica lag, and least-privilege grants. Use for slow queries, lock stalls, schema defaults, or MySQL/MariaDB-specific SQL and ops. Not for PostgreSQL (efficient-db:postgres), portable schema modeling or migration staging (efficient-db:database-design), or caches and queues in Redis (efficient-db:redis)."
---

# Efficient MySQL

Make a measured MySQL or MariaDB change or investigation. Establish the workload and failure mode before changing SQL, indexes, schema, or config. Prefer the smallest reversible change that improves an observed outcome.

For portable tables, keys, constraints, and migration staging, use `efficient-db:database-design`. MySQL and MariaDB have diverged in syntax and features, so never assume which engine or version runs, or that you have production access. Verify on the target, and check that version's manual. The sources for this skill are the MySQL 8.4 manual and the MariaDB documentation. It was not run against a live MySQL server.

## 1. Set the boundary

- Identify the engine and version with `SELECT VERSION();` and `SHOW VARIABLES LIKE 'version_comment';`. Note managed-service limits, replicas, a proxy or pooler, and whether the target is production.
- State the symptom and a measurable completion condition, such as a query's latency at its row count, a lock wait, or a deadlock rate.
- Run writes, DDL, `KILL`, and load-generating probes against production only with authorization and a recovery plan.

## 2. Capture a baseline

- Record the query shape and parameter ranges, call rate, the schema and indexes involved, and table sizes. Use the slow query log, `performance_schema`, or `SHOW FULL PROCESSLIST` for evidence.
- Enable the slow query log in a controlled environment, then turn it off again when finished. `log_queries_not_using_indexes` is noisy, so enable it only for a bounded window.
- `EXPLAIN ANALYZE` executes the statement. Run it only where that is safe, and wrap writes in a transaction you roll back.

## 3. Read the plan

Start with `EXPLAIN`. Compare the estimate with reality for the real parameters.

| Field | Risk signal |
| --- | --- |
| `type` | `ALL` (full scan) on a large table |
| `key` | `NULL` when a selective predicate exists |
| `rows` | A very high estimate on an interactive path |
| `Extra` | `Using temporary`, `Using filesort`, or a broad `Using where` |

A full scan is wrong only when its actual cost misses the completion condition. Rank a few falsifiable causes (missing or unusable index, non-sargable predicate, stale statistics, wide rows, lock waits) and change one variable per probe.

## 4. Choose the narrowest remedy

- **Indexes.** Order composite keys by equality predicates first, then a range or sort column. Add an index only for a named query, since each one adds write cost, backup size, and buffer-pool pressure. A function applied to an indexed column defeats the index.
- **Keyset pagination.** Deep `OFFSET` scans and discards rows. Page with a stable cursor and an index that matches it:

  ```sql
  SELECT id, name, created_at FROM products
  WHERE (created_at, id) < (?, ?)
  ORDER BY created_at DESC, id DESC
  LIMIT 50;
  -- backed by: CREATE INDEX idx_products_created_id ON products (created_at, id);
  ```
- **Upsert.** MySQL 8.4 deprecates `VALUES(col)` inside `ON DUPLICATE KEY UPDATE` and documents a row alias instead. MariaDB documents `VALUES(col)`, so don't assume it accepts a row alias. Pick the syntax from the engine you confirmed. On a table with more than one unique index, the update may match a different row than you expect, so avoid `ON DUPLICATE KEY UPDATE` there.

  ```sql
  -- MySQL: row alias
  INSERT INTO user_settings (user_id, setting_key, setting_value)
  VALUES (?, ?, ?) AS new
  ON DUPLICATE KEY UPDATE setting_value = new.setting_value;

  -- MariaDB, or a mixed fleet: VALUES()
  INSERT INTO user_settings (user_id, setting_key, setting_value)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
  ```
- **JSON.** Keep keys, ownership, and lifecycle fields relational. For a hot JSON path, add a generated column and index that column.
- **Full-text.** Built-in `FULLTEXT` with `MATCH ... AGAINST` covers simple relevance search. Move to a search engine for typo tolerance, faceting, or language-specific analysis.

## 5. Transactions and locking

- Keep transactions short, make external calls before opening one, and lock rows in a consistent order. Index the predicates of `UPDATE`, `DELETE`, and locking reads so they lock fewer index records.
- Always be ready to retry a transaction after a deadlock (error 1213) or lock-wait timeout. Retry the whole transaction with a bounded budget.
- `SHOW ENGINE INNODB STATUS` reports only the most recent deadlock, so capture it soon after one occurs. `innodb_print_all_deadlocks` logs every deadlock to the error log. Turn it off when finished.
- For locking reads, `READ COMMITTED` often reduces lock conflicts. Don't change isolation to hide a race.
- **Queue claim.** `SKIP LOCKED` lets workers claim different rows without waiting. The manual notes that skipping locked rows returns an inconsistent view, so use it only for queue-like tables, and give stuck work a recovery policy. It is unsafe for statement-based replication.

  ```sql
  START TRANSACTION;
  SELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  UPDATE jobs SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?;
  COMMIT;
  ```

## 6. Schema defaults

Follow the existing schema's conventions first. For new tables:

| Need | Prefer | Avoid |
| --- | --- | --- |
| Surrogate key | `BIGINT UNSIGNED AUTO_INCREMENT` | `INT` on tables that may pass 2 billion rows |
| UUID key | `BINARY(16)` with conversion helpers | `VARCHAR(36)` primary keys on hot tables |
| Money, exact quantities | `DECIMAL(p, s)` | `FLOAT`, `DOUBLE` |
| User text | `utf8mb4` for tables and indexes | `utf8mb3`, which can't store 4-byte characters |
| Application timestamps | `DATETIME`, with UTC set by the application | Assuming `DATETIME` stores a zone |
| Status values that change | Lookup table, or `VARCHAR` with a `CHECK` where the version enforces it | `ENUM` for values that change often |

Soft deletes (`deleted_at`) need an index that includes the column, or every query filters by scan. InnoDB clusters rows by primary key, so a long or random primary key enlarges every secondary index.

## 7. Operational changes

- Check how each `ALTER TABLE` runs before running it on a large table, and read [references/online-ddl.md](references/online-ddl.md) for the algorithm, lock, and metadata-lock rules.
- Hold changes that need long locks, table copies, or restarts until the owner accepts the impact.

## 8. Replicas, pools, and access

- **Replica lag.** Don't route read-your-own-write paths, checkout flows, permission checks, or idempotency-key reads to a replica right after a write. Pin them to the primary. Monitor both replication threads and the lag, not only the connection. Use `SHOW REPLICA STATUS` on current MySQL and on MariaDB, which accepts `SLAVE` or `REPLICA`. Older MySQL versions use `SHOW SLAVE STATUS`.
- **Pools.** Recycle pooled connections before the server's `wait_timeout` closes them, and enable a liveness check (a ping on checkout) to survive failover and network drops. Size the pool from the workload and the server's `max_connections` across all clients.
- **Grants.** Give the application user only the privileges it needs on its own schema, for example `SELECT, INSERT, UPDATE, DELETE`. Keep migration and admin accounts separate from the runtime account. Require TLS when traffic crosses hosts, and keep credentials in the platform's secret manager, never in examples or repository files. Create and change users with `CREATE USER` and `ALTER USER`, not direct writes to the grant tables.

## 9. Verify

- Rerun the same query or workload after the single change and compare plan shape, estimated and actual rows, time, lock waits, and write overhead.
- Confirm results are semantically unchanged with focused tests (`efficient-testing:unit`, if installed).
- Stop when the completion condition is met or missing evidence blocks a safe conclusion. Don't add indexes, config changes, or maintenance for hypothetical scale. Treat configuration values you find in examples as prompts for review, not presets, and size memory, connections, and durability settings from workload, hardware, and recovery objectives.
