# DataStore

Use Preferences DataStore for a handful of key-value settings and Proto DataStore (or a serialized `DataStore<T>`) for typed objects. Use Room for relational or queryable data.

## Rules

- Exactly one `DataStore` instance per file per process. Create it once with the `preferencesDataStore` property delegate at top level (or provide a singleton through DI). Two instances on the same file throw `IllegalStateException: There are multiple DataStores active for the same file`.
- Read with `data: Flow<T>`; it emits the current value and every change. Write with `edit {}` or `updateData {}`, which are suspend and transactional. Both are main-safe.
- Never `runBlocking` to read a setting on the main thread. Read in the ViewModel and expose it as state, or use `first()` inside a coroutine.
- Handle `IOException` from `data` with `catch { emit(emptyPreferences()) }`; let other exceptions propagate.
- Migrate from SharedPreferences with `SharedPreferencesMigration` passed in `produceMigration`/`migrations`. It runs before the first read and deletes the old file after success.
- Secrets (tokens, keys) do not belong in plain DataStore. Use Keystore-backed storage.
- Not for multi-process use unless `MultiProcessDataStoreFactory` is used deliberately.

## Shape

```kotlin
private val Context.settings by preferencesDataStore("settings")

class SettingsRepository(private val store: DataStore<Preferences>) {
    val darkTheme: Flow<Boolean> = store.data.map { it[DARK] ?: false }
    suspend fun setDarkTheme(on: Boolean) = store.edit { it[DARK] = on }
    private companion object { val DARK = booleanPreferencesKey("dark") }
}
```
