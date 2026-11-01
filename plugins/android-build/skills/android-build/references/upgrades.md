# Upgrades within a major

Verified 2026-11-01 against https://developer.android.com/build/releases/gradle-plugin (AGP 9.5.0: Gradle 9.6.0, JDK 17, SDK Build Tools 36.0.0, API 37). The page documents the current release only; fetch it again for any other AGP before choosing.

AGP 8 to 9 is not covered here: `android-skills:agp-9-upgrade`.

## Choosing a set

1. Decide the AGP target (a patch or minor in the current major, such as 9.4 to 9.5).
2. On the release-notes page for that AGP read the minimum Gradle, JDK and SDK Build Tools, and the maximum API level (this caps `compileSdk`).
3. Check Kotlin: the Kotlin Gradle plugin version must be supported by that AGP and Gradle; a KSP release is tied to one Kotlin version, so bump them together (KSP version names the Kotlin it needs).
4. Compare with the wrapper. If the current Gradle already meets the minimum, change only AGP in the catalog and sync. If not, you need a wrapper bump to the minimum or newer.
5. For the wrapper, invoke `gradle-skills:gradle-wrapper-upgrade` naming the exact version (for example "upgrade to Gradle 9.6.0"). Without a named version it picks the latest, which may exceed what the AGP has been tested with.
6. Run `./gradlew :app:assembleDebug :app:lintDebug` plus the unit tests before finishing, and read new deprecation warnings. Move only the pieces the warnings require.

## Do not

- Bump `compileSdk` or `targetSdk` to "match" the AGP. `targetSdk` changes behavior and is tied to Play policy; link https://developer.android.com/google/play/requirements/target-sdk and let `play-publishing` own the numbers.
- Use an alpha or beta AGP on a production branch unless asked.
- Restate version numbers from memory; re-read the release notes.
