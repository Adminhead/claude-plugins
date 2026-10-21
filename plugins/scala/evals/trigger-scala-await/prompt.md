---
name: trigger-scala-await
description: A Future and Await deadlock should load the scala skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our service freezes under load, thread dump shows everything parked in Await.result. this is the code in OrderService.scala:

```scala
def total(ids: List[Long])(implicit ec: ExecutionContext): Future[BigDecimal] =
  Future.traverse(ids)(id => repo.find(id)).map { orders =>
    orders.map(o => Await.result(pricing.quote(o), 5.seconds)).sum
  }
```

why does it hang and how should it look?
