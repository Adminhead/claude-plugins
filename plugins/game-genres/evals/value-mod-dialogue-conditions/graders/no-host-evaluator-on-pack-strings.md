---
type: regex
pattern: '^[^#\n]*(?:\bExpression\.new\s*\(|\bGDScript\.new\s*\(|\.set_source_code\s*\(|\bsource_code\s*=)'
flags: im
match: not_contains
weight: 3
target: { source: file, path: dialogue_conditions.gd }
---
