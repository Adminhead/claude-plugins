# db

Adds four database skills: relational schema design, PostgreSQL, MySQL and MariaDB, and Redis and Valkey. `db` is not in the `baseline` set. Install it in the projects that have a database.

The engine skills stay in one plugin on purpose. Postgres, MySQL, and Redis overlap in routing, and splitting them would move those neighbors apart.

## What it adds

| Skill | Purpose |
| --- | --- |
| `db:database-design` | Portable relational schema design and expand-contract migrations. Sends engine-specific work to the engine skill |
| `db:postgres` | Measured PostgreSQL diagnosis: plans, indexes, locks, vacuum |
| `db:mysql` | Measured MySQL and MariaDB diagnosis: EXPLAIN, composite indexes, InnoDB lock waits, online DDL |
| `db:redis` | Redis and Valkey usage: caching, TTL and key design, rate limits, locks, queues |

`db:database-design` sends engine-specific work to `db:postgres`, `db:mysql`, or `db:redis`.

## Install

```
claude plugin install db@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/db
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/db
   ```
2. Start a fresh session. The skill list should show `db:database-design`, `db:mysql`, `db:postgres`, and `db:redis`.

## Limits

- Near neighbors, such as `db:postgres`, `db:mysql`, and `db:redis`, are split by their descriptions. A borderline prompt can load either one. Name the skill to force it.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable db@adminhead` |
| Uninstall | `claude plugin uninstall db@adminhead` |

The plugin ships only skills, so both commands remove everything. Start a new session to be sure they are gone.
