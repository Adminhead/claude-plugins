# fastlane supply

`upload_to_play_store` is the action; `fastlane supply` is the same through the CLI. Read the repo's `Fastfile` and `Appfile` first.

## Safe lane

```ruby
lane :internal do
  upload_to_play_store(
    track: "internal",
    release_status: "draft",
    aab: "app/build/outputs/bundle/release/app-release.aab",
    json_key: ENV["PLAY_SERVICE_ACCOUNT_JSON"],
    skip_upload_metadata: true,
    skip_upload_images: true,
    skip_upload_screenshots: true
  )
end
```

- `json_key` is a path from the environment; `json_key_data` takes the JSON content from a secret. Never hard-code either.
- Build first with `./gradlew :app:bundleRelease`; the lane uploads, it does not build.

## Dry run

`validate_only: true` sends the edit for validation without committing it. Use it in setup and in review of a lane change.

## Options that change what users see

- `track_promote_to` with `track`: promotes a release; confirm first.
- `rollout: "0.1"`: with `release_status: "inProgress"` makes a staged rollout of 10%.
- `release_status: "halted"` with the `version_code`: halts a rollout.
- `skip_upload_*` flags: omit metadata, images, screenshots, changelogs, APK/AAB and mapping when only part should change.
- `mapping` / `mapping_paths`: deobfuscation files; `version_code` targets an existing release.

## Metadata layout

`fastlane/metadata/android/<locale>/` holds `title.txt`, `short_description.txt`, `full_description.txt`, `changelogs/<versionCode>.txt` and `images/`. `fastlane supply init` downloads the current listing into it; run it before editing so a push does not overwrite newer Console edits.
