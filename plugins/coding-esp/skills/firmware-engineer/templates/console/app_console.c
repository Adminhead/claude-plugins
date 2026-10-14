// Service console skeleton on esp_console. Extend by adding commands to
// s_commands; keep each handler short and bounded.
#include "app_console.h"

#include <stdio.h>
#include <string.h>

#include "esp_check.h"
#include "esp_console.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "app_console";

#if CONFIG_APP_CONSOLE_ENABLE

static const char *reset_reason_name(esp_reset_reason_t reason)
{
    switch (reason) {
    case ESP_RST_POWERON:   return "poweron";
    case ESP_RST_EXT:       return "ext";
    case ESP_RST_SW:        return "sw";
    case ESP_RST_PANIC:     return "panic";
    case ESP_RST_INT_WDT:   return "int_wdt";
    case ESP_RST_TASK_WDT:  return "task_wdt";
    case ESP_RST_WDT:       return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT:  return "brownout";
    default:                return "other";
    }
}

static int cmd_status(int argc, char **argv)
{
    printf("uptime_ms=%lld\n", (long long)(esp_timer_get_time() / 1000));
    printf("reset_reason=%s\n", reset_reason_name(esp_reset_reason()));
    return 0;
}

static int cmd_heap(int argc, char **argv)
{
    printf("free=%u min_free=%u largest_block=%u\n",
           (unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT),
           (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT),
           (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    return 0;
}

static int cmd_tasks(int argc, char **argv)
{
    // Per-task rows need CONFIG_FREERTOS_USE_TRACE_FACILITY and
    // CONFIG_FREERTOS_USE_STATS_FORMATTING_FUNCTIONS, then vTaskList().
    printf("tasks=%u\n", (unsigned)uxTaskGetNumberOfTasks());
    return 0;
}

static int cmd_log(int argc, char **argv)
{
    static const struct { const char *name; esp_log_level_t level; } levels[] = {
        {"error", ESP_LOG_ERROR}, {"warn", ESP_LOG_WARN}, {"info", ESP_LOG_INFO},
        {"debug", ESP_LOG_DEBUG}, {"verbose", ESP_LOG_VERBOSE},
    };

    if (argc != 3) {
        printf("usage: log <tag|*> <error|warn|info|debug|verbose>\n");
        return 1;
    }
    for (size_t i = 0; i < sizeof(levels) / sizeof(levels[0]); i++) {
        if (strcmp(argv[2], levels[i].name) == 0) {
            esp_log_level_set(argv[1], levels[i].level);
            printf("%s -> %s\n", argv[1], argv[2]);
            return 0;
        }
    }
    printf("unknown level '%s'\n", argv[2]);
    return 1;
}

static int cmd_reboot(int argc, char **argv)
{
    printf("restarting\n");
    fflush(stdout);
    esp_restart();
    return 0; // not reached
}

static const esp_console_cmd_t s_commands[] = {
    {.command = "status", .help = "Uptime and last reset reason", .func = cmd_status},
    {.command = "heap",   .help = "Heap free, minimum free, largest block", .func = cmd_heap},
    {.command = "tasks",  .help = "Task count", .func = cmd_tasks},
    {.command = "log",    .help = "Set log level: log <tag|*> <level>", .func = cmd_log},
    {.command = "reboot", .help = "Restart the device", .func = cmd_reboot},
};

#endif // CONFIG_APP_CONSOLE_ENABLE

esp_err_t app_console_start(void)
{
#if CONFIG_APP_CONSOLE_ENABLE
    esp_console_repl_t *repl = NULL;
    esp_console_repl_config_t repl_cfg = ESP_CONSOLE_REPL_CONFIG_DEFAULT();
    repl_cfg.prompt = "dev> ";

    // The REPL constructor must match the console transport in sdkconfig.
    // On ESP-IDF v6.1 and later, esp_console_new_repl_stdio() replaces this
    // branch.
#if CONFIG_ESP_CONSOLE_UART
    esp_console_dev_uart_config_t dev_cfg = ESP_CONSOLE_DEV_UART_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_console_new_repl_uart(&dev_cfg, &repl_cfg, &repl), TAG,
                        "REPL create failed");
#elif CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG
    esp_console_dev_usb_serial_jtag_config_t dev_cfg =
        ESP_CONSOLE_DEV_USB_SERIAL_JTAG_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_console_new_repl_usb_serial_jtag(&dev_cfg, &repl_cfg, &repl), TAG,
                        "REPL create failed");
#else
#error "No supported console transport selected in sdkconfig"
#endif

    // The REPL registers `help` itself.
    for (size_t i = 0; i < sizeof(s_commands) / sizeof(s_commands[0]); i++) {
        esp_err_t err = esp_console_cmd_register(&s_commands[i]);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "register '%s' failed: %s", s_commands[i].command, esp_err_to_name(err));
            repl->del(repl);
            return err;
        }
    }

    ESP_LOGI(TAG, "console ready");
    return esp_console_start_repl(repl);
#else
    ESP_LOGI(TAG, "console disabled (APP_CONSOLE_ENABLE is off)");
    return ESP_OK;
#endif
}
