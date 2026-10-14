# Panic, Reset, and Log Triage

## Collect first

- The full serial log from reset through the failure, not just the panic tail.
- ESP-IDF version, chip, build type, and the monitor command, baud, and port.
- The ELF from the build that produced the flashed image. Backtraces decode only against the matching ELF, and `idf.py monitor` decodes addresses when it can find it.

## Classify the failure

| Stage | Typical causes |
| --- | --- |
| Build or link | Missing component dependency, config mismatch, version skew |
| Flash or connect | Port, permissions, cable, boot mode, baud |
| Boot | Partition table or image mismatch, early init crash, missing data |
| Runtime panic | Null dereference, stack overflow, illegal instruction, watchdog |
| Runtime, no panic | Wrong behavior, timeouts, lost connectivity |

## Panic flow

1. Read the reset reason and the panic headline.
2. Read the lines just before it for the subsystem involved.
3. Decode the backtrace against the matching ELF (monitor decoding, or `addr2line`).
4. Inspect the top frames and the first application frame.
5. Check recent changes to that task, buffer, or callback path.
6. Put focused logs or asserts around the suspected boundary and reproduce.

## Frequent root causes

- Null or uninitialized handles after a partial init failure.
- Stack overflow in tasks that log, parse JSON, run TLS, or handle BLE/Wi-Fi callbacks.
- Use-after-free, or a buffer outliving its owner across tasks.
- A non-ISR-safe API called from an ISR or callback.
- Unsynchronized flags or queues shared between tasks.
- A watchdog hit from a blocking loop, deadlock, or long critical section.
- A bad pin or peripheral setup that times out repeatedly and cascades into a watchdog reset.

Panic format varies across IDF versions, so interpret output against the project's own version.

## Logging policy

- Use stable tags per module (`wifi_mgr`, `sensor_task`, `ota_updater`).
- Log state transitions, `esp_err_t` names, retry counts, backoff, and timeouts. Prefer `wifi_mgr: disconnected reason=<n> retry=3 backoff_ms=2000` over "connection failed".
- Log key configuration choices at startup so a field log shows the build.
- Keep application tags at debug or verbose while diagnosing, and raise the threshold of noisy library tags instead of silencing logs globally (`esp_log_level_set(tag, level)`, or the log level Kconfig options at build time).
- Stay out of tight loops, which distort timing. Remove or downgrade temporary logs once the bug is fixed.
- If a service console exists, expose runtime log-level control so verbosity changes without reflashing ([console](device-terminal-console.md)).
- Never log credentials, tokens, or keys.

## Review checklist

- Error logs carry a code and context, not just a message.
- Startup logs record the target and key config.
- Library noise is reduced where it hides signal, and app logs stay detailed enough to debug.
- Logging cost in hot paths is acceptable.
