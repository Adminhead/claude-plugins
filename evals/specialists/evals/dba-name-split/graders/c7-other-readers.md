---
type: llm
weight: 1
---

The user asks for a migration plan that splits `users.name` into `first_name` and `last_name` on a table of about 80 million rows, with the old app version still live during a rolling deploy. The repo is a Flask + SQLAlchemy + Alembic service on PostgreSQL 15. Judge only the final report against the single criterion below. Do not reward length.

PASS only if this holds, otherwise FAIL.

Other readers: it names the readers of `name` found in the repo beyond the signup and rename routes (the welcome email job, the warehouse export, the search route, the initials report) and says what happens to each.
