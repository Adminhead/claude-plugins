---
type: regex
pattern: '@SpringBootTest|@MockBean\b'
match: not_contains
target:
  source: file
  path: src/test/java/com/acme/orders/OrderControllerTest.java
---
