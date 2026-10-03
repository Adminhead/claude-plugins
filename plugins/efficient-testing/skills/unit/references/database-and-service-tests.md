# Database and service-dependent test notes

Use this reference only when a direct unit test cannot prove the required behavior. Confirm that the requirement actually depends on persistence, a local service boundary, or integration wiring; do not add infrastructure because it is available.

## Prerequisite record

Before running, inspect local documentation, test configuration, CI, environment examples, and existing focused tests. Record:

- the supported command, runner, and version source when known;
- required local service or database, configuration variables, and any port;
- OS, container, toolchain, or network constraints;
- how test data is created, isolated, and removed; and
- the expected safe endpoint or database identity.

Don't use a shared environment or an external production service. If local configuration is missing, ask for or report the required non-secret setup; do not substitute a live service.

## Isolation and cleanup

Use the project-supported disposable environment. Isolate data with a per-test database/schema/namespace, a unique test identifier, or a transaction that the project reliably rolls back. Keep setup minimal and teardown safe and idempotent. Do not delete broad shared resources during cleanup. Account for parallel execution: avoid fixed ports and shared mutable records unless the project explicitly serializes them.

Mock or fake only the dependency that is outside the contract being proved. A mock that merely verifies internal call order does not prove an observable result. If the contract is persistence or service interaction itself, test that boundary with the smallest supported local dependency instead.

## Running and interpreting

Start with one focused test through the repository-supported runner. Capture only the necessary non-sensitive output. A connection refusal, port conflict, migration mismatch, unavailable container runtime, or missing configuration is infrastructure evidence, not a passing or failing product assertion. Diagnose it before rerunning; do not add retries or broaden the suite.

If infrastructure cannot run safely, mark the test blocked. Report the command, sanitized error, missing prerequisite, and the smallest action needed to unblock it. Do not claim the changed behavior is validated by a test whose assertion was never reached.
