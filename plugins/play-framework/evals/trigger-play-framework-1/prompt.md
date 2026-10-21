---
name: trigger-play-framework-1
description: Play Java blocking JDBC in supplyAsync should load the play-framework skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Java service's `/orders/:id` endpoint hangs under load, CPU is idle and the other endpoints stall too. The controller in `app/controllers/OrderController.java` does this:

```java
public CompletionStage<Result> show(Http.Request request, Long id) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection c = db.getConnection()) {
            return orderRepo.find(c, id);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }).thenApply(o -> ok(Json.toJson(o)));
}
```

What is wrong and how should I fix it?
