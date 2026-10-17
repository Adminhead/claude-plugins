# Memory and Code Size

## Model

- Internal RAM is small and shared by stacks, drivers, Wi-Fi/BLE, and TLS. Wireless and TLS raise pressure sharply.
- PSRAM (on some modules) has higher latency than internal RAM, restricted DMA use, and does not suit ISR or timing-critical paths. Whether a driver accepts PSRAM buffers depends on the chip and driver.
- Use `heap_caps_*` when the memory class matters. Throughput depends on where code and data sit and on the flash and PSRAM mode, not only on free bytes.

## Allocation

- Allocate long-lived buffers statically, reuse work buffers across non-overlapping paths, and avoid heap allocation in hot paths. Never allocate in an ISR.
- Variable-size alloc and free cycles fragment the heap. Use fixed-size pools where bounded dynamic behavior is needed.
- DMA buffers use capability flags (`MALLOC_CAP_DMA`, plus `MALLOC_CAP_INTERNAL` where the driver needs it) and must outlive the async transaction.

## Measure

- Stack: `uxTaskGetStackHighWaterMark()` per task during load tests. Large locals, deep call chains, format strings, and parsers grow the stack unexpectedly.
- Heap: `heap_caps_get_free_size()`, `heap_caps_get_minimum_free_size()`, and `heap_caps_get_largest_free_block()` when fragmentation is suspected. Sample before and after each feature starts and at steady state.
- Size: `idf.py size` and `idf.py size-components`, then the linker map in `build/` when the component view is not enough.

## Code-size levers

From the ESP-IDF size guide (v6.0):

- `CONFIG_COMPILER_OPTIMIZATION` set to size (`-Os`). `-O2` occasionally shrinks code too. Higher optimization can expose undefined behavior that was latent.
- Lower `CONFIG_LOG_DEFAULT_LEVEL` to drop log strings from the binary.
- `CONFIG_COMPILER_OPTIMIZATION_ASSERTION_LEVEL`: choose `ASSERTIONS_SILENT` to drop assertion strings. A failed assert still aborts, and you find the line from the address.
- Leave `CONFIG_COMPILER_CXX_EXCEPTIONS`, `CONFIG_COMPILER_CXX_RTTI`, and stack-check mode "Overall" off.
- Drop components and protocols you do not use. An unused dependency can pull in surprising code.

## Data

- Make read-only tables `const` so they stay in flash.
- Use packed structs only for on-wire or on-flash layouts, and `static_assert` their sizes. Packing hot-path structs costs alignment speed.
- Use ring buffers or stream buffers for byte streams, and note buffer ownership where it crosses tasks.
- Small persistent state goes in NVS. Write-heavy data needs a wear-aware layout. Large assets may belong in a filesystem partition.
- Growing code eats OTA slot headroom, so recheck [partitions](partitions-and-sdkconfig.md) when size changes.
