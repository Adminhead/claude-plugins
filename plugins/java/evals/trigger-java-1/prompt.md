---
name: trigger-java-1
description: A sealed-type switch throwing MatchException should load the java skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We upgraded our shared `shapes-lib` jar last sprint (it now includes a `Hexagon`) and now prod is throwing `java.lang.MatchException` out of `AreaCalculator.area()`. Nothing failed at compile time. `Shape` lives in the library; here's our code, in `src/main/java/geo/AreaCalculator.java`:

```java
package geo;

import shapes.Circle;
import shapes.Shape;
import shapes.Square;

class AreaCalculator {
    static double area(Shape s) {
        return switch (s) {
            case Circle c -> Math.PI * c.r() * c.r();
            case Square q -> q.side() * q.side();
        };
    }
}
```

Why did this slip through and how should I fix it?
