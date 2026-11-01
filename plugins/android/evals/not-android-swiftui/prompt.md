---
name: not-android-swiftui
description: Hard negative. A SwiftUI state reset question should not load the android skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my SwiftUI app a view's @StateObject view model gets recreated and loses its data whenever the parent view re-renders. How do I keep it alive?
