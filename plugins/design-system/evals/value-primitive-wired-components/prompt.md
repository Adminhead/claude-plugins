---
name: value-primitive-wired-components
description: Value case. Component CSS with no hardcoded colors but wired to palette steps while a role layer sits unused in the token file.
tags: [value]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

can you do a design token audit of src/? we think we're fully tokenised, since grep finds no hex or rgb in any component stylesheet. I mainly want a sanity check before I tell the team it's done. keep the report short, findings with counts and file names.
