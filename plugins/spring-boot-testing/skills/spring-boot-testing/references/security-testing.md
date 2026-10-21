# Security and reactive tests

`@WebMvcTest` auto-configures the security filter chain, so HTTP security rules are testable without `@SpringBootTest`. Boot 4 needs `spring-boot-starter-security-test` for `@WithMockUser` and `@WithUserDetails` to work. Cover three outcomes per secured route: allowed (200), unauthenticated (401), wrong role (403).

## Mock users

```java
@WebMvcTest(OrderController.class)
class OrderSecurityTest {
  @Autowired MockMvcTester mvc;
  @MockitoBean OrderService orders;

  @Test @WithMockUser(roles = "USER")
  void userCanRead() { assertThat(mvc.get().uri("/orders/1")).hasStatusOk(); }

  @Test
  void anonymousIs401() { assertThat(mvc.get().uri("/orders/1")).hasStatus(HttpStatus.UNAUTHORIZED); }

  @Test @WithMockUser(roles = "USER")
  void userCannotDelete() {
    assertThat(mvc.delete().uri("/orders/1").with(csrf())).hasStatus(HttpStatus.FORBIDDEN);
  }
}
```

- `roles = "ADMIN"` becomes authority `ROLE_ADMIN`; do not write `roles = "ROLE_ADMIN"`. For `hasAuthority("orders:write")` use `authorities = "orders:write"`.
- `@WithUserDetails("alice")` loads a real principal from a `UserDetailsService`. Use it when the controller reads a custom principal type.
- Per-request alternatives from `SecurityMockMvcRequestPostProcessors`: `.with(user("alice").roles("USER"))`, `.with(httpBasic("a","b"))`, `.with(anonymous())`. They work on `MockMvcTester` requests through `.with(...)`.
- A mock `POST`/`PUT`/`DELETE` without `.with(csrf())` returns 403 when CSRF is on. For a stateless token API, a `@TestConfiguration` can supply a `SecurityFilterChain` with CSRF off; prefer testing the real chain.
- Do not use `@AutoConfigureMockMvc(addFilters = false)` or set `SecurityContextHolder` by hand; that is not testing security.

## JWT resource server and OAuth2 login

```java
mvc.get().uri("/message").with(jwt().jwt(j -> j.subject("alice").claim("scope", "message:read")))
mvc.get().uri("/message").with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_message:read")))
mvc.get().uri("/profile").with(oauth2Login().attributes(a -> a.put("email", "a@example.com")))
mvc.get().uri("/profile").with(oidcLogin().idToken(t -> t.subject("user-123")))
```

`jwt()` builds a `JwtAuthenticationToken` with no authorization server. A `jwt()` with no scope fails a `hasAuthority("SCOPE_...")` rule with 403. (`oidcLogin()` is the servlet factory; `mockOidcLogin()`, `mockJwt()` and `mockUser()` are the WebFlux equivalents in `SecurityMockServerConfigurers`.) For a repeated identity, define a custom annotation with `@WithSecurityContext(factory = ...)` and a `WithSecurityContextFactory` that builds the `JwtAuthenticationToken`.

## Method security

`@PreAuthorize` runs only where method security is enabled, which a `@WebMvcTest` does not load for your services. Test it with a narrow context:

```java
@SpringBootTest(classes = {OrderService.class, MethodSecurityConfig.class})
class OrderServiceSecurityTest {
  @Autowired OrderService service;
  @MockitoBean OrderRepository repo;

  @Test @WithMockUser(roles = "USER")
  void userCannotCancel() {
    assertThatThrownBy(() -> service.cancel(1L)).isInstanceOf(AccessDeniedException.class);
  }
}
```

## WebFlux

```java
@WebFluxTest(ProductController.class)
class ProductControllerTest {
  @Autowired WebTestClient client;
  @MockitoBean ProductService products;

  @Test
  void returnsProduct() {
    given(products.findById(1L)).willReturn(Mono.just(new ProductDto(1L, "Widget")));

    client.mutateWith(mockUser().roles("USER")).get().uri("/products/1")
        .exchange()
        .expectStatus().isOk()
        .expectBody().jsonPath("$.name").isEqualTo("Widget");
  }
}
```

- Security for `WebTestClient` uses `SecurityMockServerConfigurers`: `mockUser()`, `mockJwt()`, `csrf()` through `mutateWith(...)`.
- `@WebFluxTest` does not load services or repositories. Mock them with `@MockitoBean`, returning `Mono`/`Flux`.
- Service-layer reactive code: `StepVerifier.create(flux).expectNext(...).verifyComplete()`. An unsubscribed or empty publisher passes plain assertions, so always end with `verifyComplete()`/`verify()`. Use `StepVerifier.withVirtualTime(() -> ...)` with `thenAwait(Duration)` for delays and `thenCancel()` for infinite streams.
- Boot 4 needs `spring-boot-starter-webflux-test`; `@SpringBootTest` no longer provides a `WebTestClient` unless you add `@AutoConfigureWebTestClient`.

## Boot 4 / Security 7

The lambda DSL is the only configuration style, and `spring-security-test` keeps the same `jwt()`, `user()` and `csrf()` API. Change `@MockBean` fields to `@MockitoBean` and add the security test starter.
