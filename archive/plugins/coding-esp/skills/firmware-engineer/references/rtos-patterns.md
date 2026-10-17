# RTOS Patterns (ESP-IDF FreeRTOS)

ESP-IDF ships a FreeRTOS port with SMP support. Classic ESP32 and S3 have two cores; C3, C6, and H2 have one. Check the chip before assuming parallelism.

## Tasks

- Periodic work uses `vTaskDelayUntil()`, which keeps a fixed cadence where `vTaskDelay()` drifts. Log when an iteration overruns its period.
- Signal with task notifications when no payload moves, a queue when data moves, and an event group when several subsystems gate startup.
- Pin a task to a core (`xTaskCreatePinnedToCore`) only for a measured reason, such as keeping Wi-Fi-adjacent work off the LVGL core. Unpinned tasks let the scheduler balance load.
- Size stacks from `uxTaskGetStackHighWaterMark()` measured under load. Logging, JSON, and TLS paths use more stack than they look like they do.
- Watch priority inversion where tasks of different priority share a bus or lock.

## ISR handoff

```c
static TaskHandle_t s_worker;

static void IRAM_ATTR gpio_isr(void *arg)
{
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(s_worker, &woken);
    portYIELD_FROM_ISR(woken);
}
```

- Use only `...FromISR` calls in an ISR. Never block, log heavily, or allocate there.
- Mark handlers `IRAM_ATTR` when they must run while flash cache is disabled (for example during flash writes), and keep the data and callees they touch out of flash too.
- Debounce in a task or timer, not in the ISR.

## Locks

- A mutex guards a shared bus or non-trivial state. Keep hold time short and do not log while holding it.
- A single owner task for a complex peripheral beats many tasks sharing a mutex.
- Critical sections (`portENTER_CRITICAL`) are for a few instructions. Driver calls, logging, and queue operations inside one raise interrupt latency and trip watchdogs.

## Timers

| Need | Use |
| --- | --- |
| Loop cadence in a task | `vTaskDelayUntil()` |
| Microsecond timestamps, deferred callbacks | `esp_timer` |
| Millisecond retry or backoff | FreeRTOS software timer or `esp_timer` |
| Hardware capture, compare, waveforms | `gptimer`, RMT, or LEDC |

Timer callbacks run in a shared task. Keep them short and defer real work to your own task.

## Events and watchdogs

- Use `esp_event` for Wi-Fi, IP, and other system events. Keep handlers small, and pair every register with an unregister so duplicates do not pile up.
- Fix watchdog resets at the cause (a deadlock, a long critical section, a busy loop, a starved task). Disabling the watchdog hides the symptom.
- Feed the task watchdog from the task that owns the work, not from a helper.
