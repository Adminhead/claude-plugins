# Flags plan

## Slice 2

No design choices remain.

- app/a.py: rename `FLAG_OLD` to `FLAG_NEW`.
- app/b.py: rename `FLAG_OLD` to `FLAG_NEW`.
- app/c.py: rename `FLAG_OLD` to `FLAG_NEW`.

Accept: `grep FLAG_OLD app/` finds nothing.
