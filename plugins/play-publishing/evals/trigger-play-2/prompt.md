---
name: trigger-play-2
description: Shipping a release bundle to the internal track from CI should load the play-publishing skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

I want CI to push each tagged release bundle of our Android app to the internal testing track in Google Play. Nothing is set up for that yet. How should I wire it?
