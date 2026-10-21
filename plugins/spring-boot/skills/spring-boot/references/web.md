# Web layer

## Controllers

```java
@RestController
@RequestMapping("/api/orders")
@Validated
class OrderController {
  private final OrderService orders;
  OrderController(OrderService orders) { this.orders = orders; }

  @PostMapping
  ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest req) {
    var created = orders.create(req);
    return ResponseEntity.created(URI.create("/api/orders/" + created.id())).body(created);
  }
}
```

- Use request and response records as DTOs. Put Jakarta constraints (`@NotBlank`, `@Size`, `@Email`, `@Min`) on the request record; use `@Valid` on nested objects and on collections' elements.
- Cap page sizes (`@PageableDefault`, `spring.data.web.pageable.max-page-size`) so a client cannot request everything.
- A `@Validated` class with `@RequestParam`/`@PathVariable` constraints throws `HandlerMethodValidationException` (Framework 6.1+), not `ConstraintViolationException`; handle both if the project mixes styles.

## Errors as ProblemDetail

```java
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {
  @ExceptionHandler(OrderNotFoundException.class)
  ProblemDetail notFound(OrderNotFoundException ex) {
    var pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    pd.setTitle("Order not found");
    return pd;
  }
}
```

- Extending `ResponseEntityExceptionHandler` covers the framework's own exceptions (validation, missing params) as RFC 9457 problem details; set `spring.mvc.problemdetails.enabled=true` to make the default handler do the same.
- Never put exception messages from internals (SQL, stack traces) into `detail`. Log them server-side and return a stable message for the catch-all `Exception` handler.

## MVC or WebFlux

- Choose one. `spring-boot-starter-webmvc` (Boot 3: `-web`) is Servlet and blocking; `spring-boot-starter-webflux` is reactive. With both on the classpath Boot picks MVC.
- Blocking calls (JDBC, `RestClient`) inside a WebFlux handler stall the event loop; wrap with `Schedulers.boundedElastic()` or stay on MVC with virtual threads.
- Never call `.block()` inside a reactive chain.

## Calling other services

- Use `RestClient` (Framework 6.1+) built from the injected `RestClient.Builder`, with explicit connect and read timeouts through `spring.http.client.*` or the request factory. `RestTemplate` still works but is in maintenance.
- Declarative clients: `@HttpExchange` interfaces with `HttpServiceProxyFactory`; Framework 7 adds `@ImportHttpServices` registration.
- `RestClient...body(Foo.class)` is `@Nullable` in Boot 4 (JSpecify); handle null.

## Boot 4 web changes

- Trailing-slash matching is removed in Framework 7: `/foo` and `/foo/` are different routes. Register `UrlHandlerFilter.trailingSlashHandler(...)` ahead of the security chain if clients rely on it.
- `HttpMessageConverters` is deprecated; use `ClientHttpMessageConvertersCustomizer` and `ServerHttpMessageConvertersCustomizer`.
- Undertow is removed; use Tomcat or Jetty.
- API contract choices (versioning, pagination shape, error taxonomy) belong to `api-rest-design`.
