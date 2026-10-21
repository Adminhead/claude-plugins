---
name: trigger-java-1
description: A sealed-type switch throwing MatchException should load the java skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We added `Hexagon` to our `Shape` hierarchy last sprint and now prod is throwing `java.lang.MatchException` out of `AreaCalculator.area()`. Nothing failed at compile time. Here's the code, in `src/main/java/geo/AreaCalculator.java`:

```java
package geo;

public sealed interface Shape permits Circle, Square, Hexagon {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}
record Hexagon(double side) implements Shape {}

class AreaCalculator {
    static double area(Shape s) {
        return switch (s) {
            case Circle c -> Math.PI * c.r() * c.r();
            case Square q -> q.side() * q.side();
            default -> 0;
        };
    }
}
```

Why did this slip through and how should I fix it?
