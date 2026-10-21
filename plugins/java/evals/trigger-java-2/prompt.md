---
name: trigger-java-2
description: A record whose list changes after construction should load the java skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Weird bug in `src/main/java/billing/Invoice.java`: we build an `Invoice`, hand it to the audit logger, and later the line items on it have changed even though nobody calls anything on the invoice. It's a record so I assumed it was immutable.

```java
package billing;

import java.math.BigDecimal;
import java.util.List;

public record Invoice(String id, List<BigDecimal> lines) {
    public BigDecimal total() {
        return lines.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

The caller does `var items = new ArrayList<BigDecimal>(); var inv = new Invoice("A1", items); items.add(...)` while it keeps building. What's going on and what's the fix?
