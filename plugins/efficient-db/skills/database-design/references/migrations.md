# Migrations

Read this before writing or reviewing a migration that touches existing data or runs while old application code is still live.

## Inventory first

- Read the existing migration conventions, including the tool, naming, ordering, and whether migrations run in a transaction.
- List every reader and writer of the affected tables. Include background jobs, integrations, reports, analytics, and old app versions that overlap during deploy.
- Version migrations in dependency order.

## Expand-contract stages

When compatibility matters, use these stages. Each one ships separately.

1. **Expand.** Add new tables, nullable columns, or compatible constraints. Where the engine supports it, add a new constraint as not-yet-validated.
2. **Dual-compatible code.** Deploy code that writes both representations, or that reads either one.
3. **Backfill.** Copy data in bounded, observable batches that can resume. Decide in advance what happens on a partial failure (restart or roll back).
4. **Verify.** Check completeness and equivalence against explicit invariants, such as row counts, null counts, and a sample of equivalence checks.
5. **Switch.** Make new fields required, validate constraints, and move reads over, but only after every writer is compatible.
6. **Contract.** Remove the old representation in a later migration, after the compatibility window has closed.

## Safety checklist

Check these before applying a migration to a shared database.

- [ ] The migration follows the repo's conventions and is checked in, not run by hand.
- [ ] It is reversible, or it says plainly why it isn't and what restores the data.
- [ ] Schema changes and data backfills are separate steps. A failed backfill then doesn't roll back, or hold locks for, a schema change.
- [ ] No step takes a long exclusive lock on a large, busy table. Check the engine's locking rules, and set a lock timeout where the engine supports one.
- [ ] A new required column is staged. A `NOT NULL` column without a default can't be added to a populated table in one safe step. Postgres errors. MySQL 8.4 in strict mode accepted it for `INT` and `VARCHAR` and filled `0` and `''`, but errored for `DATE`, so don't rely on either behavior. Give it an explicit default, or add it nullable, backfill, validate, then enforce.
- [ ] Indexes on large existing tables use the engine's online build, which may need to run outside a transaction.
- [ ] It was tested up, and down where it exists, on a copy of production-sized data. A migration that works on 100 rows can lock on 10 million.
- [ ] A rollback or roll-forward plan is written down.

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
| --- | --- | --- |
| Editing a migration that already ran in a shared environment | Environments diverge and the tool's history stops matching the schema | Add a new migration. Edit freely only before first deploy |
| Renaming or dropping a column in one step | Old code still running during deploy breaks | Expand-contract, with the drop in a later migration |
| One migration that changes schema, rewrites data, and drops the old column | A partial failure has no clean recovery | Separate steps, each shippable and checkable alone |
| Backfill as a single `UPDATE` over a huge table | Long transaction, lock pressure, replica lag | Bounded, resumable batches |
| Ad hoc production DDL outside the migration tool | The next deploy fails or silently undoes it | Make every change a migration |
| Letting an ORM auto-sync production schema | Unreviewed destructive diffs | Generate migration files and review them |

## Tool traps

Check the docs for the installed major version, because migration tooling changes between releases.

- **Prisma Migrate (6.x and 7.x).** `prisma migrate dev --create-only` writes the migration without applying it, so you can edit the SQL, for example to add an online index build or a backfill. Prisma 8 was still a release candidate when this was written and changes the migration flow, so check the installed version's docs.
- **Kysely.** Type migration functions as `Kysely<any>`, not the app's current database type. A migration must keep working after the app's types change.
- **golang-migrate.** A failed migration marks the database dirty and blocks later runs. Find out whether it applied partially, fix the schema, then run `migrate force <version>` to the version that matches the real state. Don't force before you know that state.
- **drizzle-kit.** `push` applies the schema diff directly and leaves no migration file. Its docs position it for rapid prototyping, so use `generate` and `migrate` when you need reviewed, ordered, auditable migrations.
- **Transaction wrappers.** Many tools run each migration in a transaction, and statements such as Postgres `CREATE INDEX CONCURRENTLY` can't run inside one. Use the tool's no-transaction option or a separate step.

## Rules

- Treat a migration as immutable once it has run in a shared environment. A fix is a new migration.
- Don't combine an irreversible data rewrite, an application behavior change, and a destructive drop in one step without a tested recovery plan.
- Make migrations reversible where feasible. When reversal would lose data, say so plainly, keep a restorable backup or export as the environment requires, and get approval before running it.
- Don't assume DDL locking, transactional DDL, online index builds, or backfill behavior carries across engines. Check the target engine's docs, or `efficient-db:postgres` for PostgreSQL (its online DDL section covers staging a `NOT NULL` column) and `efficient-db:mysql` for MySQL and MariaDB.
- Test the migration up, and down where it exists, on a disposable database seeded with a realistic pre-change sample.

## Stop and preserve evidence

Stop a migration or backfill on any of these:

- constraint violations
- unexpected row counts
- failed equivalence checks
- unacceptable lock or availability impact
- an unrecoverable partial state

Keep the evidence. Recover only through the documented path, by restoring or rolling forward. Diagnose the data rule or the compatibility assumption before retrying.
