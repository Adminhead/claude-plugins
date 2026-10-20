---
name: forgejo-release-routing
description: Cutting a release on Codeberg routes to forgejo-release:forgejo-release.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Cut a v1.4.0 release on our Codeberg repo with notes from the commits since v1.3.0 and attach dist/app.tar.gz.
