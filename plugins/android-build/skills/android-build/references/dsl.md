# Android DSL reference

Verified 2026-11-01 against developer.android.com (AGP 9.5 release notes, shrink-code page).

## Build types and flavors

- `debug` and `release` exist by default. Add types such as `staging` with `initWith(getByName("debug"))` and `matchingFallbacks += "debug"` so libraries without that type still resolve.
- Flavors need at least one dimension: `flavorDimensions += "tier"`, then `productFlavors { create("free") { dimension = "tier" } }`. With two dimensions, list them in priority order; the first wins on resource conflicts.
- Variant names are flavors in dimension order plus the build type: `freeDebug`. Source sets are `src/free`, `src/freeDebug`, `src/debug`.
- A library consumed by a flavored app needs `missingDimensionStrategy("tier", "free")` when it lacks that dimension.

## androidComponents

```kotlin
androidComponents {
    beforeVariants(selector().withBuildType("release")) { it.enable = true }
    onVariants { variant ->
        variant.buildConfigFields?.put("BUILD_TIME", BuildConfigField("String", "\"x\"", null))
    }
}
```

Use `beforeVariants` to disable variants, `onVariants` to read or set properties lazily through `Property` and `Provider` values. Do not call `.get()` on them at configuration time.

## BuildConfig, resValues, features

- `buildFeatures { buildConfig = true }` is required before `buildConfigField` works. `resValues = true` before `resValue`.
- A value that differs per machine or secret comes from `providers.gradleProperty` or `providers.environmentVariable`, never a literal.
- `buildFeatures { compose = true }` also needs the Compose compiler plugin matching the Kotlin version; Compose specifics belong to `jetpack-compose`.

## Desugaring, packaging

- Using `java.time` or other newer APIs below their `minSdk`: `compileOptions { isCoreLibraryDesugaringEnabled = true }` plus `coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:<version from the catalog>")`. Check the current version on Google Maven.
- Duplicate files in the APK (`META-INF/LICENSE*`, `AL2.0`, `LGPL2.1`): `packaging { resources { excludes += setOf("/META-INF/{AL2.0,LGPL2.1}") } }`. Exclude only the named files. Native libraries: `packaging { jniLibs { pickFirsts += "**/libc++_shared.so" } }`.

## Signing

```kotlin
signingConfigs {
    create("release") {
        val path = providers.environmentVariable("RELEASE_STORE_FILE").orNull
        if (path != null) {
            storeFile = file(path)
            storePassword = providers.environmentVariable("RELEASE_STORE_PASSWORD").get()
            keyAlias = providers.environmentVariable("RELEASE_KEY_ALIAS").get()
            keyPassword = providers.environmentVariable("RELEASE_KEY_PASSWORD").get()
        }
    }
}
```

The config must stay unset when the variables are absent so debug builds and CI without secrets still work. Do not print these values in logs or tasks.

## KSP and kapt (outside the AGP 9 migration)

- Prefer KSP for every processor that supports it (Room, Hilt, Moshi codegen); kapt is slower and in maintenance mode. Plugin id `com.google.devtools.ksp`, version in the catalog and matched to the Kotlin version it names.
- Switch one processor at a time: replace `kapt(...)` with `ksp(...)`, remove the `kotlin-kapt` plugin only when no `kapt(` lines remain.
- Generated sources appear under `build/generated/ksp/<variant>/`; add them to nothing by hand.
- Under AGP 9 built-in Kotlin, `org.jetbrains.kotlin.kapt` is incompatible and `com.android.legacy-kapt` is the stopgap. That is the migration; hand off to `android-skills:agp-9-upgrade`.

## Lint

- `./gradlew :app:lintDebug` writes `app/build/reports/lint-results-debug.html`.
- Baseline: `lint { baseline = file("lint-baseline.xml") }`; generating one records existing issues so only new ones fail. Regenerate deliberately, never to hide a new error.
- `lint { abortOnError = true }` stays on for release checks. Suppress a single issue at its site with `@SuppressLint("Id")` or `tools:ignore`, with a comment saying why.
