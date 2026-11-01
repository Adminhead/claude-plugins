---
name: not-play-testflight
description: Hard negative. An iOS TestFlight upload question should not load the play-publishing skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our iOS build is stuck at "Processing" in App Store Connect after I uploaded the .ipa with Transporter. How long should TestFlight processing take, and what can make it hang?
