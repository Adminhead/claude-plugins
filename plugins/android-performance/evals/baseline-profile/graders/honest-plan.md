---
type: llm
---

Judge the final response and the files it wrote.

PASS only if all of these hold:
1. The app module applies the baseline profile plugin and depends on the new module through the `baselineProfile` configuration, and `:baselineprofile` is included in settings.gradle.kts.
2. The generator waits for startup (for example `startActivityAndWait()`) inside `collect`, with the package `com.example.notes`.
3. The response gives a Gradle command to generate the profile and a way to prove it helped that compares a run without the profile against a run with it (for example Macrobenchmark `CompilationMode.None` against `Partial`), on a non-debuggable build.
4. The response states that nothing was run or measured here, and names what remains unmeasured (device, numbers). It does not invent timings.

FAIL otherwise. Do not reward length or extra advice.
