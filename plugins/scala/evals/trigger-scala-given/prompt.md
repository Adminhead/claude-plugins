---
name: trigger-scala-given
description: A missing given instance error should load the scala skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm getting this when I try to sort a list of prices in `src/main/scala/Prices.scala` and I can't tell what it wants from me:

```
[error] -- [E172] Type Error: src/main/scala/Prices.scala:14:25
[error] 14 |  val sorted = prices.sorted
[error]    |                             ^
[error]    |No given instance of type Ordering[Money] was found for parameter ord of method sorted in trait SeqOps
```

`Money` is just `case class Money(cents: Long, currency: String)`.
