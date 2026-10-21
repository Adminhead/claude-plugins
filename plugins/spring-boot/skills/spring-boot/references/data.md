# Data access

## Transactions

- Put `@Transactional` on public service methods that form one unit of work; use `@Transactional(readOnly = true)` for queries. Keep transactions short and free of remote calls.
- Pitfalls, all of which run the method with no transaction and no error:
  - Self-invocation: `this.save()` from another method of the same bean bypasses the proxy. Move the method to another bean, or inject a `TransactionTemplate`.
  - `private`, `final` or `static` methods, and classes the container does not manage (`new Service()`).
  - `@Transactional` on an interface method with class-based proxies and no `proxyTargetClass`; annotate the class.
- Rollback: unchecked exceptions and `Error` roll back; checked exceptions commit unless `@Transactional(rollbackFor = Exception.class)`. A caught-and-swallowed exception inside the method also commits.
- `@Async` and new threads do not inherit the transaction. `REQUIRES_NEW` suspends the outer one and can deadlock on the same row.
- Do not rely on `@TransactionalEventListener` for work that must happen before commit; default phase is `AFTER_COMMIT`, and writes there need `REQUIRES_NEW`.

## JPA

- `spring.jpa.open-in-view=false`. Otherwise the session stays open through view rendering and hides lazy loading in controllers. After turning it off, `LazyInitializationException` points at code that must fetch inside the service.
- Fetch for the use case: DTO or interface projections in the repository, `@EntityGraph(attributePaths = "lines")`, or `join fetch`. N+1 shows as one query per row in a loop; confirm with `spring.jpa.show-sql` or `logging.level.org.hibernate.SQL=DEBUG` in a dev profile only.
- Do not use `FetchType.EAGER` on collections. Never expose entities in responses (cycles, lazy proxies, leaking columns).
- Entities: `equals`/`hashCode` on a business key or id-with-null-guard, not Lombok `@Data`; no setters for the id; a no-arg constructor (can be protected).
- Pagination: `Page<T>` runs a count query, `Slice<T>` does not. Sort on indexed columns, and whitelist client-supplied sort fields.
- Native queries use `:name` binds with `@Param`, never string concatenation.
- Bulk `@Modifying` queries bypass the persistence context; add `clearAutomatically = true`.

## Schema management

- Production schemas come from Flyway or Liquibase (Boot 4: add `spring-boot-starter-flyway` or `-liquibase`; the plain library no longer auto-configures). `spring.jpa.hibernate.ddl-auto` should be `validate` or `none` outside local development.
- Schema design itself belongs to `db-schema-design`.

## Boot 4 notes

- `@EntityScan` moved to `org.springframework.boot.persistence.autoconfigure.EntityScan`.
- `spring.dao.exceptiontranslation.*` is now `spring.persistence.exceptiontranslation.*`.
- Standalone JPA with no Spring (plain Hibernate/Jakarta Persistence) is out of scope here.
