# Background work, notifications

## Choosing

- Deferrable, must-finish work (upload, sync, cleanup): WorkManager.
- User-visible long task started by the user: a foreground service with the correct type, or expedited work for short urgent tasks.
- Work tied to the screen: a coroutine in `viewModelScope`.
- Exact-time alarms: `AlarmManager` with the exact-alarm permission rules; prefer inexact where the product allows.

## WorkManager

- `OneTimeWorkRequest` or `PeriodicWorkRequest` (minimum interval 15 minutes). Set `Constraints` (network type, charging, storage not low) instead of checking in the worker.
- Prefer `CoroutineWorker`. Return `Result.retry()` for transient failure with a backoff policy, `Result.failure()` for permanent failure. Keep `doWork` idempotent.
- Unique work (`enqueueUniqueWork` / `enqueueUniquePeriodicWork`) with an `ExistingWorkPolicy` stops duplicate enqueues on every app start.
- Expedited work: `setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)`. On older releases the worker needs `getForegroundInfo()`. Expedited work has a quota and is for short, user-relevant tasks.
- Long work: call `setForeground(...)` from the worker with a foreground info whose service type matches the manifest.
- Pass small data only through `Data`; read large data from the database.
- Workers need dependencies through `@HiltWorker` (see `hilt.md`) or a custom `WorkerFactory`.

## Foreground services

Declare `android:foregroundServiceType` in the manifest and the matching `FOREGROUND_SERVICE_<TYPE>` permission. Starting one from the background is restricted on recent releases; see `behavior-changes.md` for the type timeouts.

## Notifications

- Create the `NotificationChannel` before posting (idempotent; channels are mandatory from API 26). Importance is user-controllable after creation, so choose it carefully.
- From API 33 (`POST_NOTIFICATIONS`), declare the permission and request it at runtime. Without it, `notify()` silently does nothing. Request when the user does something that makes the need clear, handle denial, and send users to settings after a permanent denial. The generic runtime-permission flow and its security checks belong to `android-skills:android-permissions-security`.
- Use `PendingIntent.FLAG_IMMUTABLE` unless the intent must be mutated; add `FLAG_MUTABLE` only on purpose.
- Build with `NotificationCompat`; set a small icon, a channel id and a content intent.
