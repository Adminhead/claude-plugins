# Security

Spring Security 6.x ships with Boot 3.5, 7.x with Boot 4. Both use the component-based, lambda DSL.

## Filter chain

```java
@Configuration
@EnableMethodSecurity
class SecurityConfig {
  @Bean
  SecurityFilterChain api(HttpSecurity http) throws Exception {
    return http
        .securityMatcher("/api/**")
        .authorizeHttpRequests(a -> a
            .requestMatchers("/api/public/**").permitAll()
            .anyRequest().authenticated())
        .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(c -> c.disable())   // stateless bearer-token API only
        .build();
  }
}
```

- Deny by default: end every chain with `anyRequest().authenticated()` (or `denyAll()`). Order matters; the first matching rule wins.
- Several chains: give each `securityMatcher` and an `@Order`; the most specific first.
- Keep CSRF enabled for browser apps with sessions or cookies. Disable it only for a stateless API that authenticates by `Authorization` header.
- Prefer the built-in resource server (`spring-boot-starter-security-oauth2-resource-server` in Boot 4; `-oauth2-resource-server` in 3.x) over a hand-written JWT filter.
- Method security: `@PreAuthorize("hasRole('ADMIN')")` or `@PreAuthorize("@authz.canEdit(#id)")`. It is proxy-based, so self-invocation skips it just like `@Transactional`.
- Passwords: inject a `PasswordEncoder` (`PasswordEncoderFactories.createDelegatingPasswordEncoder()` or `Argon2PasswordEncoder`); never store plaintext.

## CORS, headers

- Configure CORS on the security chain (`http.cors(...)` with a `CorsConfigurationSource` bean), with explicit origins; `*` with credentials is rejected by browsers anyway.
- Defaults already send HSTS (HTTPS), `X-Content-Type-Options` and cache-control. Add a Content-Security-Policy deliberately; the legacy `X-XSS-Protection` header is not needed.
- Behind a proxy, set `server.forward-headers-strategy=NATIVE` or `FRAMEWORK` and make the proxy overwrite `X-Forwarded-For`. Do not read that header yourself for rate limiting or auth decisions.

## Input and output

- Validate every request body with `@Valid`; bind queries with parameters, never concatenated SQL.
- Do not log tokens, passwords or full card numbers. Redact structured log fields.
- Uploads: limit size (`spring.servlet.multipart.max-file-size`), check content type and extension, store outside the web root, generate the file name server-side.

## Rate limiting and brute force

Apply limits at the gateway when you have one. In-app, a Bucket4j filter keyed by authenticated principal or the trusted client address works; return 429 with `Retry-After`.

## Secrets and dependencies

- Secrets from the environment, `configtree:` or a vault; never in repo files. Rotate on exposure.
- Run a dependency scanner (OWASP Dependency-Check, OSV, Snyk) in CI. Stay on a supported Boot line so Security and Framework patches arrive with the BOM.
- Lock down Actuator: expose `health` and `info`, require authentication for the rest, and keep `env`, `heapdump` and `configprops` off the public network.

## Boot 4 notes

- OAuth2 starters were renamed with a `security-` prefix (`spring-boot-starter-security-oauth2-client` and so on).
- `PathRequest.toStaticResources()` now includes `/fonts/**`; exclude it if fonts must be authenticated.
- Security tests use `spring-boot-starter-security-test` and are covered by `spring-boot-testing`.
