---
name: play-publishing
description: 'Sets up and runs the release path to Google Play: building the AAB, upload key versus Play App Signing key, Gradle Play Publisher (com.github.triplet.play) and fastlane supply configuration, internal, closed, open and production tracks, staged rollouts and halting, versionCode problems, mapping and native symbol upload, store listing metadata, data safety form drafts, and the target API deadline. Use for symptoms such as "Version code 42 has already been used", "The Android App Bundle was signed with the wrong key", a lost or leaked upload key, a request to ship the release bundle to the internal track from CI, or a question about when targetSdk must be raised for Play.'
---

# Play publishing

Orient first, set up the safe path, and publish only after an explicit yes. This skill never prints, commits or echoes a credential, and never publishes on its own.

Not for: auditing the app against Play policy or finding undeclared data collection (`android-skills:play-policy-insights`), Play Billing upgrades (`android-skills:play-billing-library-version-upgrade`), Engage SDK (`android-skills:engage-sdk-integration`), signing config and build errors in Gradle (`android-build`), and App Store or TestFlight (out of scope).

## Orient

1. Find the release path: `com.github.triplet.play` in a build file or `gradle/libs.versions.toml`, `fastlane/Fastfile` calling `upload_to_play_store` or `supply`, a CI workflow that uploads to Google Play, or manual Play Console uploads. Read it before proposing anything.
2. Find the signing setup (`signingConfigs` in the app module, or environment-driven properties) and the `versionCode` scheme (literal, CI run number, date-based, git count).
3. Ask whether the app is enrolled in Play App Signing. If yes, the key in the repo or CI is the upload key, not the app signing key.
4. Check `.gitignore` covers `*.jks`, `*.keystore`, `keystore.properties`, `local.properties` and the service-account JSON. Report gaps; do not print file contents.
5. Done when you can state the path, the signing source, the versionCode source, the track used today and where each secret lives.

## Secrets

1. Keystores, passwords and the service-account JSON come from CI secrets or files outside the repo, read through environment variables or a gitignored properties file.
2. Never commit, print, `cat` or echo them, including in logs, `--info` output and error reports. If a literal secret is already in a tracked file, move it out, tell the user it is exposed in history, and let them rotate it.
3. The service account needs only the Play Console permissions for the tracks it releases to.
4. Keys and the reset procedure: [references/signing.md](references/signing.md).

## Build and upload

1. Build with `./gradlew :app:bundleRelease`. The AAB is the upload artifact; use `bundletool build-apks` only for local APK sets and device tests.
2. R8 mapping and native debug symbols travel inside the AAB when configured; see [references/signing.md](references/signing.md) for `debugSymbolLevel` and manual upload.
3. Pick the tool already in the repo: [references/gradle-play-publisher.md](references/gradle-play-publisher.md) or [references/fastlane.md](references/fastlane.md). For a new setup with no preference, use Gradle Play Publisher.
4. Done when a validate-only run (GPP `commit.set(false)`, fastlane `validate_only: true`) succeeds, or the user has the exact commands to run. A draft upload still sends the bundle to Play, so it needs the user's yes like any other upload.

## Actions confirm first

Any upload, track promotion, rollout change, halt, listing edit or metadata push changes what users or reviewers see, and most cannot be undone from the repo. Before running one, state:

- what changes (upload, promote, set rollout, halt, listing);
- the application id, track, `versionCode` and rollout percentage;
- the status (draft or completed).

Then wait for a yes. A yes covers that action only. During setup run nothing that publishes; dry runs and validate-only checks are fine.

## Defaults

- New setups target the `internal` track with draft releases. Promotion to closed, open or production is a separate confirmed step.
- Production starts as a staged rollout; widen it in steps and halt on crash or ANR regressions. Steps and commands: [references/tracks-and-rollouts.md](references/tracks-and-rollouts.md).
- `versionCode` only goes up and never repeats across tracks. For "Version code N has already been used", raise it above the highest code in any track, rebuild, and re-upload.

## Store content

1. Listing text, images and changelogs live in the repo in the GPP (`src/<variant>/play/`) or fastlane (`fastlane/metadata/android/`) layout; pull existing ones with the tool's bootstrap or `supply init` before editing.
2. Draft data safety answers from manifest permissions and the SDKs present: [references/data-safety.md](references/data-safety.md). The account owner reviews and submits the form; policy audits go to `android-skills:play-policy-insights`.

## Target API

New apps and updates must target a minimum API level by a deadline set by Play. The rule and dates, with their fetch date, are in [references/target-api.md](references/target-api.md). Re-fetch the page before quoting dates; they change yearly. Raising `targetSdk` itself is an `android-build` task.
