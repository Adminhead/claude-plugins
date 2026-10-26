---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Online DDL: it sets `lock_timeout` for DDL that needs a lock, and any index or constraint on the new columns is built online (`CREATE INDEX CONCURRENTLY`, or `NOT VALID` then `VALIDATE CONSTRAINT`) outside a transactional migration. It does not add `NOT NULL` to a populated column in one step. If the plan adds no index or constraint on the new columns, only the `lock_timeout` and the no-single-step-`NOT NULL` parts apply.
