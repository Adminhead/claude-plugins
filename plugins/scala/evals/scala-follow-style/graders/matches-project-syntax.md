---
type: llm
focus:
  source: file
  path: src/main/scala/shapes/Shapes.scala
---
The project compiles with `-no-indent` on Scala 3, and the existing code uses `sealed trait`, `object Shape { ... }` and braces everywhere.

PASS only if ALL of these:
1. `Triangle` exists as a case class with a base and a height, extends `Shape`, and has an `area`.
2. `describe` exists in the `Shape` companion and returns a String naming the kind of shape and its area.
3. Every new block uses braces, in the same style as the existing code. There is no indentation-based body (no definition header ending in `:`, no `end` markers).
4. The new code keeps the `sealed trait` plus case classes layout, not an `enum` rewrite of the existing hierarchy.
FAIL otherwise. Do not reward length.
