# STRIDE per element

Read when deciding which STRIDE categories apply to a component and how to find the elements in code. The mapping is the standard STRIDE-per-element table from Microsoft's SDL threat modeling and Adam Shostack's *Threat Modeling: Designing for Security* (ch. 3). The OWASP Threat Modeling Cheat Sheet covers the six categories themselves. Use it to focus, and apply all six when a role is unclear.

## Which categories apply

| Element | S | T | R | I | D | E |
| --- | --- | --- | --- | --- | --- | --- |
| External entity (user, third party) | yes | | yes | | | |
| Process (service, function, job) | yes | yes | yes | yes | yes | yes |
| Data store (database, queue, bucket, cache) | | yes | yes | yes | yes | |
| Data flow (request, message, file transfer) | | yes | | yes | yes | |

A store that holds logs matters for repudiation. Spoofing and elevation for a store usually surface as a weakness in the process that fronts it.

## Finding elements in code

| Element | Look for |
| --- | --- |
| External entity | OAuth clients, webhook senders, browser or mobile clients, third-party APIs the system calls, CI runners |
| Process | Route handlers, workers, cron jobs, serverless functions, containers, CLI entry points |
| Data store | ORM models and migrations, queue and topic definitions, bucket and cache config, files the app writes |
| Data flow | HTTP and gRPC clients and servers, message publishers and consumers, file and env reads, database connections |
| Trust boundary | Ingress and load balancers, auth middleware, network policy and security groups, tenant filters, the line between CI and production |

## Prompts by category

- **Spoofing.** How does each caller prove who it is? Is the check enforced on every route, including internal and admin ones? Can a token, cookie, or webhook be forged or replayed?
- **Tampering.** Is input validated at the boundary? Are messages, webhooks, and updates signed or integrity-checked? Who can write to the store, config, or build artifacts?
- **Repudiation.** Are security-relevant actions (auth, permission changes, deletes, payments) logged with actor and time? Can the actor edit or delete the log?
- **Information disclosure.** What sensitive data crosses this flow or sits in this store? Is it encrypted in transit and at rest, absent from logs and URLs, and scoped per tenant? Do error messages leak internals?
- **Denial of service.** Are there rate limits, size limits, timeouts, and pagination caps? Can one request cause unbounded work or memory?
- **Elevation of privilege.** Is authorization checked per object, not just per route? Can a user set their own role or tenant id? Does the process run with more privilege than it needs?

## Common threats by category

A checklist of threats that recur across web and service architectures, adapted from the `stride-analysis-patterns` skill in wshobson/agents (MIT License, see the plugin's LICENSE). Use it to make sure a category was not skipped, then confirm each candidate against the code before it becomes a finding.

| Category | Recurring threats |
| --- | --- |
| Spoofing | Credential stuffing on login, session hijacking or fixation, forged or replayed tokens and webhooks, service-to-service calls with no caller identity |
| Tampering | Injection (SQL, NoSQL, command, template), parameter and mass-assignment manipulation, file upload abuse, unsigned messages, writable build artifacts or config |
| Repudiation | Financial or admin actions with no audit record, logs the actor can edit or delete, unsynchronized clocks that break the timeline |
| Information disclosure | Cross-tenant reads, verbose errors, secrets or personal data in logs and URLs, unencrypted flows across a boundary, over-broad API responses |
| Denial of service | Unbounded request bodies, page sizes or batch jobs, expensive queries reachable anonymously, missing timeouts on outbound calls, amplification through fan-out |
| Elevation of privilege | Missing per-object authorization (IDOR), client-controlled role or tenant fields, JWT claim tampering, processes and containers with more privilege than needed |

## Ranking boundary crossings

Give each element a trust level (0 for anonymous internet, higher for more trusted zones). Flows that cross the largest trust gap, especially from untrusted to highly trusted, get analysed first and in the most depth. A flow between two elements at the same level crosses no boundary and usually needs only the tampering and disclosure questions.

## Technology checks

After the component pass, check each technology present against its known weak defaults. Verify the default for the version in use before flagging.

- **Datastores and caches** (Redis, MongoDB, Elasticsearch): authentication, TLS, and network exposure.
- **Containers and Kubernetes**: root user, host mounts, missing network policy, missing resource limits, unpinned or unsigned images.
- **Proxies and ingress**: TLS, snippet or header injection, rate limiting.
- **CI/CD**: secrets in logs, script injection from untrusted input, mutable dependencies, unsigned artifacts.
- **gRPC and message queues**: transport security, per-call authentication, reflection enabled in production, message signing.
- **LLM and agent features**: untrusted content reaching privileged tools, sensitive data sent to an external model, missing output validation.
- **Key management**: hardcoded keys, no rotation, keys in source.
