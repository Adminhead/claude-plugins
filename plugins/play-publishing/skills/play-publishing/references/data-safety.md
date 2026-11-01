# Data safety form drafts

The data safety form (Play Console > App content) declares what the app and its SDKs collect or share. The account owner submits it. This skill drafts answers from evidence; the draft is not a policy audit (`android-skills:play-policy-insights`).

## Collect evidence

1. Manifest permissions in the merged manifest: `./gradlew :app:processReleaseMainManifest`, then read `app/build/intermediates/merged_manifests/release/`. Map them: `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` to location, `READ_CONTACTS` to contacts, `CAMERA` and `RECORD_AUDIO` to photos, video and audio when stored or sent, `READ_MEDIA_*` to files.
2. SDKs from `./gradlew :app:dependencies --configuration releaseRuntimeClasspath`: analytics, crash reporting, ads, auth, payments and attribution SDKs usually collect device or other IDs, app interactions and diagnostics. Check each vendor's published Play data disclosure.
3. Network and storage code: what leaves the device, whether it is encrypted in transit, and whether users can request deletion.

## Draft output

Produce a table: data type, collected or shared, purpose, required or optional, source (permission or SDK), confidence. Mark every row you could not confirm as "needs owner decision" rather than guessing.

## Rules

- Declare what SDKs collect, not just first-party code.
- The form must match the privacy policy and actual behavior; a mismatch is a policy problem.
- Do not submit or edit the form through tooling. Hand the table to the owner.
