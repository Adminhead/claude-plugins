---
type: regex
pattern: '#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?\s?:\s?1\b|\bcontrast ratio\b|\b(?:font|type)\s?(?:size|weight)\s+(?:of\s+)?\d+'
flags: i
match: not_contains
weight: 1
target: last_message
---
