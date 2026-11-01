# MockK

Checked against the MockK documentation, 1.14.x, 2026-11-01. Adapted in part from ECC `kotlin-testing` (MIT).

## Stubbing and verifying

```kotlin
val repo = mockk<UserRepository>()
every { repo.findById("1") } returns User("1", "Alice")          // plain call
coEvery { repo.load("1") } returns User("1", "Alice")            // suspend call
every { repo.save(any()) } just Runs                             // Unit function
coEvery { repo.refresh() } coAnswers { delay(100); Unit }        // suspend answer, virtual delay in runTest
every { repo.find(any()) } throws IOException("down")

verify(exactly = 1) { repo.findById("1") }
coVerify { repo.load("1") }
coVerify(exactly = 0) { repo.delete(any()) }
verifyOrder { a.first(); b.second() }                            // only when order is the behavior
```

Inside one stubbed call, use matchers for every argument or for none (`eq("1")` and `any()` together, not `"1"` and `any()`). Capture with `val slot = slot<User>()` and `capture(slot)`, or `mutableListOf` with `capture(list)`. Reach for `verify` only for side effects that are the behavior (an event published, a row saved); assert returned values and state first.

## "no answer found for: Repo(#1).load()"

The mock is strict: a call without a matching `every`/`coEvery` throws `MockKException: no answer found for: ...`. The message prints the receiver and the actual arguments. Check, in this order:

1. The test never stubbed that call. Add `every`, or `just Runs` for a `Unit` function (a `Unit` function still needs an answer).
2. The arguments differ from the stub: the message shows what was actually passed. Fix the value, or loosen with `any()`.
3. The code under test uses a different instance than the one stubbed (a second `mockk<Repo>()`, or one built after the object under test).
4. `clearMocks(...)`, `unmockkAll()` or `clearAllMocks()` ran after setup and wiped the stubs (in `@BeforeEach`/`@AfterEach` order, or `clearMocks` default also clears answers).
5. The call is on a property getter or a chained mock: `every { a.b.c() }` needs `b` stubbed too, or `mockk(relaxed = true)`, or `every { a.b } returns bMock`.
6. A `spyk` was expected to call through: spies call the real method unless stubbed; a `mockk` never does. Use `spyk` only for partial mocking, and `every { ... } answers { callOriginal() }` to be explicit.
7. `@MockK lateinit var` without `MockKAnnotations.init(this)` (or `@ExtendWith(MockKExtension::class)`) gives an uninitialized property error, not "no answer".

## Relaxed mocks

`mockk<T>(relaxed = true)` answers every unstubbed call with a default (0, empty string, empty list, a chained relaxed mock). It hides missing stubs and makes `verify` the only check. Use it on purpose: for a collaborator whose results the test ignores (a logger, a metrics sink). To relax only `Unit` functions use `mockk<T>(relaxUnitFun = true)`. Don't use `relaxed` to silence a "no answer found" you haven't understood.

## confirmVerified

After the `verify` calls for a mock, `confirmVerified(repo)` fails if the mock received any recorded call that no `verify` matched. It is how a test says "and nothing else happened". Calls made in `every { }` setup are not recorded. Use it at the boundary of side effects (a publisher, a gateway), not on every mock: it turns each added call in production code into a failing test. `excludeRecords { repo.toString() }` removes calls that are noise; `verifyAll { }` checks the listed calls were the only ones.

## Static, object and constructor mocking

Prefer an injected seam. When there is none: `mockkObject(Singleton)`, `mockkStatic("com.acme.UtilsKt")`, `mockkConstructor(Foo::class)`. Always undo them in `@AfterEach`/`@AfterTest` with the matching `unmockkObject`, `unmockkStatic`, `unmockkConstructor` (or `unmockkAll()`), because they are global and leak into other tests. Mocking `java.*` or Android framework classes this way is a sign the test belongs in `android-testing` or needs a seam.

## Coroutines

MockK stubs suspend functions with `coEvery`, which runs the answer in the caller's coroutine; a `delay` inside `coAnswers` is virtual under `runTest`. A `mockk` of a class with a `Flow`-returning function: `every { repo.observe() } returns flowOf(...)` (not `coEvery`, the function itself is not `suspend`).

## Mockito-Kotlin (when the project uses it)

```kotlin
val repo = mock<UserRepository> {
    on { findById("1") } doReturn User("1", "Alice")
    onBlocking { load("1") } doReturn User("1", "Alice")
}
verify(repo).findById("1")
verifyBlocking(repo) { load("1") }
val captor = argumentCaptor<User>(); verify(repo).save(captor.capture())
```

`any()` from `org.mockito.kotlin` returns a non-null value for Kotlin parameters; the Mockito `ArgumentMatchers.any()` returns null and breaks non-null parameters. Use `whenever(x.call()).thenReturn(y)` (not `` `when` ``).
