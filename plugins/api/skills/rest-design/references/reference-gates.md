# Reference docs and CI gates

An API reference is trustworthy only when it is generated from, and tested against, the same spec the server follows.

## Census

List every operation from the spec, then diff the spec against the published reference both ways. A documented endpoint that no longer exists erodes trust, and a live endpoint that is not documented makes integrators guess. A spec is not the whole truth, so check gateway logs and support tickets for routes the docs lack. With no spec, record that as the first blocker.

## Each operation needs

- A description and an `operationId`.
- Every parameter with type, required-ness, constraints, and an example.
- Every response code, with at least one 4xx.
- Every error code with its cause and fix.
- Request and response examples.
- A note on retry safety (idempotency).
- Disallowed values and ordering requirements ("create X before calling Y"), which checklists often miss.

Keep a reference page lookup-shaped. A tutorial or a "why this design" digression belongs elsewhere.

## Gates

| Gate | Pass |
| --- | --- |
| Census coverage | Every spec operation, parameter, response, and error code appears in the published reference. Zero documented-but-removed endpoints. |
| Lint | Zero errors at the chosen Spectral or Redocly ruleset. |
| Contract tests | Provider responses validate against the spec. A first run on a production schema often finds several issues. |
| Snippet parity | Each operation has a snippet per shipped SDK language, using the SDK. Add this gate only when you generate docs and SDKs from the spec. Use the `x-codeSamples` extension for per-language samples. |

Gate merges on lint and contract-test results, not on the docs site rebuilding, because a site rebuilds cleanly from a spec that lies. Match the gate to the maturity of the team: a lint-only team has no callable environment for contract tests yet, and that is out of scope until it does.

Time-to-first-call (under about 10 minutes for a new integrator) and the share of support tickets caused by missing reference content are trends to watch, not gates.
