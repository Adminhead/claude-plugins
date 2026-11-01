# Gradle Play Publisher

Plugin id `com.github.triplet.play`. Pin a version in the version catalog and check the plugin's README for the installed version's DSL, since property names have changed between majors.

## Safe configuration

```kotlin
plugins { id("com.github.triplet.play") }

play {
    serviceAccountCredentials.set(file(System.getenv("PLAY_SERVICE_ACCOUNT_JSON") ?: "missing.json"))
    track.set("internal")
    releaseStatus.set(com.github.triplet.gradle.androidpublisher.ReleaseStatus.DRAFT)
    defaultToAppBundles.set(true)
}
```

- The JSON path comes from the environment or a gitignored location. Never place the JSON in the repo.
- Draft status means the release is created but not rolled out until someone completes it in Play Console.
- `userFraction` (for example `0.1`) applies to `inProgress` staged rollouts.

## Tasks (variant `release`)

- `publishReleaseBundle`: uploads the AAB to the configured track. Publishes; confirm first.
- `promoteReleaseArtifact`: moves the latest release between tracks (`--from-track`, `--promote-track`). Confirm first.
- `publishReleaseListing`: pushes listing text and images. Confirm first.
- `bootstrapReleasePlayResources` (check `./gradlew tasks --group publishing` for the exact name): downloads the existing listing into `src/<variant>/play/`. Read-only against Play.
- Command-line overrides such as `--track`, `--release-status`, `--user-fraction`: show them in the confirmation.

List the real task names with `./gradlew :app:tasks --all | grep -i play` before running.

## Dry runs

GPP edits are transactional: the plugin opens an edit and commits it at the end. The `commit` property controls that; with `commit.set(false)` the edit is validated by Play but not applied. Confirm the property exists in the installed version before relying on it, and say so when it does not.

## Listing layout

`app/src/main/play/` holds `listings/<locale>/` (title, short and full description, graphics), `release-notes/<locale>/<track>.txt`, and `default-language.txt`. Release notes are per track.

## Common failures

- 403 or "The caller does not have permission": the service account is not invited to the app in Play Console or lacks the release permission.
- "Version code N has already been used": raise `versionCode`; see [tracks-and-rollouts.md](tracks-and-rollouts.md).
- "Only releases with status draft may be created on draft app": the app has never completed a release; keep `DRAFT` or complete the first release in Play Console.
