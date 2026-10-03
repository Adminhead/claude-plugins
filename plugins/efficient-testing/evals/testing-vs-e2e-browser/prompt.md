---
name: testing-vs-e2e-browser
description: A Playwright journey spec routes to efficient:e2e-testing, not testing.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Playwright spec for our checkout journey (add item to cart, enter shipping, pay with a test card, see the confirmation page). It flakes on CI but passes locally, so make it robust.
