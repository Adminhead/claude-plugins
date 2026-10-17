---
name: route-e2e-vs-unit
description: A Playwright journey spec routes to e2e-testing, not unit-testing.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Playwright spec for our checkout journey (add item to cart, enter shipping, pay with a test card, see the confirmation page). It flakes on CI but passes locally, so make it robust.
