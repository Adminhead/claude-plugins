---
name: trigger-java-testing-1
description: A "No tests found" Gradle failure routes to java-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm trying to run just one test class in our order-service module and it won't go:

```
$ ./gradlew :order-service:test --tests OrderServiceTest

> Task :order-service:test FAILED

FAILURE: Build failed with an exception.
* What went wrong:
Execution failed for task ':order-service:test'.
> No tests found for given includes: [OrderServiceTest](--tests filter)
```

The class is at order-service/src/test/java/com/acme/order/OrderServiceTest.java and has a bunch of @Test methods. Why isn't it picked up?
