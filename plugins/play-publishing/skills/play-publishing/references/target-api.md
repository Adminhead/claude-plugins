# Target API level requirement

Fetched 2026-11-01 from https://developer.android.com/google/play/requirements/target-sdk (page "Last updated 2026-10-28 UTC"). The page defers details to https://support.google.com/googleplay/android-developer/answer/11926878.

Quoted:

> Starting August 31 2026:
>
> * New apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google Play; except for Wear OS and Android Automotive OS apps, which must target Android 15 (API level 35) or higher, and Android TV and Android XR apps, which must target Android 14 (API level 34) or higher.
> * Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running Android OS higher than your app's target API level. Apps that target Android 14 (API level 34) or lower, including Android 13 (API level 33) or lower for Wear OS, Android TV, and Android XR, and Android 12 (API level 31) or lower for Android Automotive OS, will only be available on devices running Android OS that are the same or lower than your app's target API level.
>
> If you need more time to update your app, you'll be able to request an extension to November 1, 2026. You'll be able to access your app's extension forms in Play Console later this year.
>
> Exceptions to these requirements include: Permanently private apps that are restricted to users in a specific organization and intended for internal distribution only.

## Notes

- The page does not say whether an extension to November 1, 2026 is inclusive of that day. Treat the date as the last day only after confirming in Play Console.
- The numbers change each year, usually with a deadline in late summer. Re-fetch the page and update this file with a new fetch date before quoting.
- Raising `targetSdk` means working through the behavior changes of each skipped API level; that is an `android-build` and `android` task.
