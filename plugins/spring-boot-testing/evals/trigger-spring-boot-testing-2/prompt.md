---
name: trigger-spring-boot-testing-2
description: A Spring test suite that rebuilds its application context over and over should load the spring-boot-testing skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our integration test module takes 11 minutes on CI. i turned on debug logging for the test context cache and the log shows "Storing ApplicationContext" about 40 times in one run, once per test class pretty much. most of the classes are `@SpringBootTest` with a different `@MockBean` or two on each, a few have their own `@TestPropertySource`, and 6 of them have `@DirtiesContext` on the class. Spring Boot 3.5. how do i get this down?
