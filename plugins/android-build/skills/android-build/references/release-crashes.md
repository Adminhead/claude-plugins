# Release-only crashes

Verified 2026-11-01. A crash that appears only with `isMinifyEnabled = true` (or `optimization { enable = true }` in AGP 9.3+) is R8 removing or renaming something reached by reflection, serialization or a native/JNI name lookup.

Never "fix" it by turning minify off, using `-dontobfuscate` globally, or adding `-keep class com.example.** { *; }`. Those hide the problem and cost the size win. Broad or redundant rule sets are an audit: `android-skills:r8-analyzer`.

## Procedure

1. Reproduce on a device or emulator with the release variant (signed with the debug key locally is fine). Capture the stack trace from `adb logcat -d`.
2. Retrace it. AGP writes `app/build/outputs/mapping/<variant>/mapping.txt`; run `retrace mapping.txt trace.txt` (from `cmdline-tools/latest/bin`), or paste in Android Studio's Analyze Stack Trace. Keep each release's mapping file; without it old traces cannot be read. Studio Logcat retraces automatically in recent versions.
3. Identify the member R8 removed: `ClassNotFoundException`, `NoSuchMethodException`, `NoSuchFieldException`, a Gson/Moshi field that is null, an enum `valueOf` failure, or a missing constructor.
4. Check the library first. Libraries ship `consumer-rules.pro`/embedded rules; confirm the version in use is current and the dependency is not excluded. A library that needs your rule documents it.
5. Add the narrowest rule, or annotate:
   - own class read by reflection or JSON: `@Keep` (`androidx.annotation.Keep`) on the class or member, or `-keepclassmembers class com.example.model.User { <fields>; }`;
   - Gson: keep fields of models and use `@SerializedName` so renaming does not change the JSON names;
   - kotlinx.serialization and Moshi codegen need no rule when the plugin or KSP processor is applied; do not add one without evidence.
6. Put app rules in `proguard-rules.pro` (listed in `proguardFiles`); in AGP 9.3+ a `.keep` file in `src/<variant>/keepRules` also works. Add a comment naming the class and why.
7. Rebuild release, repeat the failing action, and confirm the retraced trace is gone. Do not keep a rule that did not change the outcome.

## Rule shapes, narrow to wide

- `-keepclassmembers class X { <init>(); }`: constructor only.
- `-keep class X`: the class name and nothing else survives under its name.
- `-keepclassmembers,allowobfuscation class X { <fields>; }`: keep fields, allow renaming of the class.
- `-keep class com.example.model.** { *; }`: whole package; last resort and a smell.

Default rules come from `proguard-android-optimize.txt`; AGP 9 dropped `proguard-android.txt` because it disables optimization.
