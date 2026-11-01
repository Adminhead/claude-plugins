# Room

Room 2 (`androidx.room`) is the default. Room 3 is a separate artifact (`androidx.room3`) with a different API (for example `suspend fun migrate(connection: SQLiteConnection)`); use it only when the project already does or the user opts in. The Room 2 to 3 migration is not covered here.

## "A migration from X to Y was required but not found"

Room opened a database at version X and the declared version is Y with no path between them. Causes, in order of likelihood:

1. The `@Database(version = ...)` was bumped with no migration. Add one (below).
2. The migration exists but is not registered: `Room.databaseBuilder(...).addMigrations(MIGRATION_3_4)`, or the `autoMigrations` entry is missing.
3. The migration covers 3 to 4 but the device is on 2. Provide every hop or a direct 2 to 4.
4. A downgrade (installed version is newer than the code). Do not paper over it with destructive fallback in release builds.

Never add `fallbackToDestructiveMigration()` to a database holding user data without asking. It deletes every table's rows. If data loss is acceptable for one case, scope it: `fallbackToDestructiveMigrationFrom(1, 2)` or `fallbackToDestructiveMigrationOnDowngrade()`.

## Schema export

Keep exported schema JSON in version control; auto migrations and migration tests need it.

```kotlin
plugins { id("androidx.room") }
room { schemaDirectory("$projectDir/schemas") }
```

Without the Room Gradle plugin, pass `room.schemaLocation` to KSP (`ksp { arg("room.schemaLocation", "$projectDir/schemas") }`) and keep `exportSchema = true` on `@Database`. Auto migrations fail when the schema for either version is missing.

## AutoMigration

```kotlin
@Database(
    version = 4,
    entities = [User::class],
    autoMigrations = [AutoMigration(from = 3, to = 4)],
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase()
```

Adding a column with a default, adding a table, and similar additive changes need no spec. Renaming or deleting a table or column is ambiguous and needs an `AutoMigrationSpec` annotated with `@RenameColumn`, `@DeleteColumn`, `@RenameTable` or `@DeleteTable`. A new `NOT NULL` column needs `@ColumnInfo(defaultValue = "...")` so existing rows get a value.

## Manual migration

For splits, merges, data transforms and type changes:

```kotlin
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE user ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'")
    }
}
```

A manual migration for a version pair wins over an auto migration for the same pair. Test with `MigrationTestHelper` and the exported schemas (`androidTest` or Robolectric; the test itself belongs to `android-testing`).

## DAOs

- `suspend` functions and `Flow` return types are main-safe: Room runs them on its own executors. Do not wrap them in `withContext(Dispatchers.IO)`.
- `@Upsert` for insert-or-update. `@Transaction` on a DAO method that does several operations or reads a `@Relation`.
- Entities stay in the data layer; map to domain types in the repository (`architecture.md`).
- Observable queries re-emit on any change to the tables they read; use `distinctUntilChanged()` if downstream work is expensive.
