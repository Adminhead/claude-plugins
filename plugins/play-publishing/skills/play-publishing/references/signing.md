# Signing keys, mapping files and symbols

## Two keys

- **App signing key:** signs the APKs Google serves to users. With Play App Signing (required for new apps published as AABs) Google holds it. It cannot be changed casually.
- **Upload key:** signs the AAB you upload. Google verifies it, then re-signs with the app signing key. This is the key in your keystore and CI.

Error "The Android App Bundle was signed with the wrong key": the upload used a keystore whose certificate fingerprint differs from the registered upload key. Compare SHA-1 fingerprints (`keytool -list -v -keystore <path> -alias <alias>`, which prompts for the password; never pass it on the command line in shared logs) with Play Console > Test and release > App integrity > App signing.

## Lost or leaked upload key

Only the Play Console account owner can do this; give the steps, do not attempt them.

1. Generate a new upload key and keystore outside the repo; export its certificate (`keytool -export -rfc ...` to a `.pem`).
2. In Play Console, open the app's App signing page and use "Request upload key reset" (check the current Play Console Help wording), attaching the `.pem`.
3. Wait for Google's confirmation, then switch the keystore in CI secrets and delete the old one.
4. If the key leaked, also rotate every secret stored beside it and review recent uploads.

Without Play App Signing, a lost app signing key cannot be recovered; that is the case for apps still on legacy signing.

## Gradle signing config

Read credentials from the environment so nothing sits in the build script:

```kotlin
signingConfigs {
    create("release") {
        storeFile = System.getenv("UPLOAD_KEYSTORE")?.let(::file)
        storePassword = System.getenv("UPLOAD_STORE_PASSWORD")
        keyAlias = System.getenv("UPLOAD_KEY_ALIAS")
        keyPassword = System.getenv("UPLOAD_KEY_PASSWORD")
    }
}
```

In CI, write the keystore from a base64 secret to a runner temp path and delete it after the job. Signing config errors beyond this belong to `android-build`.

## Mapping and native symbols

- R8 `mapping.txt` is included in the AAB by AGP, so Play deobfuscates crashes automatically. For a separate upload, Play Console > the release > Deobfuscation files; fastlane `supply` takes `mapping`, GPP uploads it with the bundle.
- Native symbols: set `ndk { debugSymbolLevel = "SYMBOL_TABLE" }` (smaller) or `"FULL"` in the release build type so the AAB carries them. Otherwise upload the symbols zip in the same Play Console section.

## Local APK sets

`bundletool build-apks --bundle=app.aab --output=app.apks --ks=<keystore> --ks-key-alias=<alias>` then `bundletool install-apks --apks=app.apks`. Pass passwords with `--ks-pass=env:VAR` and `--key-pass=env:VAR`, never as literals.
