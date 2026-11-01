---
name: trigger-android-build-1
description: A manifest merger failure routes to android-build.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After I added a new analytics SDK the debug build of our app fails:

```
> Task :app:processDebugMainManifest FAILED
Manifest merger failed : Attribute application@allowBackup value=(false) from AndroidManifest.xml:12:9-36
is also present at [com.example:analytics:3.1.0] AndroidManifest.xml:9:9-35 value=(true).
Suggestion: add 'tools:replace="android:allowBackup"' to <application> element at AndroidManifest.xml:8:5-30:19 to override.
```

Is the suggestion safe to apply, and where exactly does it go?
