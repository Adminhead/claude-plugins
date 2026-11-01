# Build errors

Verified 2026-11-01. Find the first error, not the last "Execution failed" line.

## Manifest merger failed

Read `app/build/outputs/logs/manifest-merger-<variant>-report.txt`; it names the library manifest that conflicts.

| Message | Fix |
| --- | --- |
| `Attribute application@allowBackup value=(false) from AndroidManifest.xml is also present at [lib] value=(true)` | In the app manifest add the attribute plus `tools:replace="android:allowBackup"` and declare `xmlns:tools`. Use `tools:replace` only for the attributes named. |
| `Element ... at AndroidManifest.xml duplicated with element declared at ...` | `tools:node="replace"` on the app's element, or `tools:node="remove"` to drop the library's. |
| `uses-sdk:minSdkVersion N cannot be smaller than version M declared in library` | Raise app `minSdk` to M, or use a version of the library that supports N. Do not use `tools:overrideLibrary` unless the library's code paths are never reached below M. |
| `android:exported needs to be explicitly specified` | Set `android:exported` on each activity, service and receiver with an intent filter. It is true only for components other apps must start. |

## Duplicate class

`Duplicate class X found in modules a-1.0.aar (...) and b-2.0.jar (...)`. Run `./gradlew :app:dependencies --configuration releaseRuntimeClasspath` or `:app:dependencyInsight --configuration releaseRuntimeClasspath --dependency <group>`. Typical causes: a library bundled twice under old and new coordinates (`support-v4` with `androidx.core`; `kotlin-stdlib-jdk7/jdk8` with `kotlin-stdlib`), or a fat jar. Exclude the stale coordinate on the dependency, or align with a BOM. Resolution mechanics belong to `gradle`.

## Namespace not specified

`Namespace not specified. Specify a namespace in the module's build file`. Add `android { namespace = "com.example.feature" }` to that module, taking the value from the old manifest `package`. For a third-party library that still uses `package`, upgrade it; the namespace must not be invented for code you do not own.

## Resource linking

`Android resource linking failed` with `error: resource X not found` or `attribute Y not found`: the resource lives in a library that is not on this module's classpath, or `compileSdk` is lower than the attribute needs. Add the dependency, or raise `compileSdk` only if the attribute is a platform one and the change is wanted. `AAPT: error: resource style/Theme.X ... not found` usually means a missing Material or AppCompat dependency.

## Other

- `Could not find or load main class` or `JDK` errors: AGP needs JDK 17 or newer; check `JAVA_HOME` and `org.gradle.java.home`.
- `Failed to find Build Tools revision`: install the revision AGP defaults to, or set `buildToolsVersion`.
- `D8: Cannot fit requested classes in a single dex file`: set `minSdk` 21 or higher (native multidex), or shrink with R8.
- `Static interface methods ... only supported starting with Android N`: enable core library desugaring or raise `minSdk`.

## 16 KB page-size alignment

Android 15 and later devices may use 16 KB pages. Play requires apps targeting API 35+ to support them; the page lists Feb 1, 2027 for updates (verify before quoting at https://developer.android.com/guide/practices/page-sizes).

1. Without native code there is nothing to do; the warning in APK Analyzer appears only for `.so` files.
2. AGP 8.5.1+ aligns uncompressed libraries; below that upgrade AGP, or set `packaging { jniLibs { useLegacyPackaging = true } }` as a stopgap (larger install size).
3. NDK r28+ builds aligned by default. For r27 and below pass `-Wl,-z,max-page-size=16384` to the linker.
4. A prebuilt third-party `.so` must be updated by its vendor. Find it with `zipalign -v -c -P 16 4 app.apk` or `check_elf_alignment.sh`.
