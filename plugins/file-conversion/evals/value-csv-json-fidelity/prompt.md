---
name: value-csv-json-fidelity
description: Value case. A CSV export in a legacy encoding with semicolons, leading-zero identifiers and a quoted field containing the delimiter, converted to JSON for an importer.
tags: [value]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

convert contacts.csv to JSON for the importer, and paste the JSON record for Jonas Müller in your reply so I can check it.
