---
type: regex
pattern: 'headers(?::[^=,)]*)?\s*=\s*None|dict\(headers|headers\.copy\(\)|\{\s*\*\*\s*\(?headers|headers or \{\}'
weight: 2
target: last_message
---
