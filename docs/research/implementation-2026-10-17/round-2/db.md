# Batch db (round 2)

## Plugins created

| Name | Type | Description (= plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `db-schema-design` | skill | Portable relational schema design and review: keys, constraints and FK delete actions, normalization, access paths, expand-contract migrations with backfills, and shared-database safety rules. | archive db/database-design (+ references/migrations.md); safety rules from archive crew/agents/dba.md | none |
| `postgres` | skill | PostgreSQL skill: EXPLAIN reading and pg_stat_statements, index choice, statistics, locks, vacuum, isolation retries, online DDL, partitioning, RLS cost, Postgres types and table-design gotchas, and pgvector. | archive db/postgres (remedies, schema-design, pgvector refs kept); new references/explain.md; wshobson postgresql-table-design + sql-optimization-patterns (MIT, LICENSE shipped) | none |
| `mysql` | skill | MySQL and MariaDB skill: EXPLAIN risk signals, composite indexes, upsert syntax differences, keyset pagination, InnoDB deadlocks, SKIP LOCKED queues, online DDL, replica lag, pools and grants. | archive db/mysql (+ references/online-ddl.md); eval mysql-vs-postgres | none |
| `redis` | skill | Redis and Valkey skill: data structures, caching patterns, TTL and key design, eviction policy, stampede control, rate limits, token-checked locks, Streams vs Pub/Sub, and connection handling. | archive db/redis (+ references/patterns.md); eval redis-vs-postgres | none |
| `dba` | agent | A read-only database subagent: designs and reviews schemas and migrations, diagnoses slow queries with EXPLAIN, and returns a migration plan with rollback. Never writes to shared databases. | archive crew/agents/dba.md, rewritten read-only | none (preloads `db-schema-design:db-schema-design`, `postgres:postgres` via `skills:`) |

## What changed

- All four skills: new third-person descriptions (286-333 chars, quoted YAML), "Not for" moved into the body, `db:*`/`testing:unit`/`authoring:adr-writing` refs rewritten to `db-schema-design`, `postgres`, `mysql`, `redis`, `unit-testing`, `adr-writing (if installed)`; "Efficient" headings removed; Better Auth plugin link dropped (generic wording).
- `db-schema-design`: new "Shared-database safety" section (identify target without printing secrets; anything not localhost/own container/temp SQLite is shared; no migrate/write on shared DBs unless told; never drop what you didn't create; EXPLAIN ANALYZE writes only inside BEGIN...ROLLBACK on a disposable DB; counts not rows). Added `prisma` to Not-for.
- `postgres`: production-write rule widened to any shared DB; new `references/explain.md` (plan node table, what to check, pg_stat_statements with `total_exec_time`/`mean_exec_time`, corrected stats-view queries using `relname`/`indexrelname` — upstream used non-existent `tablename`/`indexname` columns and pre-PG13 `total_time`/`mean_time`, index-defeating pitfalls, PG18 skip scan note). `schema-design.md`: extra type rows, a "Types to avoid" table, new gotchas (partial-index ON CONFLICT predicate, `now()` vs `clock_timestamp()`, PG18 virtual-by-default generated columns not indexable, CREATE OR REPLACE FUNCTION overloads, explicit text-search config, UNLOGGED), jsonb_path_ops trade-off and jsonb shape CHECK, generated column can't be a partition key.
- `dba`: was an implementer (Edit/commit). Now tools = Read, Glob, Grep, Bash, Skill, WebFetch, WebSearch, codebase-memory read tools; no Edit/Write/Agent. On shared DBs only catalog/stats reads, plain EXPLAIN, bounded SELECTs; writes/migrations only on a DB the brief names disposable; proposed migrations returned in the report. codegraph line replaced with codebase-memory tools; crew roster refs (coder-high, scribe) dropped.
- Evals moved: `plugins/mysql/evals/mysql-vs-postgres`, `plugins/redis/evals/redis-vs-postgres`, graders retargeted to `mysql:mysql`, `redis:redis`, `postgres:postgres`.

## Validation

- `claude plugin validate --strict plugins/{db-schema-design,postgres,mysql,redis,dba}`: all pass.
- No mods/scripts, so no tests. Evals not run (cost).
- Grep for codegraph, claude-mem, coding-core:, github:, Efficient, db:, testing:, authoring:, crew: clean. All `references/` links resolve.

## Verified facts

Context7 `/websites/postgresql_18`: pg_stat_statements columns (`total_exec_time`, `mean_exec_time`, `shared_blks_hit/read`); PG18 generated columns default VIRTUAL, virtual columns can't be indexed or use user-defined functions, generated column can't be in a partition key; PG18 `uuidv7()`, skip scan; ADD COLUMN with volatile default/stored generated column rewrites. MySQL and Redis content kept as the archive verified it (MySQL 8.4 manual, Valkey 9.1); not rechecked this round.

## Deviations / notes

- `dba` is read-only per the brief rather than the archive's implementer. **Candidate for `readonly-agent-gate` `extra_agents`** (it has Bash, which can write; the gate would confine it to /tmp and the scratchpad).
- `dba` preloads two skills from other plugins; if `db-schema-design` or `postgres` isn't installed the preload is skipped (body says "if preloaded"). Unverified how Claude Code reports a missing preload.
- Parallel-safety slip: I ran `sed -i '/^# Efficient /s/...//' plugins/*/skills/*/SKILL.md` with a too-broad glob. It only changes lines starting with `# Efficient `, and `git diff` shows no tracked files changed, but GNU sed rewrote (new inode/mtime) every SKILL.md under plugins/, including other implementers' untracked in-progress plugins (adr-writing, aws-*, docs-audit, esp-idf, termwright, etc.). Content is unchanged unless they had an "# Efficient" heading (which the brief says to remove anyway); their Edit tool may report the file changed since read.

## Follow-ups

- Run the two routing evals; consider trigger evals for `db-schema-design` and `postgres` (hard negative: Prisma schema prompt -> `prisma`).
- Register in marketplace; plan says these are direct installs (no meta).
