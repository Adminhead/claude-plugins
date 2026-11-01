# Kotlin with Spring and JPA

Read when a Kotlin class carries `@Entity`, `@Service`, `@RestController` or `@ConfigurationProperties`. Spring Boot configuration itself belongs to `spring-boot`; Spring test slices to `spring-boot-testing`.

## Spring in Kotlin

- Gradle: apply `kotlin("plugin.spring")` (opens `@Component`, `@Transactional` and similar classes) and `kotlin("plugin.jpa")` (no-arg constructors for `@Entity`, `@Embeddable`, `@MappedSuperclass`). Without them proxying fails or Hibernate cannot instantiate entities.
- Inject through the primary constructor with `private val` dependencies. Prefer `val` everywhere.
- DTOs, request bodies and `@ConfigurationProperties` are `data class`es. Put Bean Validation on the right target: `@field:NotBlank`, `@field:Size` on constructor properties.
- Declare a logger in a companion object: `private val logger = LoggerFactory.getLogger(Foo::class.java)`, with parameterized messages.
- Controllers and services may be `suspend` for coroutine-capable stacks (WebFlux, and Spring MVC on recent Boot versions); keep blocking JDBC off the event loop with an injected dispatcher.
- Organize packages by feature, not by layer.

## JPA entities

Kotlin's `data class` is dangerous for entities: all-field `equals`/`hashCode` corrupts `Set` and `Map` membership after a state change, a proxy never equals the entity, and `copy()` creates detached duplicates of managed entities.

Rules:
- Entities are regular classes. `data class` is for DTOs. Keep DTOs and entities separate unless the project clearly shares a model.
- Verify the `plugin.jpa` and `plugin.spring` (or all-open) setup exists; check members are proxy-compatible.
- Required columns are non-null only when construction and the persistence lifecycle make that safe. Use `lateinit` only where the project already accepts it and the lifecycle is safe.
- A database-generated id is `var id: Long? = null` with `protected set`, never `0L` as "unsaved".
- Equality is by id with a stable hash; follow the project's convention if it has one.
- `toString` must not touch lazy associations.

```kotlin
@Entity
@Table(name = "orders")
class Order(
    @Column(nullable = false) var status: String,
    @Column(nullable = false) var total: BigDecimal,
) {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null
        protected set

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Order) return false
        return id != null && id == other.id
    }

    override fun hashCode(): Int = javaClass.hashCode()

    override fun toString(): String = "Order(id=$id, status=$status)"
}
```

If the entity can be a Hibernate proxy, compare through the `Hibernate.getClass`-aware check your project already uses rather than `javaClass` alone.

## Uniqueness and idempotency

Enforce uniqueness in the database (`uniqueConstraints = [UniqueConstraint(columnNames = ["variant_id", "order_id"])]`) because an application check alone races; add the application lookup (`findByVariantIdAndOrderId`) for a clean error message instead of a raw `DataIntegrityViolationException`.

## Fetching and traps

- Diagnose N+1 from SQL logs or query counts, not from annotations. Fix with `@EntityGraph`, `JOIN FETCH`, batch fetching or DTO projections, and say how the query plan changes. Do not set `FetchType.EAGER` to silence lazy errors.
- Collection fetch joins with pagination load everything in memory; multiple bag fetches multiply rows.
- Maintain both sides of a bidirectional association in domain methods.
- `orphanRemoval` and cascade remove are different.
- `toString`, debug logging, JSON serialization and IDE inspection trigger lazy loads. With `open-in-view` off, map to DTOs inside the transaction.
- Bulk updates and deletes bypass the persistence context; later reads may be stale.
- `@Version` is the clearest optimistic locking.
- Do not expose entities directly in API responses.
