# Test slices

Slice annotations load a fraction of the context. On Boot 4 each lives in a per-technology package; on Boot 3 they sit under `org.springframework.boot.test.autoconfigure.*`. Let the IDE or compiler import them.

| Boot 4 annotation package | Slice |
| --- | --- |
| `org.springframework.boot.webmvc.test.autoconfigure` | `@WebMvcTest`, `@AutoConfigureMockMvc` |
| `org.springframework.boot.webflux.test.autoconfigure` | `@WebFluxTest` |
| `org.springframework.boot.data.jpa.test.autoconfigure` | `@DataJpaTest` |
| `org.springframework.boot.restclient.test.autoconfigure` | `@RestClientTest` |
| `org.springframework.boot.resttestclient.autoconfigure` | `@AutoConfigureRestTestClient` |

Other slices exist for JDBC, jOOQ, Mongo, Redis, GraphQL and more (`@DataJdbcTest`, `@DataMongoTest`, `@GraphQlTest`).

## Contents of each slice

- `@WebMvcTest`: `@Controller`, `@ControllerAdvice`, `@JsonComponent`/Jackson modules, `Converter`, `Filter`, `WebMvcConfigurer`, the security filter chain, `MockMvc` and `MockMvcTester`. Not loaded: `@Service`, `@Component`, `@Repository`. Mock them.
- `@DataJpaTest`: entities, repositories, `EntityManager`, `TestEntityManager`, a transaction that rolls back per test, and an embedded database replacing your `DataSource`. Add `@AutoConfigureTestDatabase(replace = NONE)` when using Testcontainers, otherwise `@ServiceConnection` is overridden. Flush and clear (`em.flush(); em.clear()`) before asserting a query, so you read from the database and not the first-level cache.
- `@RestClientTest(MyClient.class)`: the named client, Jackson, and a `MockRestServiceServer`.
- `@JsonTest`: `JacksonTester<T>` (`.write(obj)`, `.parse(json)`). Boot 4 defaults to Jackson 3 (`tools.jackson`), so custom serializer imports changed.
- `@WebFluxTest`: WebFlux controllers, `RouterFunction` beans, a `WebTestClient`.

## Examples

```java
@RestClientTest(WeatherClient.class)
class WeatherClientTest {
  @Autowired WeatherClient client;
  @Autowired MockRestServiceServer server;

  @Test
  void parsesForecast() {
    server.expect(requestTo("/forecast?city=Oslo"))
        .andRespond(withSuccess("""
            {"city":"Oslo","tempC":4}""", MediaType.APPLICATION_JSON));

    assertThat(client.forecast("Oslo").tempC()).isEqualTo(4);
    server.verify();
  }
}
```

```java
@JsonTest
class MoneyJsonTest {
  @Autowired JacksonTester<Money> json;

  @Test
  void serializesAmountAsString() throws Exception {
    assertThat(json.write(new Money("9.99", "EUR"))).extractingJsonPathStringValue("$.amount").isEqualTo("9.99");
  }
}
```

## Minimal `@SpringBootTest`

Use it for wiring and end-to-end flows only. Narrow it with `classes = {...}` or `@Import`, and pick `webEnvironment`:

- `MOCK` (default): a mock servlet environment; pair with `@AutoConfigureMockMvc` and `MockMvcTester`.
- `RANDOM_PORT`: a real server; pair with `@AutoConfigureRestTestClient` (Boot 4) or `TestRestTemplate`.

Boot 4 no longer registers `TestRestTemplate` or `WebTestClient` beans in `@SpringBootTest` unless you add `@AutoConfigureTestRestTemplate` or `@AutoConfigureWebTestClient`.

## "No qualifying bean" in a slice

1. A `@WebMvcTest` controller needs a service. Add `@MockitoBean` for it.
2. The bean is a `@Component` the slice filters out. Add it with `@Import(MyBean.class)`.
3. The test class is outside the `@SpringBootApplication` package tree, so scanning finds no configuration. Move it or set `@ContextConfiguration`.
4. A `@ConfigurationProperties` class is not enabled in the slice. `@Import` it or use `@EnableConfigurationProperties`.
5. A custom `@Configuration` on the main class (for example `@EnableJpaRepositories`) leaks into every slice. Move it to its own class.

## Common mistakes

- `@SpringBootTest` for everything: the suite gets slow and the context cache fills.
- `@MockitoBean` in `@DataJpaTest`: the mock hides the code under test.
- Asserting only the happy path.
