---
type: regex
pattern: 'useMemo|useCallback|React\.memo|\bmemo\('
match: not_contains
target:
  source: file
  path: src/ProductList.tsx
---
