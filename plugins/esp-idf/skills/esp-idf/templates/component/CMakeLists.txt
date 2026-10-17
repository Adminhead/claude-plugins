# esp_driver_gpio exists from ESP-IDF 5.3; on older releases require `driver`.
idf_component_register(
    SRCS "blinker.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_driver_gpio
)
