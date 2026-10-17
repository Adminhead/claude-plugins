// Component skeleton: validated config, explicit lifecycle, one periodic task.
// Rename "blinker" and replace the pin toggle with the real work.
#include "blinker.h"

#include <inttypes.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "blinker";

static TaskHandle_t s_task;
static blinker_config_t s_cfg;
static bool s_ready;

static int active_level(void)
{
    return s_cfg.active_high ? 1 : 0;
}

static void blink_loop(void *arg)
{
    const TickType_t period = pdMS_TO_TICKS(s_cfg.period_ms);
    TickType_t wake = xTaskGetTickCount();
    int level = active_level();

    while (true) {
        gpio_set_level(s_cfg.gpio_num, level);
        level = !level;
        vTaskDelayUntil(&wake, period); // fixed cadence, no drift
    }
}

esp_err_t blinker_init(const blinker_config_t *cfg)
{
    ESP_RETURN_ON_FALSE(cfg, ESP_ERR_INVALID_ARG, TAG, "no config given");
    ESP_RETURN_ON_FALSE(pdMS_TO_TICKS(cfg->period_ms) > 0, ESP_ERR_INVALID_ARG, TAG,
                        "period_ms rounds to zero ticks");
    ESP_RETURN_ON_FALSE(GPIO_IS_VALID_OUTPUT_GPIO(cfg->gpio_num), ESP_ERR_INVALID_ARG, TAG,
                        "gpio %d is not an output pin on this chip", cfg->gpio_num);

    gpio_config_t pin = {
        .pin_bit_mask = 1ULL << cfg->gpio_num,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&pin), TAG, "cannot configure gpio %d", cfg->gpio_num);

    s_cfg = *cfg;
    s_ready = true;
    return ESP_OK;
}

esp_err_t blinker_start(void)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "call blinker_init first");
    ESP_RETURN_ON_FALSE(!s_task, ESP_ERR_INVALID_STATE, TAG, "already running");

    BaseType_t created = xTaskCreate(blink_loop, "blinker", 3072, NULL,
                                     tskIDLE_PRIORITY + 1, &s_task);
    ESP_RETURN_ON_FALSE(created == pdPASS, ESP_ERR_NO_MEM, TAG, "task creation failed");
    ESP_LOGI(TAG, "running on gpio %d every %" PRIu32 " ms", s_cfg.gpio_num, s_cfg.period_ms);
    return ESP_OK;
}

esp_err_t blinker_stop(void)
{
    ESP_RETURN_ON_FALSE(s_task, ESP_ERR_INVALID_STATE, TAG, "not running");
    vTaskDelete(s_task);
    s_task = NULL;
    // Leave the pin inactive so the load is not stuck on.
    gpio_set_level(s_cfg.gpio_num, !active_level());
    ESP_LOGI(TAG, "stopped");
    return ESP_OK;
}
