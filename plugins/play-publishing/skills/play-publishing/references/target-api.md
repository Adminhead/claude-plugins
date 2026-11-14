# Target API level requirement

Google Play sets a minimum target API level for new apps and app updates, and a lower one for existing apps to stay available to new users on newer Android versions. Wear OS, Android Automotive OS, Android TV and Android XR have their own, lower minimums. The levels and deadlines change roughly every year, and extensions are offered through Play Console. Permanently private apps for a single organization are exempt.

Before stating any level or deadline, fetch the current requirement from https://support.google.com/googleplay/android-developer/answer/11926878 (Play Console Help, "Target API level requirements for Google Play apps"); the overview at https://developer.android.com/google/play/requirements/target-sdk defers to it. Name the page and the date you fetched it. If the pages disagree, say so and send the person to Play Console.

## Notes

- Check whether an extension date is inclusive in Play Console before treating it as the last day.
- Raising `targetSdk` means working through the behavior changes of each skipped API level; that is an `android-build` and `android` task.
