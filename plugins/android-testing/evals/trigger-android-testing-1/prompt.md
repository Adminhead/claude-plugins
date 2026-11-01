---
name: trigger-android-testing-1
description: A "No compose hierarchies found" failure routes to android-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our instrumented test for the settings screen dies right away:

```
java.lang.IllegalStateException: No compose hierarchies found in the app. Possible reasons include: (1) the Activity that calls setContent did not launch; (2) setContent was not called; (3) setContent was called before the ComposeTestRule ran. If setContent is called by the Activity, make sure the Activity is launched after the ComposeTestRule runs
	at androidx.compose.ui.test.junit4.ComposeRootRegistry.getComposeRoots
```

The test is app/src/androidTest/java/com/acme/settings/SettingsScreenTest.kt. It uses createEmptyComposeRule() and then calls onNodeWithTag("dark_mode_switch").performClick(). What's wrong?
