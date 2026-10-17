---
name: negative-godot-export-publish
description: Uploading already-built files to itch.io with butler does not route to godot-export.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I already have my game's Windows, Linux and HTML5 builds in a dist/ folder. How do I push each one to its own itch.io channel with butler, with a proper version number, and make the HTML5 one playable in the browser on the itch page?
