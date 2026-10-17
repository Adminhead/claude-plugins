---
name: trigger-interop-crash
description: "An intermittent AccessViolationException at a native call should load dotnet-native-interop."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our .NET 8 worker crashes every few hours on Linux with System.AccessViolationException inside a call to libsensor. Declarations:

```csharp
[DllImport("sensor")] static extern bool sensor_poll(IntPtr dev, long timeoutMs, ref Reading r);
[DllImport("sensor")] static extern void sensor_set_callback(IntPtr dev, ReadingCallback cb);
```

The callback is registered once at startup with a lambda. Works fine on Windows. What's wrong?
