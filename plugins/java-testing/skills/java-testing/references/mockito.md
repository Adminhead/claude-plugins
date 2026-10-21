# Mockito

Contents: setup, strict stubs, captors and spies, static and constructor mocks, the Java 21+ agent.

## Setup

```java
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {
    @Mock PaymentGateway gateway;
    @InjectMocks PaymentService service;   // constructor injection; prefer building it by hand when it has more than two collaborators
}
```

Use `@Mock` fields with the extension; call `Mockito.mock(...)` in plain setup code only when a test needs a mock configured differently.

## Strict stubs

- The extension defaults to strict stubs: an unused stub raises `UnnecessaryStubbingException`, and a stub called with different arguments raises `PotentialStubbingProblem`.
- Fix the cause: remove the dead stub, or correct the argument the code actually passes. Don't add `@MockitoSettings(strictness = LENIENT)` to a whole class. Use `lenient().when(...)` only for a shared setup stub that some tests legitimately skip.
- Stub with `when(x.call()).thenReturn(v)`; for `void` methods and spies use `doThrow(...).when(x).call()`.
- Use argument matchers for all arguments or none (`eq("a")` next to `any()`); mixing raw values and matchers fails.

## Verify and capture

- Prefer asserting a result. Verify a call only when it is the observable effect: `verify(publisher).publish(captor.capture())`.
- `ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);` then assert on `captor.getValue()` with AssertJ.
- `verifyNoMoreInteractions` makes tests brittle; use it only for "must not call" guarantees, or `verify(x, never())`.

## Spies and finals

- A spy (`@Spy`, `spy(obj)`) wraps a real object; a partial mock is a sign the class does two jobs. Prefer extracting the collaborator.
- With the inline mock maker (Mockito 5 default) final classes and methods can be mocked, but don't mock types you don't own when a small adapter interface is clearer.

## Static and constructor mocking

```java
try (MockedStatic<UUID> uuid = mockStatic(UUID.class)) { ... }       // always close; thread-local
try (MockedConstruction<Mailer> m = mockConstruction(Mailer.class)) { ... }
```

Treat these as a last resort for legacy code. For `now()` and random IDs, inject a `Clock` or a `Supplier` instead.

## Java 21+ agent

Verified on 2026-10-20 against the Mockito 5 javadoc: from Java 21 the JDK restricts libraries attaching an agent to their own JVM, so the inline mock maker may not work without explicit setup, and the JVM always prints a warning ("Mockito is currently self-attaching..." or the dynamic agent loading warning). Configure the agent so no self-attach happens.

Gradle (Kotlin DSL; the `CommandLineArgumentProvider` keeps tasks relocatable):

```kotlin
val mockitoAgent = configurations.create("mockitoAgent")
dependencies {
    testImplementation(libs.mockito)
    mockitoAgent(libs.mockito) { isTransitive = false }
}
abstract class MockitoAgentProvider : CommandLineArgumentProvider {
    @get:InputFiles @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val agentJar: ConfigurableFileCollection
    override fun asArguments(): Iterable<String> = listOf("-javaagent:${agentJar.asPath}")
}
tasks.test {
    jvmArgumentProviders.add(objects.newInstance<MockitoAgentProvider>().apply { agentJar.from(mockitoAgent) })
}
```

Maven: bind `maven-dependency-plugin:properties`, then in Surefire:

```xml
<argLine>@{argLine} -javaagent:${org.mockito:mockito-core:jar}</argLine>
```

`@{argLine}` must exist when Surefire replaces it late, or the forked VM crashes ("The forked VM terminated without properly saying goodbye"). Define an empty `<argLine/>` property in the POM if JaCoCo doesn't set one.

Stopgap: `-XX:+EnableDynamicAgentLoading` silences the warning, but it is not standardized and a later JDK may prohibit it.

On Java 17 and below there is no warning; leave the build alone.
