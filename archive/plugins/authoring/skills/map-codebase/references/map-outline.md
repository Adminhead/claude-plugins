# Map outline

Read this when investigating each area and when writing the map. Use the sections the repo supports, and keep each short. List evidence paths at the end of each section.

## 1. Stack

- Primary language and exact version (`.nvmrc`, `go.mod`, `pyproject.toml`, Docker `FROM`).
- Package manager and the key scripts in `package.json`, `Makefile`, `justfile`, or `pyproject.toml`.
- Runtime frameworks (web server, ORM, dependency injection) and the production dependencies that shape how code is written.
- Dev tooling listed separately.
- Base image and orchestration, if any.

## 2. Structure

- Where source lives, the entry points (`main` in a manifest, `cmd/`, `app.py`), and the purpose of each top-level directory.
- Non-obvious or hidden directories (`eng/`, `platform/`, `.github/`, `.husky/`).
- Directory naming convention, and whether code is organized by layer or by feature.

## 3. Architecture

- The primary data flow: trace one request or command from entry to the data store.
- Layers, repeated patterns, and initialization order requirements.
- Background workers, queues, and event-driven parts.

## 4. Conventions

- File, function, and variable naming, checked across a sample of ten or more files.
- Linter, formatter, and type-strictness settings.
- Error handling at each layer, logging, and import organization.
- Git conventions visible in recent branches and commits, when history is deep enough to show them.

## 5. Integrations

- External APIs and base URLs, databases (confirm from the manifest), message queues, and auth providers.
- How credentials are supplied (names only).
- Monitoring and observability.

## 6. Testing

- Runner, location of tests, assertion and mocking style, and the commands that run them.
- The split between unit tests and tests against real services.
- Enforced coverage thresholds, if configured.

## 7. Concerns

- Top risks in priority order, each with evidence, impact, and a suggested action.
- Debt, security concerns, and performance or scaling concerns visible in the code (N+1 queries, in-memory state in a multi-instance setup, hardcoded values that belong in config).
- Fragile or high-churn areas and a safe way to change each.
- Open `ASK:` questions.

## Evidence and unknowns

Every section ends with an evidence list. A claim with no evidence is removed or marked `UNCONFIRMED`. "Could not determine the test runner" is a better entry than a guess.
