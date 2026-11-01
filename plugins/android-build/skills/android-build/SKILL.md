---
name: android-build
description: 'Diagnoses and writes Android Gradle Plugin builds. Use for "Manifest merger failed", "Duplicate class found in modules", "Namespace not specified", minSdk conflicts with a library, resource linking failures, 16 KB page size warnings, or ClassNotFoundException or NoSuchMethodError only in the release build (keep rules). Covers the android {} block, build types, flavors, androidComponents, signing, desugaring, KSP and kapt, lint baselines and AGP, Gradle and JDK versions within a major.'
---

# Android build

Fix the error the build reports in the module that reports it, and keep variant names, application IDs and artifacts unless the request changes them.

Not for: AGP 8 to 9 migration (built-in Kotlin, new DSL, kapt move) (`android-skills:agp-9-upgrade`); keep-rule audits, broad or redundant rules and code shrinking (`android-skills:r8-analyzer`); APK or AAB size beyond R8, such as resources, native libraries and ABI splits (`android-performance`); Gradle providers, task wiring, configuration cache and dependency resolution, even inside an Android convention plugin (`gradle`); audits and "check my build" (`gradle-skills:gradle-best-practices`); uploading to Play (`play-publishing`); app code (`android`).

Generic Gradle practice (version catalog, Kotlin DSL, convention plugins, `./gradlew`) is in `gradle`; this skill adds only what AGP changes.

## Orient

1. Read the version catalog, `gradle/wrapper/gradle-wrapper.properties` and `gradle.properties`. Note the AGP, Gradle and Kotlin versions, and any `android.*` flags.
2. For each failing module, find which `com.android.*` plugin it applies (`application`, `library`, `dynamic-feature`, `test`) and its `namespace`, `compileSdk`, `minSdk` and `targetSdk`.
3. Reproduce with the narrowest task, such as `./gradlew :app:assembleDebug --stacktrace`. For manifest problems read `app/build/outputs/logs/manifest-merger-<variant>-report.txt`.
4. Name the variant (build type plus flavors) that fails. Many failures are release-only or flavor-only.
5. Done when you can state the module, the variant and the first error line.

## Authoring

1. Declare one `namespace` per module in the build file; the manifest `package` attribute is gone. `applicationId` belongs to application modules only.
2. Put SDK levels and the Kotlin and AGP versions in the catalog or a convention plugin, so modules agree. `minSdk` of an app must be at least that of every library it uses.
3. Configure variants through `androidComponents { onVariants { ... } }`, not by iterating `applicationVariants` in `afterEvaluate`. Details in [references/dsl.md](references/dsl.md).
4. Turn on only the `buildFeatures` a module uses (`buildConfig`, `viewBinding`, `compose`, `resValues`); each is off by default in current AGP.
5. Signing configs read the store path, passwords and alias from environment variables or `~/.gradle/gradle.properties`. Never write a keystore, a password or a `keystore.properties` into the repo; if one is already committed, say so and stop at telling the user to rotate it.
6. Done when `./gradlew :app:assembleDebug` and the variant you touched assemble.

## Diagnosis

1. Match the first error in [references/errors.md](references/errors.md): manifest merger, duplicate class, namespace, resource linking, `minSdk` conflicts, 16 KB alignment, lint.
2. For a crash that happens only in the release variant, follow [references/release-crashes.md](references/release-crashes.md). Never fix it by setting `isMinifyEnabled = false`, and never add `-keep class **` or a whole-package keep.
3. Change one thing, rebuild the failing variant, and stop when it passes. Do not clean up unrelated warnings.

## Upgrades within a major

Pick the AGP, Gradle, JDK and Kotlin set from the compatibility table, not from "latest". Then hand the wrapper change to `gradle-skills:gradle-wrapper-upgrade` and name the exact Gradle version, because it picks the latest release when none is named and does not check AGP. See [references/upgrades.md](references/upgrades.md). For targetSdk, link the Play target API page rather than restating its numbers.

## Boundaries

- Do not commit keystores, passwords, `local.properties` or Play service-account JSON.
- Do not raise `compileSdk` or `targetSdk` as a side effect of a build fix; they change runtime behavior.
- Do not edit generated or merged output under `build/`.
