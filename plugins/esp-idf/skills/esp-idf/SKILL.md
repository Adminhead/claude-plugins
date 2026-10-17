---
name: esp-idf
description: Writes, reviews and debugs ESP-IDF firmware for ESP32-family chips, with confirmation gates before any flash, eFuse burn or partition change. Use in an ESP-IDF project (sdkconfig, idf_component.yml, partitions CSV), for FreeRTOS tasks, drivers, Wi-Fi/BLE, OTA, Secure Boot, LVGL, idf.py build/flash/monitor, or a Guru Meditation panic.
---

# ESP-IDF firmware

Focused on ESP-IDF; Arduino-ESP32 and PlatformIO projects get general embedded C guidance only. Not for bugs with no ESP angle (the `problem-solving` skill) or general shell scripts (`bash`, if installed).

A wrong pin, a small task stack, or an ISR-unsafe call shows up as a reset, not an error message. Keep changes small, check them with the build, and say what only hardware can confirm.

## Triage

Read the project before asking. Most answers are already in it.

- **Chip.** `CONFIG_IDF_TARGET` in `sdkconfig`, or `idf.py set-target` history. The chip decides core count, peripherals, memory map, and sleep and wakeup APIs, so it matters. Ask only when the task depends on it and nothing in the repo shows it.
- **ESP-IDF version.** `idf.py --version`, or `dependencies.idf` in `idf_component.yml`. As of 2026-10-17, v6.1 (2026-08-27) is the latest feature release; v6.0.3 and v5.5.6 are the newest patch releases of the older supported lines. v6.0 removed the legacy ADC, DAC, timer group, RMT, I2S, PCNT, MCPWM and sigma-delta drivers and marked legacy I2C (`driver/i2c.h`) end-of-life (removal planned for v7.0). Follow the driver style the project already uses unless the task is a migration.
- **Hardware facts.** Pin map, pull-ups, PSRAM, flash size, display controller, console transport. When missing, state the values you assume and carry them into the report.
- **Components.** Exact LVGL, ESP-ADF, and ESP-SR versions (`dependencies.lock`).

Classify the work as write, review, debug, or bring-up, then read `main/`, the component involved, `CMakeLists.txt`, `sdkconfig*`, the partitions CSV, and any logs.

## Assumptions and confirmation

Make a reasonable assumption about variant, pin map, or IDF version, say so, and continue. List each one under "not verified on hardware" so the user can correct it cheaply.

Stop and get explicit confirmation before a step that cannot be undone or that touches a real device:

- `idf.py flash` or `erase-flash` on a connected device.
- Changing the partition table of a device that is already deployed.
- Burning eFuses, by hand or by flashing a build that does it. The bootloader burns eFuses on first boot after such a flash, even for development-mode flash encryption (key block, JTAG and download-mode disables).

Before any flash, read the resolved `sdkconfig`. If it enables any of `CONFIG_SECURE_BOOT*`, `CONFIG_SECURE_FLASH_ENC_ENABLED` (either mode), `CONFIG_SECURE_DISABLE_ROM_DL_MODE`, `CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK` (or changes `CONFIG_BOOTLOADER_APP_SECURE_VERSION`), or `CONFIG_NVS_SEC_KEY_PROTECT_USING_HMAC`, treat the flash as irreversible. The confirmation names the port and each permanent eFuse effect. Never generate production signing or encryption keys yourself; the user does that under their own key management ([security](references/security-hardening.md)).

Pure code review stays within the code you were given. Note missing hardware context as a risk and keep going.

## Write

- Decide task ownership, queues, and locks before writing logic. A shared bus gets one owner task or one mutex.
- Keep ISRs short: latch state, notify a task, return, using only `...FromISR` APIs.
- Check every `esp_err_t`, and log the tag, operation, and error name on failure.
- Initialize in a fixed order (NVS, netif and event loop, Wi-Fi or BLE, drivers, tasks) and clean up on partial failure.
- Record configuration changes in `sdkconfig.defaults`, and size partitions from flash size and OTA need.
- Prefer ESP-IDF drivers over register access, and an existing project abstraction over a new one.
- After the task, offer an on-device service console when the USB or serial console is free and policy allows one. Build it only on request ([console](references/device-terminal-console.md)).

