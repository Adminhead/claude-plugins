---
type: regex
pattern: '^(?=[\s\S]*\bpage\b)(?=[\s\S]*\blimit\b)(?=[\s\S]*\btotal\b)(?=[\s\S]*\b100\b)'
target: { source: file, path: src/routes/users.js }
---
