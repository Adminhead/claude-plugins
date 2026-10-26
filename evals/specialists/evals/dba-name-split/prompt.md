---
name: dba-name-split
description: "dba as session agent: migration plan with backfill and rollback for splitting users.name, review mode."
tags: [outcome, specialists, dba]
plugins: ["../../fixtures/dba-main", "../../../../plugins/dba", "../../../../plugins/db-schema-design", "../../../../plugins/postgres"]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Plan the migration that splits users.name into first_name and last_name. The users table is large and busy and the old app version stays live during the deploy. Include the backfill, the deploy order and the rollback. Put the migration code in your report.
