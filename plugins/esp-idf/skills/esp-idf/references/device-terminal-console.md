# Service Console

A small on-device terminal makes settings, status, heap, task, and log-level checks possible without reflashing. Build it when the user asks for one. Otherwise, when the console transport is free and policy allows it, offer one at the end of the task.

## When it fits

All three should hold:

- A USB or serial transport is available and not claimed by a product protocol.
- Project and security requirements permit an interactive console. See [security](security-hardening.md) for production gating.
- The task is not a pure review.

## Transport

Confirm which transport is wired to the host, and whether JTAG access must survive.

- Classic ESP32 usually reaches the host through an external USB-UART bridge on the console UART.
- C3, C6, and S3 commonly expose USB-Serial-JTAG. S2 and S3 can also run native USB (CDC).
- Application UART traffic must stay off the console UART.

## Build it with `esp_console`

Do not hand-roll a command parser. The REPL helpers give line editing, history, and completion:

- `esp_console_new_repl_uart()`, `esp_console_new_repl_usb_serial_jtag()`, or the USB CDC variant, chosen to match `CONFIG_ESP_CONSOLE_*`. ESP-IDF v6.1 adds `esp_console_new_repl_stdio()`, which uses whichever console is configured, and its docs describe the per-transport constructors as meant for examples; prefer it on v6.1 and later.
- Config macros: `ESP_CONSOLE_REPL_CONFIG_DEFAULT()`, `ESP_CONSOLE_DEV_UART_CONFIG_DEFAULT()`, `ESP_CONSOLE_DEV_USB_SERIAL_JTAG_CONFIG_DEFAULT()`.
- Register commands with `esp_console_cmd_register()`, then call `esp_console_start_repl()`. The constructor registers `help`.

[templates/console/](../templates/console/) is a skeleton with `status`, `heap`, `tasks`, `log`, and `reboot`. Adapt the transport branch to the chip. It is off by default through `APP_CONSOLE_ENABLE` in its `Kconfig.projbuild`, so enabling it is an explicit choice per build.

## Commands worth having

- `status`: uptime, version, reset reason, link state.
- `settings get|set|save`: validated application settings. Keep `set` and `save` separate when persistence matters, report exact validation errors, and never echo secrets.
- `tasks` and `heap`: bounded snapshots, not long reports. Per-task rows need FreeRTOS trace and stats options in `sdkconfig`.
- `log <tag|*> <level>`: runtime log tuning.
- `reboot`.

Optional: `wifi status`, `i2c scan` (only where probing is safe), `nvs get` (never secrets).

## Rules

- Handlers stay fast and deterministic. Hand long work to a task.
- Diagnostics must not hold shared locks or disturb critical timing.
- Drop destructive commands (erase, memory poke) unless the user asks for them.
- Production builds either omit the console (Kconfig flag) or gate sensitive commands behind authentication.

## Review checklist

- Transport ownership is clear and nothing conflicts.
- `esp_console` is used, with working help and completion.
- Handlers validate input and give usable errors.
- Diagnostics are bounded and safe.
- Secrets stay out of output, and production gating exists.
