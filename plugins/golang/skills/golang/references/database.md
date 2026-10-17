# Go database access

Read this when writing or reviewing `database/sql`, `sqlx`, or `pgx` code. Schema design belongs to `db-schema-design`, and locking, indexing, and query plans belong to `postgres`, both if installed. Use the data-access style the repo already has, including its ORM, rather than replacing it.

## database/sql

- Use the `*Context` variants (`QueryContext`, `ExecContext`, `QueryRowContext`, `BeginTx`) with the caller's context so cancellation reaches the driver.
- `defer rows.Close()` right after the error check on `Query`, and check `rows.Err()` after the loop. A loop that ends early on a scan error or a mid-stream failure otherwise looks like success.
- `Exec` for statements that return no rows. `Query` without closing the rows pins a connection.
- Test for no row with `errors.Is(err, sql.ErrNoRows)` and map it to your own not-found error at the repository boundary.
- Transactions: `tx, err := db.BeginTx(ctx, nil)`, then `defer tx.Rollback()` immediately (a no-op after a successful `Commit`), then `Commit` and return its error.
- Don't hold a transaction open across a network call or user wait.
- NULL columns scan into pointers, `sql.Null[T]` (Go 1.22+), or the older `sql.NullString` family. Scanning NULL into a plain `string` or `int` fails.
- Pool: set `SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`, and `SetConnMaxIdleTime` from the database's connection budget and the number of app instances, not defaults. The default open limit is unlimited.
- Never build SQL by concatenating values. Placeholders carry values only. For a dynamic `ORDER BY` or column, check the input against an allowlist of constants (see `security.md`).
- Prefer keyset pagination (`WHERE id > $1 ORDER BY id LIMIT $2`) over `OFFSET` on large tables.

## pgx

- Use `pgxpool` for servers. Collect rows into structs with `pgx.CollectRows(rows, pgx.RowToStructByName[T])`, which matches columns to fields by name and fails on a mismatch.
- Use `CopyFrom` for bulk inserts instead of many `Exec` calls.
- Detect constraint errors with `errors.As(err, &pgErr)` on `*pgconn.PgError` and branch on `pgErr.Code` (for example `23505` unique violation).

## ORMs and generators

Keep whichever the repo uses (`sqlc`, `sqlx`, `gorm`, `ent`, and so on) and follow its conventions. Check the generated SQL for N+1 patterns and unbounded queries, and make sure an ORM call still takes a context.
