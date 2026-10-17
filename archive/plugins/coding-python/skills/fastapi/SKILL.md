---
name: fastapi
description: Bounded changes to existing FastAPI apps involving lifespan, dependency injection, Pydantic request/response models, async handler boundaries, auth dependencies, service transactions, and TestClient/dependency_overrides tests. Use when a task touches `from fastapi import` code, routers, Depends providers, or FastAPI tests. Not for Python language mechanics (coding-python:python), auth policy (auth:auth, if installed), or schema/ORM design (db:database-design, if installed).
---

# Efficient FastAPI

Preserve the application factory, router registration, dependency graph, and wire contract unless the request changes them. Don't add a package, compatibility layer, global service registry, or background task just to make a change look complete.

Related skills:

- `coding-python:python` for typing, resource lifetimes, and asyncio mechanics.
- `auth:auth`, if installed, for token formats, permission models, cookies/CSRF, and cryptography.
- `web:web-development`, if installed, for general HTTP API and browser-facing decisions.
- `db:database-design` / `db:postgres`, if installed, for ORM choice, schemas, and constraints.

## Orient

- Read the app factory or `app` instance, affected routers and routes, the `Depends` providers and their consumers, the Pydantic models, the service layer, and the nearest tests.
- For the operation, note inputs, response model and status, mapped errors, identity source, resource owner, transaction owner, and any startup/shutdown needs.
- Check installed FastAPI and Pydantic versions (`uv pip show fastapi pydantic` or the lockfile). Pydantic v1 and v2 APIs differ. Look up version-sensitive APIs with Context7 (`resolve-library-id` for "fastapi" or "pydantic", then `query-docs`).

## Lifespan

- App-lifetime resources (connection pools, HTTP clients) belong in the existing `lifespan` context manager. Acquire before `yield`, release after.
- Per-request resources belong in dependencies. Operation-local resources belong in the operation or service that creates them.
- If startup fails partway, release what was acquired and let the failure propagate. Never serve a half-initialized app.
- Don't create schema (`Base.metadata.create_all`) in lifespan or at import time. Startup DDL races concurrent deploys and bypasses migrations, so schema changes go through the repo's migration tool. Don't add network calls or unrelated work there either without an existing requirement.
- If tests need isolated state, use or add the smallest app factory in the existing style rather than mutating module globals.

## Dependencies

- Inject request-scoped infrastructure, the authenticated principal, and service collaborators through `Depends`. Don't construct them ad hoc in handlers.
- `app.dependency_overrides` is keyed by the original callable. Reuse the canonical provider function so overrides work, and don't wrap it in a lambda or new function at the use site.
- Share a repeated dependency as an `Annotated` alias, such as `DbDep = Annotated[AsyncSession, Depends(get_db)]` or `CurrentUserDep`. It is plain type-alias syntax, keeps editor and type-checker support, and still wraps the canonical provider, so `dependency_overrides` keeps working. Follow the repo's existing alias names.
- A `yield` dependency owns cleanup around its `yield`. Keep its commit, rollback, and close behavior there, not duplicated in handlers.
- Each dependency acquires or validates one concern. Don't hide business mutations, silent authorization decisions, or commits in a convenience dependency.

## Models

- Keep request and response models separate. Constrain output with a return annotation or `response_model`.
- Never return ORM objects, internal exceptions, credentials, or write-only fields just because they serialize.
- For PATCH, keep "omitted" distinct from "set to null." In Pydantic v2, use `model_dump(exclude_unset=True)`; v1 uses `.dict(exclude_unset=True)`.
- Put input validation on the request model. Domain invariants and conflict decisions stay in the service.
- Give offset or limit pagination a deterministic `ORDER BY` with a unique tiebreaker (for example `created_at, id`). Without one the database may return rows in a different order per page, so pages skip or repeat rows (PostgreSQL documents this for `LIMIT`).
- Change status codes, aliases, default/exclude behavior, or OpenAPI-visible fields only when the contract requires it.

## Handlers and async

- A handler binds inputs, calls the service, and maps expected domain outcomes to the app's HTTP error contract.
- Use `async def` only when the handler awaits async collaborators. A sync `def` handler runs in a threadpool, so blocking I/O there is safe. Blocking I/O inside `async def` stalls the whole event loop.
- Don't spawn detached tasks from a request or swallow cancellation. `BackgroundTasks` runs after the response with no error channel back to the client, so use it only when that is acceptable.

## Auth integration

- Get a validated principal through the established security dependency, and pass only the trusted identity the service needs.
- Keep 401-versus-403 mapping and `WWW-Authenticate` headers consistent with existing policy.
- A JWT `sub` claim is a string (RFC 7519). Convert it to the key type at the dependency and treat a failed conversion like any other invalid token (401). FastAPI's current JWT tutorial uses PyJWT. Keep the repo's library unless `auth:auth`, if installed, says to change it.
- Never treat a client-supplied ID, role, or claim as authorization. Authorize the action and resource before any durable mutation or sensitive response.

## Transactions

- Route functions supply the injected collaborator and nothing more for persistence.
- The service or unit-of-work boundary owns the whole mutation, the commit/rollback decision, and translating expected persistence conflicts into domain outcomes.
- Keep multi-record changes atomic, and don't commit intermediate handler steps.
- On unexpected failure, keep the cause in logs and return the app's safe error response without infrastructure details.

## Tests

- Use a fresh app instance when isolation matters.
- Override only the direct provider you need via `app.dependency_overrides[provider] = fake`, and clear it in fixture teardown so no test leaks it.
- Supply fake principals, clocks, and collaborators through dependencies. Don't patch handlers or call real identity providers.
- `with TestClient(app) as client:` runs lifespan. A bare `TestClient(app)` does not.
- `httpx.AsyncClient(transport=ASGITransport(app=app))` does not run lifespan. Test a seam that doesn't need it, or use the repo's existing lifespan arrangement. Don't add a package just for this.
- Test persistence against the same database engine production uses (a throwaway Postgres container or the repo's test database), not in-memory SQLite. SQLite differs on constraints, types, and locking, so green tests can hide production failures. Create the schema in the fixture the way the repo does, using its migrations when it has them.
- Use `testing:unit` to pick the smallest meaningful set of cases (success, validation, 401/403, conflict, cleanup).

## Validate

- Run the narrowest formatter, type check, and FastAPI test target that reaches the seam.
- When a schema, dependency, or status changes, inspect `app.openapi()` or `/openapi.json` for the affected path.
- Classify failures before editing again. Common causes are route registration, dependency resolution or override identity, model validation or serialization, lifespan setup, auth mapping, transaction ownership, and test lifecycle.
