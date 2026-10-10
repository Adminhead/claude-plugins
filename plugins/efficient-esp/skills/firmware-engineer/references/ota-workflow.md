# OTA, Rollback, Anti-Rollback

Checked against ESP-IDF v6.0 docs. Layout rules live in [partitions](partitions-and-sdkconfig.md).

## Update flow (HTTPS)

`esp_https_ota()` runs the whole download in one call. Use the begin/perform/finish loop when you need progress or an early abort:

```c
#include "esp_https_ota.h"

esp_http_client_config_t http = {
    .url = CONFIG_APP_OTA_URL,                  // your Kconfig symbol
    .crt_bundle_attach = esp_crt_bundle_attach, // or .cert_pem for a pinned certificate
    .timeout_ms = 5000,
};
esp_https_ota_config_t cfg = { .http_config = &http };

esp_https_ota_handle_t h;
esp_err_t err = esp_https_ota_begin(&cfg, &h);
if (err != ESP_OK) { return err; }

while ((err = esp_https_ota_perform(h)) == ESP_ERR_HTTPS_OTA_IN_PROGRESS) {
    // esp_https_ota_get_image_len_read(h) / esp_https_ota_get_image_size(h) give progress
}

if (err != ESP_OK || !esp_https_ota_is_complete_data_received(h)) {
    esp_https_ota_abort(h);
    return err != ESP_OK ? err : ESP_FAIL;
}
err = esp_https_ota_finish(h); // checks image integrity and switches the boot partition
if (err == ESP_OK) { esp_restart(); }
return err;
```

`esp_https_ota_config_t` also has `bulk_flash_erase` (faster for big images, but a long erase can trip the task watchdog), `partial_http_download` with `max_http_request_size`, `buffer_caps`, and `ota_resumption`. For a non-HTTP source, `esp_ota_begin()`, `esp_ota_write()`, `esp_ota_end()`, and `esp_ota_set_boot_partition()` do the same steps by hand; call `esp_ota_abort()` on failure.

Plain HTTP is refused unless `CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP` is on. It defaults to off and is for testing only, because it allows unencrypted transport and fake servers.

## Image authenticity

Without Secure Boot, `esp_https_ota_finish()` checks integrity only, so a valid-looking image from a spoofed server still installs. Add signature checks: `CONFIG_SECURE_SIGNED_APPS_NO_SECURE_BOOT` requires signed app images, and `CONFIG_SECURE_SIGNED_ON_UPDATE_NO_SECURE_BOOT` (on by default once that is set) verifies the signature on every OTA update. This stops network attackers but not someone with physical access, because the bootloader can still be replaced. Secure Boot v2 closes that gap ([security](security-hardening.md)).

## Rollback

Set `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`. A freshly updated image boots as `ESP_OTA_IMG_PENDING_VERIFY`. Run a self-test, then commit or revert:

```c
const esp_partition_t *running = esp_ota_get_running_partition();
esp_ota_img_states_t state;
if (esp_ota_get_state_partition(running, &state) == ESP_OK &&
    state == ESP_OTA_IMG_PENDING_VERIFY) {
    if (self_test_passed()) {
        esp_ota_mark_app_valid_cancel_rollback();
    } else {
        esp_ota_mark_app_invalid_rollback_and_reboot();
    }
}
```

A device that reboots before marking the image valid rolls back to the previous slot, so make the self-test cover what a bad image would break (network, storage, key peripherals), not just "app_main ran".

## Anti-rollback

- `CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK` needs rollback enabled, and rejects images whose secure version is lower than the one recorded in eFuse.
- `CONFIG_BOOTLOADER_APP_SECURE_VERSION` sets the version for this build. It is recorded in eFuse as a count of set bits, with limited bits available. Raising it is a permanent eFuse burn, so confirm before a release does it.
- The Kconfig help says to use an `ota_0` + `ota_1` layout without a factory app.
- Anti-rollback without Secure Boot can be bypassed over serial, since the bootloader is replaceable.
- Enabling it or raising the version is an eFuse burn when the new image first boots, so it follows the confirmation gate in [security](security-hardening.md).
- To avoid downloading a too-old image, compare the new image's `secure_version` with `esp_efuse_check_secure_version()` while the header streams in.

## Failure modes

| Symptom | Likely cause |
| --- | --- |
| Rolls back on every boot | The app never calls `esp_ota_mark_app_valid_cancel_rollback()`, or the self-test fails |
| Always boots `ota_0` | `otadata` erased or missing |
| `ESP_ERR_OTA_VALIDATE_FAILED` | Image corrupt, truncated, or signed with the wrong key |
| HTTPS connect failure | Missing certificate bundle or wrong pinned certificate |
| Download fits no slot | Binary outgrew the slot; resize from `idf.py size` |
| Update refused after a security release | Image secure version below the eFuse value |

With Secure Boot enabled, sign OTA images with a key the bootloader trusts. Without it, enable the signed-update options above. With flash encryption on, the plain image you serve is encrypted when written.
