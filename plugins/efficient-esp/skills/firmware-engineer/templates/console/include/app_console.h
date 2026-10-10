#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// Start the service console when APP_CONSOLE_ENABLE is set (Kconfig.projbuild,
// default off); otherwise log that it is disabled and return ESP_OK. When on,
// it registers status, heap, tasks, log, and reboot on the transport selected in
// sdkconfig. Keep it off in production unless the console is auth-gated.
esp_err_t app_console_start(void);

#ifdef __cplusplus
}
#endif
