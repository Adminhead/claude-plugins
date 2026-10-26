---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Expand-contract staging: the plan has separate stages. New columns are added first (nullable, or with a safe default) while `name` stays in place. `name` is dropped, if at all, only in a later, separate migration after the new code is fully deployed (deferring or leaving out the drop is acceptable). It never renames or drops `name` in the same step that adds the new columns.