## Review

Lead with findings by severity, each with a file and line. Check, in this order:

1. API context: ISR versus task, blocking calls in callbacks.
2. Lifetime: buffers handed across tasks or to DMA, handler register and unregister pairs, cleanup on error paths.
3. Timeouts on every bus and queue operation, and watchdog exposure.
4. Stack sizes, heap use in hot paths, DMA-capable memory.
5. Pin conflicts, strapping pins, peripheral mode assumptions.
6. Consistency of `sdkconfig`, the partition table, flash size, and OTA needs.
7. Log quality: stable tags, error codes, retry counts.
8. Wi-Fi and BLE: reconnect with backoff, credentials kept in NVS, handling of disconnect and error events, coexistence when both radios run.

## Debug

- Separate build, flash, boot, and runtime failures before changing anything.
- Capture the full serial log from reset, the reset reason, and the ELF that matches the flashed image ([panic and log triage](references/panic-log-triage.md)).
- Reproduce with the exact `sdkconfig`, target, and wiring, narrow to one subsystem, and change one thing per run.
- Add logs, counters, or asserts before rewriting code.

## Bring-up

Check power and reset, then the console, then one peripheral at a time with a known-good read. Verify pins against the chip's capabilities and strapping pins before debugging software.

## Build, flash, monitor

1. Run `idf.py --version`. A path that exists is not proof the toolchain works. If it fails, the user loads the environment with `. $IDF_PATH/export.sh` in that shell, and the setup is theirs to fix.
2. Build with the project's wrapper when it has one, otherwise `idf.py build`. Copy wrappers from [templates/scripts](templates/scripts/) when the project has none: `common.sh`, `build.sh`, `flash.sh`, `monitor.sh`. They check the toolchain and target, and never run `set-target`, which wipes `sdkconfig`.
3. A failing build, or one that warns about something real, is not done. Fix it and rebuild; try `idf.py fullclean build` when stale config could explain the failure.
4. `idf.py flash monitor` is the usual hardware loop. `monitor` needs an interactive terminal, so hand the user the command when you cannot run one. Flash only after the confirmation above.
5. If the project depends on ESP-ADF, ESP-SR, or similar frameworks, record exact versions and compatibility evidence before building ([dependency compatibility](references/dependency-compatibility.md)).

## Report

- Implementation: the change, key decisions, then validation (what ran, what it showed).
- Review: findings by severity, then open questions.
- Debug: likely causes, evidence, next diagnostic step, proposed fix.
- Always end with **not verified on hardware**: the assumptions made, behavior that only a device can show, and any step you skipped.

## References

- [RTOS patterns](references/rtos-patterns.md). Tasks, ISR handoff, timers, locks, watchdogs.
- [Peripherals](references/peripherals.md). GPIO, ADC, PWM, I2C, SPI, UART, TWAI, and which driver generation applies.
- [Memory](references/memory-optimization.md). Heap, stack, DMA buffers, code size.
- [Power](references/power-optimization.md). Sleep modes and per-chip wakeup sources.
- [Partitions and sdkconfig](references/partitions-and-sdkconfig.md). Read before changing flash layout or config.
- [OTA](references/ota-workflow.md). Update flow, rollback, anti-rollback.
- [Security hardening](references/security-hardening.md). Secure Boot v2, flash and NVS encryption, debug-port lockdown.
- [LVGL and displays](references/lvgl-display.md). Display bring-up, flush callbacks, color order, threading.
- [Panic and log triage](references/panic-log-triage.md). Resets, Guru Meditation panics, log design.
- [Service console](references/device-terminal-console.md). When the user asks for an on-device terminal.
- [Dependency compatibility](references/dependency-compatibility.md). ESP-ADF, ESP-SR, and other IDF-pinned frameworks.

Copy and adapt from [templates/](templates/): [component](templates/component/), [console](templates/console/), [partition CSV](templates/partitions/ota_16mb.csv), [compatibility record](templates/compat/esp-framework-compat.lock.example).
