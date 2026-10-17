#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int gpio_num;       // board pin map supplies this; do not hardcode in callers
    uint32_t period_ms; // must be > 0
    bool active_high;
} blinker_config_t;

// Validate the config and set up the pin. Call once, before start.
esp_err_t blinker_init(const blinker_config_t *cfg);
esp_err_t blinker_start(void);
esp_err_t blinker_stop(void);

#ifdef __cplusplus
}
#endif
