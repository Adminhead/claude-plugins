---
name: not-play-framework-spring
description: A Spring controller question must not load the play-framework skill.
tags: [trigger, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Spring Boot app this `@RestController` returns 200 with an empty body for `GET /api/users/42` when the user doesn't exist. I want a 404 with a JSON error instead. Which annotation or class should handle that?

```java
@RestController
@RequestMapping("/api/users")
class UserController {
    private final UserService users;
    UserController(UserService users) { this.users = users; }

    @GetMapping("/{id}")
    User get(@PathVariable long id) { return users.find(id).orElse(null); }
}
```
