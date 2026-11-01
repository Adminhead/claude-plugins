---
name: not-android-testing-playwright
description: Hard negative; a flaky Playwright locator must not load android-testing.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Playwright test for the checkout page passes locally but fails in CI about one run in five with "locator.click: Timeout 30000ms exceeded" on the Pay button. The button is rendered after an API call returns. How should I make the locator reliable?
