# Configuration cache

Read this when a message mentions the configuration cache, or when a build passes without `--configuration-cache` and fails with it.

Gradle 9 leaves the configuration cache off by default (verified 2026-10-20). Turn it on in `gradle.properties` only when the user asks or the build already sets it:

```properties
org.gradle.configuration-cache=true
```

## What the cache stores

Gradle serializes the task graph after configuration. A later run skips configuration and runs the tasks from that stored graph. Anything a task action reads from the `Project`, `Gradle` or `Settings` objects at execution time is therefore unavailable, and the build reports a problem.

## Common violations

| Code in a task or `doLast`/`doFirst` | Fix |
| --- | --- |
| `project.version`, `project.name`, `project.file(...)` | Read it into a `val` at configuration time, outside the action, or pass a `Property`/`Provider` as an input |
| `providers.provider { project.version }` read in the action | Still fails: the lambda runs when the action calls `.get()`, which is execution time. Read `project` into a `val` in the `register` block instead |
| `project.exec { }` or `project.copy { }` | Use the injected `ExecOperations` or `FileSystemOperations` service |
| Referencing another task object's fields (`other.someTask.outputs`) | Wire the output as an input with `dependsOn` or a provider |
| `System.getenv("X")` inside the action | `providers.environmentVariable("X")` at configuration, captured as an input |
| A lambda that captures `this` script object | Capture only the values the action needs |

Example that fails only with the cache on:

```kotlin
tasks.register("printVersion") {
    doLast { println(project.version) }   // project read at execution time
}
```

Fixed, capturing the value during configuration:

```kotlin
tasks.register("printVersion") {
    val v = project.version.toString()
    doLast { println(v) }
}
```

## Reading the problem report

The output names each problem with the task path and the offending type. Open the HTML report in `build/reports/configuration-cache/`. Fix one class of problem, rerun with the cache on, and repeat until the report is empty. Do not add `notCompatibleWithConfigurationCache` to a task just to silence the report unless the task cannot be fixed; say so in the summary when you do.

## Checking the fix

1. `./gradlew --configuration-cache <task>` stores the entry.
2. Run the same command again. It should report "Reusing configuration cache".
3. Run a task that changed a value read from the properties and confirm the output still follows the input.
