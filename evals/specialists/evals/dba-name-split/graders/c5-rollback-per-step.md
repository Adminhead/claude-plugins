---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Rollback per step: every stage has its own rollback or roll-forward step, and the plan says that the `name` drop, if included, is the point of no return and what restores the data there (or that the drop is deferred).
