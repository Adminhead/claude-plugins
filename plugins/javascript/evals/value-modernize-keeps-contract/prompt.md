---
name: value-modernize-keeps-contract
description: Value case. An ES5-era CommonJS module to bring up to current syntax, where several of the obvious rewrites change behaviour or break its callers.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Edit, Write, Skill]
---

src/settings.js is ancient (var, prototypes, function expressions everywhere). bring it up to current JS syntax in place: const/let, class, arrow functions, optional chaining and nullish coalescing where they fit. the rest of the app already uses it.
