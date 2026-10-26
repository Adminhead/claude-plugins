---
type: regex
pattern: '^(?=[\s\S]*\b201\b)(?=[\s\S]*\b409\b)(?=[\s\S]*\bPOST\b)'
target: { source: file, path: test/users.test.js }
---
