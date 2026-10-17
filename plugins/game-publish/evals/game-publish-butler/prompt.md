---
name: game-publish-butler
description: "Uploading builds to itch.io with butler loads game-publish."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I've got Windows, Linux and web exports of my game sitting in build/. How do I get them onto my itch.io page with butler, and set things up so a GitHub Action pushes a new version whenever I tag a release?
