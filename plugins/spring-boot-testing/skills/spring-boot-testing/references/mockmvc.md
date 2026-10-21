# MockMvcTester and RestTestClient

`MockMvcTester` wraps `MockMvc` with AssertJ. It is auto-configured in `@WebMvcTest` and by `@AutoConfigureMockMvc` when AssertJ is on the classpath. It arrived with Framework 6.2 (Boot 3.4). On older Boot 3 versions, use classic `MockMvc` (`mockMvc.perform(...).andExpect(...)`).

## MockMvcTester

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
  @Autowired MockMvcTester mvc;
  @MockitoBean OrderService orderService;

  @Test
  void returnsOrder() {
    given(orderService.findById(1L)).willReturn(new Order(1L, "PENDING"));

    assertThat(mvc.get().uri("/orders/1"))
        .hasStatusOk()
        .bodyJson()
        .convertTo(OrderResponse.class)
        .satisfies(r -> assertThat(r.status()).isEqualTo("PENDING"));
  }

  @Test
  void createsOrder() {
    given(orderService.create(any())).willReturn(1L);

    assertThat(mvc.post().uri("/orders")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"product":"Laptop","quantity":2}"""))
        .hasStatus(HttpStatus.CREATED)
        .hasHeader("Location", "/orders/1");
  }

  @Test
  void rejectsInvalidBody() {
    assertThat(mvc.post().uri("/orders").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .hasStatus(HttpStatus.BAD_REQUEST);
  }

  @Test
  void mapsDomainErrorToProblemDetail() {
    given(orderService.findById(9L)).willThrow(new OrderNotFoundException(9L));

    assertThat(mvc.get().uri("/orders/9"))
        .hasStatus(HttpStatus.NOT_FOUND)
        .bodyJson().extractingPath("$.title").isEqualTo("Order not found");
  }
}
```

- Prefer `.bodyJson().convertTo(Type.class)` plus AssertJ over string JSON comparison. For lists use `convertTo(new ParameterizedTypeReference<List<OrderResponse>>() {})`-style types per the Spring docs; check the overload your Framework version offers.
- `bodyJson().isLenientlyEqualTo(...)` compares whole documents leniently. `extractingPath("$.x")` reads one value.
- Failures: `assertThat(result).failure().isInstanceOf(...)` asserts an unhandled exception. Async requests complete before assertions, so no special handling is needed.
- Query params: `.param("page", "2")`. Headers: `.header("X-Trace", "abc")`.
- Security post-processors and `csrf()` plug in through `.with(...)`; see [security-testing.md](security-testing.md).

## RestTestClient (Boot 4 / Framework 7)

An HTTP client for tests that wraps `RestClient`. Bind it to MockMvc or a running server.

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class OrderApiTest {
  @Autowired RestTestClient client;

  @Test
  void createsOrder() {
    client.post().uri("/orders")
        .contentType(MediaType.APPLICATION_JSON)
        .body(new OrderRequest("Laptop", 2))
        .exchange()
        .expectStatus().isCreated()
        .expectHeader().location("/orders/1");
  }

  @Test
  void readsOrder() {
    client.get().uri("/orders/1").exchange()
        .expectStatus().isOk()
        .expectBody(OrderResponse.class)
        .value(r -> assertThat(r.id()).isEqualTo(1L));
  }
}
```

It needs `spring-boot-starter-restclient-test` (or `spring-boot-resttestclient`). Under `@SpringBootTest` with `MOCK`, `@AutoConfigureMockMvc` plus `@AutoConfigureRestTestClient` binds it to MockMvc. Boot 4 documents an AssertJ variant through `RestTestClientResponse.from(spec)`. On Boot 3 use `TestRestTemplate` or `WebTestClient` instead.

## WebTestClient (WebFlux, or MockMvc-bound)

See the reactive section of [security-testing.md](security-testing.md) for `WebTestClient` with security. `StepVerifier` tests `Mono`/`Flux` at the service layer; an empty `Flux` passes a plain assertion silently, so finish with `.verifyComplete()` or `.expectError(...).verify()`. Use `StepVerifier.withVirtualTime` for delays.
