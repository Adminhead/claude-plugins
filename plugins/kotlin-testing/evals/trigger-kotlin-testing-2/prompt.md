---
name: trigger-kotlin-testing-2
description: A MockK "no answer found" error routes to kotlin-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My unit test blows up as soon as it calls the code under test:

```
io.mockk.MockKException: no answer found for: UserRepository(#1).load(42, continuation {})
	at io.mockk.impl.stub.MockKStub.defaultAnswer(MockKStub.kt:93)
```

I did write `every { repo.save(any()) } returns Unit` in the setup, and the repo is `mockk<UserRepository>()`. Where does that error come from and how do I fix it?
