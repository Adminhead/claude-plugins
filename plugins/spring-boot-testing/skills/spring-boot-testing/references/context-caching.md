# Context caching

The TestContext framework caches each built `ApplicationContext` under a key and reuses it for every test class with the same key. Building a context is the dominant cost in a Spring suite.

## What forms the key

The merged configuration of the test class:

- the slice annotation and its attributes (`@WebMvcTest(OrderController.class)` vs `@WebMvcTest`)
- `@ContextConfiguration`, `@SpringBootTest(classes = ...)`, `@Import`, `@TestConfiguration` imports
- `@ActiveProfiles`, `@TestPropertySource`, `@SpringBootTest(properties = ...)`, `@DynamicPropertySource`
- the set of `@MockitoBean`/`@MockitoSpyBean` fields (types and names)
- `@AutoConfigureMockMvc` and other `@AutoConfigure*` attributes
- Not part of the key: `@WithMockUser` and other per-test security annotations

A different value in any of them is a new context. Two `@WebMvcTest` classes that mock different services are two contexts.

## Find the misses

```properties
logging.level.org.springframework.test.context.cache=DEBUG
```

Run the suite and count `Storing ApplicationContext` lines (misses) against `Retrieved` lines (hits). Group the misses by what differs. The default cache holds 32 contexts and evicts least recently used; raise it with `spring.test.context.cache.maxSize` if you legitimately have more.

## Fix the misses

1. Remove `@DirtiesContext`. It closes the context after the class or method. Reset data with `@Transactional` rollback, `@Sql`, or explicit cleanup instead. Keep it only when a test changes bean definitions or a singleton's internal state that cannot be reset.
2. Align `@MockitoBean` sets. Put the shared mocks in an abstract base class, or in one `@TestConfiguration` with mock beans, and use the same one everywhere. A class that needs one extra mock gets its own context, so ask whether it can use the shared set.
3. Replace per-class `@TestPropertySource` and `@SpringBootTest(properties=...)` variations with one shared profile or one combined property list.
4. Share one `@TestConfiguration` that declares Testcontainers beans (see [testcontainers.md](testcontainers.md)). A container per class defeats the cache.
5. Prefer slices: a `@WebMvcTest` context is cheap even when it misses.
6. Do not use `@SpringBootTest` where a slice or plain unit test suffices; each full context starts the whole app.

## Boot 4 / Framework 7

Cached contexts that are not in use can be paused (stopping lifecycle beans such as schedulers and listeners) and restarted on reuse. If a test relies on a background `SmartLifecycle` bean staying alive between classes, that assumption breaks.

## Parallel runs

Run test classes in parallel only when they do not mutate shared state; contexts are cached per JVM fork, so more forks means more builds.
