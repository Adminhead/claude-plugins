---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Backfill: the backfill is a separate step from the schema change, runs in bounded batches (by id range or limit) that can resume, and is not a single `UPDATE` over the whole table. It states how a name with one word or several words is split.
