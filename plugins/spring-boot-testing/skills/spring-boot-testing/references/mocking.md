# Mocking beans

`@MockitoBean` creates a Mockito mock and registers it in the context, replacing any bean of that type (or name). It lives in `org.springframework.test.context.bean.override.mockito` and works in slices and `@SpringBootTest`. It replaces `@MockBean`, which Boot 4 removed.

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
  @MockitoBean OrderService orderService;
  @MockitoBean(name = "primaryClock") Clock clock;   // select by name when several beans share a type
}
```

## Stubbing and verifying

Use BDDMockito for readable tests.

```java
given(orderService.findById(1L)).willReturn(order);
given(orderService.findById(999L)).willThrow(new OrderNotFoundException(999L));
doThrow(new IllegalStateException()).when(orderService).cancel(any());   // for void methods

then(orderService).should().findById(1L);
then(orderService).should(never()).delete(any());
```

Verify interactions with side effects (a message sent, a payment charged). Do not verify plain queries; stubbing already proves them. Mocks reset after each test method.

## Spies and test beans

- `@MockitoSpyBean` wraps the real bean. Stub with `doReturn(x).when(spy).method()` so the real method is not called while stubbing.
- `@TestBean` registers a hand-written fake from a static factory method on the test class. Prefer it when a fake is clearer than a mock.

```java
@SpringBootTest
class CheckoutTest {
  @MockitoSpyBean PaymentGatewayClient payments;
  @TestBean Clock clock;

  static Clock clock() { return Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC); }
}
```

## Gotchas

- A mocked prototype or scoped bean becomes a singleton mock, per the Framework reference. Do not rely on one mock per injection.
- Each distinct set of `@MockitoBean` fields is a new context-cache key. See [context-caching.md](context-caching.md).
- `@MockitoBean` needs the Spring context. For a plain unit test use Mockito's `@Mock` with `@ExtendWith(MockitoExtension.class)`, which is `java-testing` territory.
- Mocking the class under test or a value object makes the test assert the mock. Mock boundaries (repositories, clients, clocks), not logic.
