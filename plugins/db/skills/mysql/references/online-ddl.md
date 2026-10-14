# MySQL online DDL

Read this before running an `ALTER TABLE` or index build on a large or busy MySQL table. The facts below come from the MySQL 8.4 manual (sections 17.12.1 and 17.12.2). MariaDB has its own online DDL rules, so check its docs when the engine is MariaDB.

## Choose the method before you run it

InnoDB runs a DDL operation as **instant** (metadata only), **in place** (no table copy for most operations, with concurrent DML), or by **table copy**. The manual's operation tables list, for each operation, whether it is instant, in place, rebuilds the table, and permits concurrent DML. Look the operation up before running it.

Examples from the 8.4 tables:

| Operation | Instant | Rebuilds table | Concurrent DML |
| --- | --- | --- | --- |
| Add or drop a secondary index | No (in place) | No | Yes |
| Rename an index | No (in place, metadata only) | No | Yes |
| Add the first `FULLTEXT` index | No | Yes, unless a `FTS_DOC_ID` column exists | No |
| Add a `SPATIAL` index | No | No | No |
| Add a primary key | No | Yes | Yes |
| Drop a primary key | No | Yes | No |

Define the primary key when you create the table. Changing it later copies the table.

## Make the statement fail instead of falling back

Name the algorithm and lock you require. If the server can't honor the request, the statement fails with an error instead of quietly taking a stronger lock or copying the table.

```sql
ALTER TABLE t1 ADD INDEX idx_a (a), ALGORITHM=INPLACE, LOCK=NONE;
```

- `LOCK=NONE` permits concurrent queries and DML. `SHARED` blocks DML, and `EXCLUSIVE` blocks everything. If the clause asks for a less restrictive lock than the operation allows, the statement fails.
- Omitting `LOCK` is the same as `LOCK=DEFAULT`, which permits as much concurrency as the operation allows.

## Metadata locks can still block you

Even an online operation needs a brief exclusive metadata lock at the start and at commit. If a long or idle transaction holds a metadata lock on the table (any prior `SELECT` inside an open transaction does), the `ALTER` waits for it. While it waits, its pending exclusive lock **blocks every later query on the table**, so a stalled DDL can become an outage.

- Before running DDL, look for old transactions on the table (`SHOW FULL PROCESSLIST`, `information_schema.innodb_trx`).
- Run the change in a quiet window, and watch for `Waiting for table metadata lock` in the process list.
- Set `lock_wait_timeout` for the session so a blocked `ALTER` gives up instead of waiting its default long period, and be ready to retry.

## Staging a required column

A new `NOT NULL` column without a default can't be added to a populated table in one safe step. Tested on MySQL 8.4.11 with the default strict `sql_mode`: `ADD COLUMN ... NOT NULL` with no default succeeded for `INT` and `VARCHAR`, silently filling `0` and `''` in existing rows, and failed for `DATE` (`Incorrect date value: '0000-00-00'`). Don't rely on either outcome. Give the column an explicit `DEFAULT`, or add it nullable and backfill. Add it with a default or as nullable, backfill in bounded batches, then tighten the constraint. See `db:database-design` `references/migrations.md` for the staging pattern and stop conditions. For very large tables, a third-party online schema change tool is an option. Adopting one is a dependency decision, so ask the owner first.
