---
name: junit-clock
description: Tests for a calculator that reads the wall clock inject a Clock, parameterize the tiers and never sleep.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill, Bash]
---

I need tests for src/main/java/shop/PriceCalculator.java, written to src/test/java/shop/PriceCalculatorTest.java. It has quantity tiers plus a weekend discount, and last time someone tested this the suite went red every Saturday. Cover every tier, the weekend rule and the invalid quantity. If the class needs a change to be testable, make it.
