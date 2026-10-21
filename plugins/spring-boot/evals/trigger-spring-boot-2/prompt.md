---
name: trigger-spring-boot-2
description: A transaction that does not roll back on a self-call should load the spring-boot skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Orders end up half-saved in prod. `src/main/java/com/acme/orders/OrderService.java`:

```java
@Service
public class OrderService {
  private final OrderRepository orders;      // Spring Data JPA
  private final LineRepository lines;

  public void placeOrder(OrderRequest req) {
    this.persist(req);
  }

  @Transactional
  void persist(OrderRequest req) {
    var order = orders.save(Order.from(req));
    lines.saveAll(Line.from(req, order));   // throws DataIntegrityViolationException sometimes
  }
}
```

When `lines.saveAll` throws, the order row is still in the database. Fix `OrderService`, and check the other services under `src/main/java/com/acme` for the same Spring problem.
