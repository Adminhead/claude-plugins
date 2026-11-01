---
name: trigger-android-testing-2
description: A "not mocked" android.util.Log failure in a local test routes to android-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My repository unit test, in app/src/test, fails on the first line that touches the class:

```
java.lang.RuntimeException: Method d in android.util.Log not mocked. See https://developer.android.com/r/studio-ui/build/not-mocked for details.
	at android.util.Log.d(Log.java)
	at com.acme.data.UserRepository.refresh(UserRepository.kt:41)
```

UserRepository calls Log.d and also reads a SharedPreferences value. What's the right way to get this test green?
