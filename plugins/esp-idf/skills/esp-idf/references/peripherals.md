# Peripherals (GPIO, ADC, PWM, I2C, SPI, UART, TWAI)

Prefer ESP-IDF drivers over register access. Reach for registers only when the project already does, the driver lacks the feature, or you measured a timing need, and then wrap them in one component.

## Driver generations

The project's existing driver style wins unless the task is a migration. Verified against ESP-IDF v6.0 docs:

| Peripheral | Current API | Legacy state |
| --- | --- | --- |
| I2C | `driver/i2c_master.h`: `i2c_new_master_bus()`, `i2c_master_bus_add_device()` (since 5.2) | `driver/i2c.h` is end-of-life in v6.0, removal planned for v7.0 |
| ADC | `esp_adc/adc_oneshot.h`, `adc_continuous.h`, `adc_cali.h` | `driver/adc.h` removed in v6.0 |
| TWAI (CAN) | `esp_twai_onchip.h` node API, component `esp_driver_twai` | `driver/twai.h` is deprecated in v6.0 (warning can be suppressed) |
| GPIO | component `esp_driver_gpio` (since 5.3) | `driver` still aggregates it on older releases |

## GPIO

- Configure with `gpio_config()`, setting mode, pulls, and interrupt type explicitly.
- Check the chip: input-only pins, strapping pins, RTC-capable pins, and pins tied to flash or PSRAM differ per variant.
- Keep pin numbers in one board header. One init function per subsystem, and no hidden reconfiguration elsewhere.
- Interrupts: `gpio_install_isr_service()` once, then `gpio_isr_handler_add()`. See [RTOS patterns](rtos-patterns.md) for the handoff.

## ADC and PWM

- ADC readings depend on attenuation, calibration, and load. Use the calibration helpers when volts matter, and keep raw reads separate from unit conversion so the conversion is testable. `adc_oneshot_get_calibrated_result()` does both in one call.
- LEDC covers LED dimming and simple PWM. MCPWM suits motor control. Check the timer resolution and frequency trade-off.
- Do not trust bench readings in the field. Noise and load move them.

## I2C

- Check pull-ups, bus voltage, and speed before blaming software.
- Every transaction has a timeout. After repeated timeouts, run bus recovery (clock out pulses on SCL, then re-init), because a stuck device can hold SDA low.
- Serialize access with a mutex or an owner task. Log the address, register, and error on failure.

## SPI

- Initialize the bus with `spi_bus_initialize()`, add each device with `spi_bus_add_device()`, and keep mode, clock, CS, and queue depth explicit.
- DMA buffers come from DMA-capable memory (`MALLOC_CAP_DMA`) and stay valid until the transaction completes.
- Pick the clock from the wiring and device timing, not only the datasheet headline.
- Queue transactions for throughput. Use synchronous transmit for simple control paths.

## UART

- Use the UART driver's ring buffer and event queue before writing a custom ISR buffer.
- Parse framed protocols in a dedicated task and bound the work per frame. Reject malformed frames.
- Keep application UART traffic off the console UART, or the two interleave in `idf.py monitor`.

## TWAI (CAN)

- Check the transceiver and bus termination first. Electrical faults get blamed on software.
- Watch error counters and alerts, and recover from bus-off instead of retrying transmit forever.

## RMT

Use RMT for one-wire, IR, and other timing-sensitive pulse protocols. It has less jitter and CPU cost than bit-banging in a task.

## Timing

Measure intervals with `esp_timer_get_time()` or a logic analyzer instead of trusting nominal clocks. Do not flood logs in tight loops, because that distorts timing and can mask races.
