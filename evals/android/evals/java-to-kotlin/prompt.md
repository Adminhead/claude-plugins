---
name: java-to-kotlin
description: "Converting a Java class to Kotlin belongs to kotlin, not java."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Convert this Account.java to idiomatic Kotlin:

```java
public class Account {
    private final String id;
    private String owner;
    private final List<Transaction> history = new ArrayList<>();
    public Account(String id, String owner) { this.id = id; this.owner = owner; }
    public String getId() { return id; }
    public String getOwner() { return owner; }
    public void setOwner(String o) { this.owner = o; }
    public List<Transaction> getHistory() { return Collections.unmodifiableList(history); }
}
```
