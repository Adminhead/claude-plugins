idf_component_register(
    SRCS "app_console.c"
    INCLUDE_DIRS "include"
    REQUIRES console esp_system esp_timer freertos heap log
)
