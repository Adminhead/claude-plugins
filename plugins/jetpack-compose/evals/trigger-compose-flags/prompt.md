---
name: trigger-compose-flags
description: A card component with many boolean flags should load the jetpack-compose skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

We have an InfoCard in our Android app with showIcon, showSubtitle, isCompact, hasAction, isHighlighted and isLoading parameters, and every new screen adds another. How should I restructure its parameters so it stops growing?
