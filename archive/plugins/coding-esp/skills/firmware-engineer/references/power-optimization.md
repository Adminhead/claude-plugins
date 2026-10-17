# Power

Start with a target average current, a duty cycle, the wake sources, and the wake latency. Tuning without a measurement plan misleads.

## Sleep modes

| Mode | CPU | State | Pick it when |
| --- | --- | --- | --- |
| Modem sleep | running | radio duty-cycled | the device stays connected |
| Light sleep | paused | RAM kept | wake latency must be short |
| Deep sleep | off | only RTC memory and configured wake sources | long idle, battery power |

Weigh wake latency, state retention, and the cost of reconnecting the radio.

## Wakeup sources differ per chip

Check the per-chip sleep page for your exact target before writing wakeup code. Verified against ESP-IDF v6.0 docs:

- Timer: `esp_sleep_enable_timer_wakeup()` on all chips.
- EXT0 (single RTC IO) exists only where the SoC supports it, which is ESP32 and S3 among the chips checked here. C3 and C6 do not have it.
- EXT1 (`esp_sleep_enable_ext1_wakeup_io()`): RTC IOs only. Valid pins include ESP32 `0, 2, 4, 12-15, 25-27, 32-39`, S2 and S3 `0-21`, C6 `0-7`, H2 `7-14`. Level modes differ: classic ESP32 offers `ALL_LOW` or `ANY_HIGH`, while S2, S3, C6, and H2 offer `ANY_LOW` or `ANY_HIGH`.
- Light-sleep GPIO wakeup: `gpio_wakeup_enable()` plus `esp_sleep_enable_gpio_wakeup()`. Any IO works, and it wakes from light sleep only, on every chip.
- Deep-sleep GPIO wakeup on C-series chips (LP/RTC IO) is a separate API. Before v6.0 it is `esp_deep_sleep_enable_gpio_wakeup()`. In v6.0 that function is removed and `esp_sleep_enable_gpio_wakeup_on_hp_periph_powerdown(mask, mode)` covers deep sleep, and light sleep when the peripheral power domain is powered down (`CONFIG_PM_POWER_DOWN_PERIPHERAL_IN_LIGHT_SLEEP`, marked experimental).
- Touch and ULP wakeup vary by chip. Read the target's sleep modes page before relying on them.

Internal pulls do not work when the RTC peripheral domain is off. Use external resistors, or keep the domain on with `esp_sleep_pd_config()` and accept the current cost.

## Dynamic frequency scaling and PM locks

- Use `esp_pm_configure()` for frequency scaling and automatic light sleep rather than touching clocks by hand.
- Take a PM lock (`esp_pm_lock_*`) only around work that needs a fixed frequency or no light sleep, and release it promptly. A leaked lock is the usual reason power saving "does nothing".

## Radio

The radio often dominates consumption. Batch network activity, avoid reconnect churn, choose the Wi-Fi power-save mode on purpose, and cut needless scans and advertising. A faster retry loop can cost more energy than it saves in latency.

## Peripherals and pins

- Stop or deinit idle drivers, switch sensor rails with load switches where the board allows, and prefer interrupts to polling.
- Set unused pins to a state that leaks no current through the board's pull-ups and level shifters. Use RTC IO hold where supported. Respect strapping pins.

## Battery

Read calibrated ADC values, sample at a controlled load state, and add hysteresis to thresholds so behavior does not flap. Reduce sampling, radio use, and optional features as charge drops.

## Measure

Use a current meter or power analyzer, not software estimates. Compare idle-active, light sleep, deep sleep, radio TX/RX peaks, and failure and reconnect storms. Record `sdkconfig`, target, and board revision beside each number.
