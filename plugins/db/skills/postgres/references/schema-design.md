# PostgreSQL schema design

Read this when choosing Postgres types, keys, constraints, or partitioning for a new or changed table. Entities, relationships, and normalization come first in `db:database-design`. This file covers what Postgres adds. Behavior below was checked on Postgres 18.6. Confirm version-specific items against the target server's docs.

## Type defaults

| Need | Prefer | Avoid, and why |
| --- | --- | --- |
| Surrogate key | `bigint GENERATED ALWAYS AS IDENTITY` | `serial` (a non-standard shorthand; identity columns are the standard replacement) |
| Opaque or distributed key | `uuid`, from `uuidv7()` on Postgres 18 and later, else `gen_random_uuid()` | Random `uuidv4` primary keys on large write-heavy tables, which insert at random index positions (`uuidv7` is time-ordered) |
| Event time | `timestamptz` | `timestamp` (drops the zone, so stored UTC is indistinguishable from local time) and `timetz` |
| Text | `text`, plus `CHECK (length(col) <= n)` when a limit is a real rule | `char(n)` (pads), and `varchar(n)` by default (a limit change needs a rewrite-prone `ALTER`) |
| Money and exact decimals | `numeric(p, s)` | `money` (locale-dependent), `float` |
| Small closed set | `text` + `CHECK`, or a lookup table | `ENUM` for values that change (values can be added but not cheaply removed) |
| Optional attributes | `jsonb` | `json`; also `jsonb` for fields that need constraints, joins, or heavy filtering |
| Precision on `timestamptz` | none | `timestamptz(0)`, which rounds instead of truncating |

The type guidance follows the Postgres wiki page "Don't Do This". It is community advice, not a server rule, so follow an existing schema's conventions when they differ.

## Gotchas

- **Identifier folding.** Unquoted names fold to lowercase. `CREATE TABLE "MixedCase"` then `SELECT * FROM MixedCase` fails. Use `snake_case` and never quote.
- **`UNIQUE` allows many NULLs.** Two rows with a null key both pass. `UNIQUE NULLS NOT DISTINCT (col)` (Postgres 15 and later) rejects the second null. Treat it as an option for a column where a missing value is itself the identity, not a default.
- **`CHECK` passes NULL.** A check that evaluates to NULL succeeds. Pair it with `NOT NULL`: `price numeric NOT NULL CHECK (price > 0)`.
- **Foreign keys aren't indexed.** Index the referencing column when joins or parent deletes and updates need it. See the unindexed-key query in `remedies.md`.
- **Identity and sequence gaps are normal.** Rollbacks and crashes leave holes. Don't renumber, and don't use a sequence as a gap-free counter.
- **No silent truncation.** `numeric(2,0)` rejects 999 and `varchar(n)` rejects overlong input.
- **Heap storage.** There is no clustered primary key. `CLUSTER` reorders once and isn't maintained.
- **MVCC leaves dead tuples.** Every update writes a new row version. Avoid hot, wide rows that change constantly, and move the fast-changing columns to a narrow side table when measurement shows churn.
- **`ON CONFLICT` needs a matching arbiter.** The conflict target must match a unique index or constraint, or the statement errors with `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

## Constraints beyond the basics

- **Exclusion constraints** prevent overlaps that `UNIQUE` can't, such as double-booking: `EXCLUDE USING gist (room_id WITH =, during WITH &&)`. Scalar types like `integer` need `CREATE EXTENSION btree_gist` first, or the statement fails with `no default operator class for access method "gist"`.
- **`DEFERRABLE INITIALLY DEFERRED`** checks a constraint at commit. Use it for circular references or swaps, not to avoid ordering inserts.
- **Partial unique indexes** enforce "at most one active row per owner": `CREATE UNIQUE INDEX ON t (owner_id) WHERE active`.

## Indexing the schema

Choose index types from the remedies reference, and add each index for a query you can name. Postgres-specific helpers that change the table design:

- Generated columns turn a hot JSON path into an indexable scalar: `theme text GENERATED ALWAYS AS (attrs->>'theme') STORED` plus a B-tree on it.
- For `jsonb` containment (`@>`) workloads, a GIN index with `jsonb_path_ops` is smaller and faster than the default operator class, at the cost of supporting fewer operators.
- Case-insensitive lookup uses an expression index on `lower(col)` (queries must use the same expression) or `citext` when a constraint itself must be case-insensitive.

## Update-heavy tables

Set a lower `fillfactor` (for example 90) on a table whose rows are updated in place, so heap-only tuple (HOT) updates can reuse page space and skip index maintenance. HOT only applies when no indexed column changes. Measure `n_tup_hot_upd` against `n_tup_upd` in `pg_stat_user_tables` before and after.

## Partitioning limits

- Every primary key or unique constraint on a partitioned table must include all partition-key columns. `PRIMARY KEY (id)` on a table partitioned by `ts` fails. Use `PRIMARY KEY (id, ts)`, and accept that uniqueness of `id` alone isn't enforced across partitions.
- Use declarative partitioning, not table inheritance.
- Partition for measured pruning, retention, or maintenance needs (`remedies.md`, "Partitioning"), not for table size alone.
