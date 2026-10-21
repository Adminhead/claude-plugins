---
type: regex
pattern: '@Value\('
match: not_contains
target:
  source: file
  path: src/main/java/com/acme/shop/PaymentService.java
---
