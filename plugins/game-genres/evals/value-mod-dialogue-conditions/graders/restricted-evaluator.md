---
type: llm
weight: 2
focus: { source: file, path: dialogue_conditions.gd }
---

The file is a GDScript evaluator for condition strings that come from player-made dialogue packs, which must be treated as untrusted. The only things a condition may do are call `has_flag(name)` and `quest_stage(id)`, read `gold`, use number and string literals, comparisons, `and`, `or`, `not` and parentheses.

PASS only if all of these hold:

1. The evaluator parses and interprets the string itself (a tokenizer and parser, or an equivalent small interpreter). It does not hand the string to an engine facility that can run arbitrary expressions or scripts, such as `Expression`, a generated `GDScript`, or `call()` with a name taken from the string.
2. Anything outside the allowed set is rejected: an unknown identifier, an unknown function name or an unexpected character makes the condition fail (or report an error) instead of being executed or looked up on the autoload by name.
3. A malformed condition does not crash the game: `evaluate` returns false or logs an error.

FAIL otherwise. A comment saying the input is sanitised does not count. Do not reward length.
