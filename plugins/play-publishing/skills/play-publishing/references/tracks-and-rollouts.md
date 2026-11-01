# Tracks, rollouts and versionCode

## Tracks

- **Internal testing:** fastest, a small tester list, no review wait in most cases. The default for new setups.
- **Closed testing:** named tester groups; use it for QA and pre-launch checks.
- **Open testing:** anyone can join from the store listing.
- **Production:** every user. Uses staged rollout.
- **Internal app sharing:** upload an AAB or APK in Play Console (or via the tooling) to get a shareable link for quick checks. It is not a release and does not use a track.

## Moving a build up

1. Test on internal, then promote the same build (same `versionCode`) to the next track rather than rebuilding.
2. State the application id, the from and to tracks, the `versionCode` and the percentage, then wait for a yes.
3. A new release may enter review, which can take time; do not promise a publish time.

## Staged rollout

- Start production at a small fraction (for example 5 or 10 percent), watch crash and ANR rates in Android vitals, then raise in steps.
- Raising the percentage is a rollout change: confirm each step.
- Halting stops new installs of the release while keeping existing ones. Resume or supersede it with a higher `versionCode`.
- A rollout cannot be reduced; to go back, halt and ship a fixed build with a higher `versionCode`.

## versionCode

- An integer that must increase for every upload, across all tracks of the app. The maximum is 2100000000.
- "Version code N has already been used": find the highest code across tracks in Play Console, set a higher one, rebuild and re-upload. Do not reuse a code for a different binary.
- Derive it from one source (CI run number plus an offset, or a date-based scheme) and never edit it by hand in two places. For ABI splits, keep codes unique per APK.
