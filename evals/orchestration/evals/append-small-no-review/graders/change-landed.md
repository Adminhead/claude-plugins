---
type: regex
pattern: '^(?=[\s\S]*(function\s*\*?\s*searchUsers\b|(const|let|var)\s+searchUsers\b))(?=[\s\S]*(export\s+(async\s+)?(function\s*\*?\s*|const\s+|let\s+)searchUsers\b|export\s*\{[^}]*\bsearchUsers\b))'
target: { source: file, path: src/db/users.js }
---
