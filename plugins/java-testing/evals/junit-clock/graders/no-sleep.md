---
type: regex
pattern: 'Thread\.sleep'
match: not_contains
target:
  source: file
  path: src/test/java/shop/PriceCalculatorTest.java
---
