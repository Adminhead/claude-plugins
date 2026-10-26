---
type: regex
pattern: '^(?=[\s\S]*\bpage\b)(?=[\s\S]*\blimit\b)(?=[\s\S]*\btotal\b)(?=[\s\S]*\bdata\b)'
target: { source: file, path: README.md }
---
