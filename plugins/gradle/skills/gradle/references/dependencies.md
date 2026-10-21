# Dependency resolution

Read this for "Could not resolve", "No matching variant", version conflicts, or a dependency that resolves to a surprising version.

## Find the path

```bash
./gradlew :app:dependencyInsight --configuration runtimeClasspath --dependency jackson-databind
./gradlew :app:dependencies --configuration runtimeClasspath
```

`dependencyInsight` shows every path that requests the module, the version each requests, and the winner. Read the "Selection reasons" lines: `(by constraint)`, `(by conflict resolution)` and `(by rule)` point to different fixes.

Use the configuration the failing task resolves. `compileClasspath` and `runtimeClasspath` often differ.

## Fixes, in order of preference

1. **Platform (BOM).** Import the BOM where the versions are needed: `implementation(platform(libs.some.bom))`. Consumers then get aligned versions without naming each module.
2. **Constraint.** To pin a transitive version without forcing it everywhere, declare `constraints { implementation("group:artifact:1.2.3") { because("...") } }`.
3. **Version alignment** for a family of modules, through a platform or `version` of a shared catalog entry, not repeated literals.
4. **`resolutionStrategy.force`** last. It overrides every request silently, so add a `because` comment and keep it narrow.

## "No matching variant" and platforms

The message lists the attributes the consumer asked for and the ones the candidates offer. Usually one module is a platform (BOM) and the dependency was added as a regular library, or the reverse. Fix the declaration: wrap BOMs in `platform(...)`, and use `enforcedPlatform(...)` only when a BOM must win over transitive requests.

## Repositories

Declare repositories in `settings.gradle(.kts)` with `dependencyResolutionManagement`, and set `repositoriesMode` to `FAIL_ON_PROJECT_REPOS` for new builds. A module that adds its own repository then fails at configuration instead of resolving from an unexpected source. Check which repository served a failing artifact in the `dependencyInsight` output or with `--info` on the failing task.

## Checking the fix

1. Re-run `dependencyInsight` for the module and confirm the winning version.
2. Re-run the original failing task.
3. If the build uses locked dependencies, update the lock file only when the user asks.
