---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Dual-write: while the old app version is live, rows written or renamed by old code (which writes only `name`) still end up with correct `first_name` and `last_name`. The plan names a mechanism (a trigger, or dual-writing code in `signup` and `rename`) and a catch-up for rows written during the window, or explains why none is needed.
