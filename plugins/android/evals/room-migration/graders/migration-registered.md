---
type: llm
weight: 3
focus: { source: file, path: app/src/main/java/com/example/data/AppDatabase.kt }
---

Judge the final AppDatabase.kt, which also holds the database builder.

PASS only if both hold:
1. A migration from version 3 to 4 is registered in any form: an `AutoMigration(from = 3, to = 4)` in `@Database`, or a `Migration(3, 4)` passed to `addMigrations` in the builder.
2. Existing rows end up with a value for the new `locale` column: an auto migration with a column default, or SQL that adds the column with a `DEFAULT`, or that backfills it.

FAIL if data is dropped, the destructive fallback is used, or no 3-to-4 path exists. Do not reward length.
