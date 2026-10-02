# REST/API contract review

Read this when a browser-facing change adds, changes, or diagnoses an HTTP API contract. Repository conventions and the requested behavior decide the result.

- **Operation.** Specify the method, route, accepted headers, query, and body, credential behavior, and which side validates what. Make the success status, headers, and fields match what the browser actually reads.
- **Failures.** Give each expected failure a stable, user-safe status and meaning. Separate correctable input (400/422), missing authentication (401), denied access (403), missing resources (404), conflicts (409), and unexpected server errors (5xx). Never expose internals.
- **Pagination.** Add it only when the workload needs bounded retrieval, incremental loading, or navigation through more results. Define the ordering, limit bounds, cursor or page semantics, and behavior when data changes between pages. Don't paginate a small bounded result by habit.
- **Repeated requests.** Safe methods must not mutate. Retried or duplicated mutations need an established idempotency mechanism, such as an idempotency key or a natural unique constraint, or an explicit conflict outcome. A disabled button on the client is not idempotence.
- **Compatibility.** Keep documented fields, meanings, and error behavior unless a deliberate breaking change has an approved migration. Add envelope or versioning conventions only when the existing contract or a stated requirement calls for them.
- **Security.** Authenticate and authorize the specific resource and action, validate all input, apply the existing CSRF, origin, and rate controls, and never return secrets or sensitive internals. See `efficient:auth` for session and token details.
