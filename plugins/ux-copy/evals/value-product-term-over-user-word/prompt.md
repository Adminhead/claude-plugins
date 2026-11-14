---
name: value-product-term-over-user-word
description: Value case. An error message requested in the product manager's loose wording, while the product's own strings consistently use a different word for the same thing.
tags: [value]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Edit, Write, Skill]
---

folders can now hold at most 500 items. write the message people see when they try to add item 501 and put it in src/strings/en.json as limits.itemCap, just the string.
