# Gradle error symptoms

Match the first error line. Each row names the phase, the usual cause and the reference to read next.

| Symptom (message contains) | Phase | Usual cause | Next |
| --- | --- | --- | --- |
| `invocation of 'Task.project' at execution time is unsupported` | execution | a task action reads `project` | config-cache.md |
| `Configuration cache problems found in this build` | configuration or execution | a value that the cache cannot store | config-cache.md |
| `Could not resolve <group:artifact>` with `Required by:` | resolution | version conflict or a missing repository | dependencies.md |
| `No matching variant of ... was found` | resolution | platform (BOM) used as a regular library, or the reverse | dependencies.md |
| `Unresolved reference: libs` (or a `libs.x.y` accessor) in a `.kts` file | configuration | alias missing from `gradle/libs.versions.toml`, or dashes in the alias | Authoring step 2 in SKILL.md |
| `Could not determine the dependencies of task ':x:y'` | configuration | a `dependsOn` names a task or project path that does not exist | run `./gradlew projects` and `./gradlew tasks --all` |
| `Gradle requires JVM` (with a minimum version) | startup | the JDK running Gradle is older than the wrapper needs | Orient step 4; Gradle 9 needs 17 or later |
| `Toolchain installation ... does not provide` or a toolchain download failure | configuration | the requested JDK is not installed and auto-provisioning is off or blocked | set a local JDK or the auto-download property the team uses |
| Task reruns or skips unexpectedly, or a cache hit reproduces stale output | execution | undeclared task input or output | Diagnosis step 4 in SKILL.md |
| `Circular dependency between the following tasks` | configuration | two tasks depend on each other through `mustRunAfter`, `finalizedBy` or inputs | break the cycle in the task that adds the extra edge |

Messages vary by Gradle version; match on the stable part and check the full output with `--stacktrace` before deciding the phase.
