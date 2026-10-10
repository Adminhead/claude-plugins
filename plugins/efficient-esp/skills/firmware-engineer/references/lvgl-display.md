# LVGL and Displays

LVGL v8 and v9 are not API-compatible. Read the project's version before writing integration code: `idf_component.yml`, `managed_components/lvgl__lvgl/`, or `lv_version.h`. API names below were checked against the LVGL 9.4 and 8.4 docs.

## Validate the data path first

Before touching draw code, establish:

- Controller (ST7789, ILI9341, GC9A01, ...), interface (SPI, i80, RGB, MIPI-DSI), resolution, and orientation.
- Pixel format the controller expects (RGB565, BGR565, RGB888) and byte order, plus any alignment limit on the update window.
- Buffer requirements: DMA alignment, internal RAM versus PSRAM.

Wrong colors, tint, corrupted lines, and wrong-region updates are usually format, stride, or ownership bugs, not rendering bugs. Keep one documented source-of-truth format at the display boundary, and do not assume a library's default color order matches the panel.

Espressif's `esp_lcd` component provides panel drivers and DMA-aware transfers. A prebuilt LVGL glue component (`esp_lvgl_port`) exists in the component registry. Check its manifest for the IDF and LVGL versions it supports before adopting it.

## Flush callback

v9:

```c
static void flush_cb(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    // send px_map for `area` to the panel, then:
    lv_display_flush_ready(disp);
}
```

v8:

```c
static void flush_cb(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_p)
{
    // send color_p for `area`, then:
    lv_disp_flush_ready(drv);
}
```

- Call `flush_ready` only when the transfer has finished. With DMA, call it from the transfer-done callback (for `esp_lcd`, the panel IO `on_color_trans_done` callback), not right after queueing. Calling it early lets LVGL overwrite a buffer the DMA is still reading.
- The buffer passed in must be DMA-capable for the bus in use.

## Display setup (v9)

```c
lv_display_t *disp = lv_display_create(HOR_RES, VER_RES);
lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
lv_display_set_flush_cb(disp, flush_cb);

#define BPP LV_COLOR_FORMAT_GET_SIZE(LV_COLOR_FORMAT_RGB565)
static uint8_t buf1[HOR_RES * VER_RES / 10 * BPP]; // place per the DMA rules below
lv_display_set_buffers(disp, buf1, NULL, sizeof(buf1), LV_DISPLAY_RENDER_MODE_PARTIAL);
```

Buffer sizes are in bytes and depend on the color format. Do not size them with `sizeof(lv_color_t)` for RGB565, because in v9 `lv_color_t` is a 24-bit color. A second buffer enables rendering during DMA. A full-frame buffer (`LV_DISPLAY_RENDER_MODE_FULL`) in PSRAM is an option when the panel path accepts it.

v8 uses `lv_disp_draw_buf_init()` and `lv_disp_drv_t` (with `hor_res`, `ver_res`, `flush_cb`, and `draw_buf`), and sizes buffers in pixels.

## Color and byte order

RGB565 panels over SPI usually want the high byte first, while the CPU stores the low byte first. If red and blue look swapped or colors are garbled, swap bytes in the pipeline. In v9, call `lv_draw_sw_rgb565_swap(buf, px_count)` in the flush callback, or configure the swap in hardware (the `esp_lcd` panel or the SPI/I80 peripheral where supported). Pick one place to swap, not two. Washed-out or dark output points to the wrong color depth.

## Tick and timing

- v9: `lv_tick_set_cb()` with a function returning milliseconds (for example from `esp_timer_get_time() / 1000`). v8: call `lv_tick_inc()` from a periodic timer.
- Call `lv_timer_handler()` in one task, and sleep for the interval it returns, capped at a few milliseconds so animations stay smooth.

## Threading

LVGL is not thread-safe. Touch LVGL objects only from the task that runs `lv_timer_handler()`, or take one recursive mutex around every LVGL call in every task. Keep the LVGL task from blocking on that mutex while it holds display state. Give the LVGL task a generous stack (8 KB and up, and more for complex widgets), and consider pinning it away from the Wi-Fi core on dual-core chips.

## Memory and speed

- Internal RAM gives the fastest, DMA-safe draw buffers. PSRAM suits large buffers, but DMA support depends on chip and driver. Check `MALLOC_CAP_DMA` behavior for your target and IDF version.
- Raise the SPI clock until artifacts appear, then back off about 10%.
- Invalidate small regions instead of whole screens.

## Pitfalls

| Symptom | Likely cause |
| --- | --- |
| Blank screen | Controller init sequence missing, or `lv_timer_handler()` never runs |
| Red and blue swapped | Byte order or RGB/BGR order mismatch |
| Washed-out colors | Color depth or format mismatch |
| Corrupted lines or random garbage | `flush_ready` called early, buffer not DMA-capable, or stride error |
| Tearing | Single buffer with no completion signaling |
| UI freezes | Mutex deadlock, or the LVGL task blocked |
| Animations stutter | `lv_timer_handler()` called too rarely |
| Stack overflow in LVGL task | Stack too small for the widgets |

## Review checklist

- Controller, interface, pixel format, and byte order are explicit in code or config.
- Flush buffer stays valid until transfer completion, and `flush_ready` fires then.
- Memory placement meets the driver's DMA rules.
- Rotation and window math match the panel config.
- Performance changes are measured and still look right.

Record the working combination (IDF, LVGL, controller, format, bus clock) in the [compatibility record](../templates/compat/esp-framework-compat.lock.example) or the project's notes.
