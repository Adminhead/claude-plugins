# Partitions and sdkconfig

Treat `sdkconfig`, `sdkconfig.defaults`, and the partition CSV as project artifacts. A partition-table change on a deployed device is irreversible in practice: confirm before it ships to hardware.

## Before changing the layout

Establish the flash size, whether OTA and rollback are needed, NVS size (Wi-Fi credentials, calibration, app config), any filesystem or core-dump partition, and whether a factory app is wanted. Read flash size from `sdkconfig` (`CONFIG_ESPTOOLPY_FLASHSIZE`) or the chip, and state it if you assume it.

## Layout rules

- No OTA: one larger app partition, with NVS and data sized to need. Skip OTA slots you will not use.
- OTA: `otadata` plus `ota_0` and `ota_1` of equal size. Size each slot from `idf.py size` plus headroom (20% is a sensible start) and recheck when the binary grows. Keep a `factory` partition only for a recovery image.
- Anti-rollback wants `ota_0` and `ota_1` with no factory app (per the Kconfig help for `CONFIG_BOOTLOADER_APP_SECURE_VERSION`). See [OTA](ota-workflow.md).
- App partitions align to 64 KB. Offsets must not overlap, and the table must fit the real flash.
- Secure Boot and flash encryption enlarge the bootloader. Check `CONFIG_PARTITION_TABLE_OFFSET` leaves room, and leave offsets empty for the small data partitions (as in the example CSV) so the build places them after a larger table offset.
- Every partition has a reason. Assign leftover space as named headroom or useful capacity instead of copying an example that does not fit the chip. [templates/partitions/ota_16mb.csv](../templates/partitions/ota_16mb.csv) is a 16 MB example that sums to the full flash.
- Point `CONFIG_PARTITION_TABLE_CUSTOM=y` and `CONFIG_PARTITION_TABLE_CUSTOM_FILENAME` at the CSV.

## sdkconfig workflow

1. Read the current `sdkconfig` and the component defaults.
2. Change only the keys the task needs, in `sdkconfig.defaults` (or the target-specific `sdkconfig.defaults.<target>`), so a fresh checkout reproduces the result.
3. An existing `sdkconfig` keeps old values when defaults change. Do not delete it blindly: run `idf.py save-defconfig` and diff the result against `sdkconfig.defaults`, and confirm with the user when they differ or when `sdkconfig` is untracked, since it may hold settings that exist nowhere else. Regenerate only after that.
4. Keep related settings in step: target, flash size, PSRAM, log levels, partition table.
5. Explain each change and show the key and value.

`menuconfig` is a way to discover a key. The deliverable is the key in the defaults file, not "open menuconfig and click".
