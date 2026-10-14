---
name: database-design
description: "Portable relational schema design and review: entities, keys, relationships, NOT NULL/UNIQUE/CHECK/FK constraints and delete actions, normalization vs justified denormalization, logical access paths, and expand-contract migrations with backfills. Use when adding or changing tables, ORM models, or migrations, or reviewing a data model. Not for PostgreSQL query plans, index types, locking, or ops (efficient-db:postgres), MySQL/MariaDB specifics (efficient-db:mysql), or caching/queues on Redis (efficient-db:redis)."
---

# Efficient Database Design

Make a relational model enforce its business rules and support its known reads and writes. The output is a reviewable logical schema and a migration plan. Vendor SQL, index types, plan analysis, replication, backups, and server tuning are out of scope. For PostgreSQL implementation or measurement, use `efficient-db:postgres`.

## 1. Establish the change boundary

- Read the request, the existing schema and migrations (including ORM models such as Prisma, Drizzle, SQLAlchemy, Django, or ActiveRecord), the application writes, representative reads, tests, and retention or privacy rules.
- List the decision to make, the affected consumers, the deployment order, the existing data to preserve, and the unknowns.
- Find consumers beyond the obvious ones: SQL objects (views, triggers, functions, procedures), application queries and ORM models, dynamic or string-built SQL, scheduled jobs, and reports. Label each dependency Direct, Indirect, or Uncertain. A text search isn't exhaustive, so say what it can't see.
- Mark any unestablished workload, ownership, or engine capability as an assumption. Ask when it affects correctness or compatibility.
- Check ORM and migration-tool APIs through Context7 for the installed version.

## 2. Write the data contract before tables

For each entity, name its stable identity, its required and optional facts, its lifecycle states, and its authoritative owner. Write each invariant in testable language, covering uniqueness, valid state combinations, cardinality, ownership, retention, and whether history may change. Classify each rule:

- **Row-local**, such as "status is one of …" or "qty ≥ 0". A `CHECK` constraint can enforce these.
- **Relationship**, such as "every line item belongs to an order". A foreign key can enforce these.
- **Cross-row or temporal**, such as "no overlapping assignments" or "at most N active per user". A row-local `CHECK` **cannot** enforce these. Choose a database mechanism that can (a unique or partial-unique index, an exclusion constraint, a trigger), a serialized transaction, or a changed model. State the concurrency assumption for any rule enforced outside a constraint.

## 3. Model relationships explicitly

- Give an entity its own table when it has independent identity, lifecycle, or attributes.
- **One-to-many.** Put the foreign key on the many side.
- **Many-to-many.** Use an association table, especially when the link has attributes, history, ordering, or a lifecycle.
- **One-to-one.** Use a foreign key plus `UNIQUE` only when both sides are independently meaningful. Otherwise merge the tables.
- Use a nullable relationship column only when absence has a defined meaning.
- Never store a repeating collection, delimited IDs, or an untyped polymorphic reference in one column to avoid a table. If several target types are intended, model them so invalid combinations can't be written, for example with one nullable FK per target plus a `CHECK` that exactly one is set.

## 4. Keys and constraints from the contract

- Every table gets a primary key that stays stable for the row's lifetime. Don't use a natural key as the primary key when it can be corrected, reused, or renamed. Keep it as `UNIQUE` instead.
- Keep meaningful alternate identities `UNIQUE`, composite when the identity is scoped by a parent.
- Use `NOT NULL` for required attributes, foreign keys for required relationships, and `CHECK` for row-local domains.
- Define the delete and update action for every foreign key:
  - `CASCADE` only for components that can't exist alone
  - restrict by default for independently meaningful or auditable records
  - `SET NULL` or `SET DEFAULT` only when the resulting row stays valid and its meaning is explicit
- Keep identifiers and timestamps separate from mutable display names and business facts.

## 5. Normalize by default and justify every duplicate

- Store each fact once, in its authoritative place, with non-key columns describing their table's key. Split facts that have different owners, lifecycles, permissions, retention, or update rates.
- Denormalize only for a named, measured read or operational need. Record the source of truth, the refresh or write path, the consistency expectation, the repair method, and how it will be verified.
- Don't add summary tables, copied fields, entity-attribute-value (EAV) structures, or speculative extension columns for imagined needs.

## 6. Logical access paths from real operations

- For each important read, record its filters, joins, ordering, expected result size, frequency, and the write cost of supporting it.
- Give relationship lookups and parent delete and update paths an intentional access path. Index a foreign key when the workload needs it, not by blanket rule. The usual reason is a parent delete or key update that scans the child table, for example under `ON DELETE CASCADE`. Write-heavy tables pay for unused indexes.
- Tie each proposed index to the query it serves and its write and storage cost. Don't index by column name, guessed selectivity, or future scale.
- Engine-specific index types and plan inspection belong to `efficient-db:postgres` (and `efficient-db:mysql`). Postgres type defaults, such as `timestamptz`, `text`, and identity keys, are in `efficient-db:postgres` `references/schema-design.md`.

## 7. Migration plan

**Read [references/migrations.md](references/migrations.md) before writing or reviewing any migration that touches existing data or runs while old code is live.** It covers expand-contract staging, a pre-apply safety checklist, anti-patterns, per-tool traps, backfills, reversibility, and stop conditions.

## 8. Maintenance ownership

- State who owns schema changes, migration execution, data correction, retention and deletion, integrity monitoring, and recovery testing.
- Define how orphaned, duplicated, stale, or denormalized data is detected and repaired without bypassing constraints.
- Keep an audit trail when the domain needs to reconstruct who changed a material fact and when.
- Don't add a scheduler, ledger, or reconciliation service without a demonstrated invariant or operational need.

## 9. Review and verify the riskiest claims

- Present the tables, columns, keys, constraints, FK actions, access paths, assumptions, migration stages, and open decisions.
- Trace every invariant to exactly one enforcement point, and every important operation to an access path.
- Against a disposable database, using the real migration tool, write representative valid and invalid rows. Check that the constraints reject what they should.
- Upgrade from a realistic pre-change schema and data sample. Then verify row counts, required fields, referential integrity, uniqueness, and preserved historical meaning.
- Use `authoring:adr-writing`, if installed, when a consequential, long-lived choice needs a durable decision record.

## Stop conditions

- Reject the design when a required invariant has no enforceable owner, a delete action would destroy independently meaningful data, or the migration can't preserve required data. Resolve the contract before coding around the gap.
- If a performance concern has no representative operation and baseline, keep the simple design and record what measurement would justify changing it.
- If the target engine can't enforce a chosen constraint or migration step, name the limitation and choose an alternative with equivalent enforcement, or revise the requirement. Never quietly weaken integrity.

A design is not done until every required invariant and every existing-data transition has an explicit, reviewable answer.
