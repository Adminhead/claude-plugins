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

## Rules

- Don't combine an irreversible data rewrite, an application behavior change, and a destructive drop in one step without a tested recovery plan.
- Make migrations reversible where feasible. When reversal would lose data, say so plainly, keep a restorable backup or export as the environment requires, and get approval before running it.
- Don't assume DDL locking, transactional DDL, online index builds, or backfill behavior carries across engines. Check the target engine's docs, or `efficient:postgres` for PostgreSQL.
- Test the migration up, and down where it exists, on a disposable database seeded with a realistic pre-change sample.

## Stop and preserve evidence

Stop a migration or backfill on any of these:

- constraint violations
- unexpected row counts
- failed equivalence checks
- unacceptable lock or availability impact
- an unrecoverable partial state

Keep the evidence. Recover only through the documented path, by restoring or rolling forward. Diagnose the data rule or the compatibility assumption before retrying.
