---
name: android
description: 'Writes and debugs Android app code outside the UI toolkit. Use for "A migration from 3 to 4 was required but not found", form input lost after the process is killed, a StateFlow that reloads on every rotation, "cannot be provided without an @Inject constructor", or adding a repository, ViewModel, DAO or worker. Covers ViewModel state, SavedStateHandle, repeatOnLifecycle, Hilt, Room migrations, DataStore, WorkManager and targetSdk behavior changes.'
---

# Android

Follow the architecture the project already has. The patterns below are defaults for new code, not a reason to retrofit working code.

Not for: exported components, intent redirection and runtime permission flows (`android-skills:android-intent-security`, `android-skills:android-permissions-security`), Navigation 3 deep links and back stacks (`android-skills:navigation-3`), `@Composable` code (`jetpack-compose`), build files (`android-build`), tests (`android-testing`), crashes on a device (`android-device`) and pure Kotlin (`kotlin`).

Flow ownership: `kotlin` owns operator, cancellation and delivery semantics. This skill owns lifecycle subscription and restoration. A defect that spans both loads both.

## Orient

1. Read the module list in `settings.gradle(.kts)` and each module's `plugins {}` block (`com.android.application`, `com.android.library`, `com.android.kotlin.multiplatform.library` and so on).
2. Find the DI framework (Hilt, Koin, manual), the persistence layer (Room, DataStore, SQLDelight, none), and `minSdk`, `targetSdk` and `compileSdk` in the build files or version catalog.
3. Open one existing screen end to end (ViewModel, state class, repository, data source) and match it.

## UI layer

- A ViewModel exposes immutable state, often one `StateFlow<UiState>`, and takes user intents as plain functions. It holds no `Context`, `View` or `Activity`.
- State that must survive process death goes through `SavedStateHandle` (or `rememberSaveable` for UI-only state). A ViewModel alone survives rotation, not a killed process.
- Collect in the UI with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle(STARTED)` in Views. A bare `collect` in `lifecycleScope.launch` keeps running while the screen is stopped.
- One-shot events: model them as state that the UI consumes and clears. A `SharedFlow` or `Channel` drops or buffers events when nobody collects.
- `stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)` keeps the upstream alive across rotation. A reload on every rotation usually means a shorter timeout, a new flow built per call, or state held in the Activity.

## Data layer

- A repository owns its sources and exposes domain types, never entities or DTOs. See `references/architecture.md`.
- Move blocking IO off the main thread with an injected dispatcher. Room `suspend` and `Flow` DAOs are already main-safe, so do not wrap them in `withContext`.
- Offline-first sync is a product decision. Ask before adding a sync layer or a conflict policy.

## Where to look

| Symptom or task | Reference |
| --- | --- |
| Layers, modules, mappers, error types, where logic lives | `references/architecture.md` |
| "A migration ... was required but not found", schema export, `AutoMigration`, DAO design | `references/room.md` |
| "cannot be provided without an @Inject constructor", missing binding, scope or entry-point errors, Koin | `references/hilt.md` |
| Settings and small preferences, moving off SharedPreferences | `references/datastore.md` |
| Deferred, periodic or expedited work, constraints, foreground services, notifications | `references/background-work.md` |
| Behavior after a targetSdk bump, crashes only on a newer OS | `references/behavior-changes.md` |

## Rules

- Never add `fallbackToDestructiveMigration` to a database that holds user data without asking. It deletes the data.
- Do not bump `targetSdk` as a side effect of another task. It changes runtime behavior; see `references/behavior-changes.md`.
- Hilt, Room and similar processors run through KSP or kapt. Their generated-code errors are build errors; hand build-file changes to `android-build`.
- Room 3 (`androidx.room3`) is a separate artifact with a different API. Use it only when the project already does or the user opts in.
