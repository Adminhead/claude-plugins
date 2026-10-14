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

## Technology checks

After the component pass, check each technology present against its known weak defaults. Verify the default for the version in use before flagging.

- **Datastores and caches** (Redis, MongoDB, Elasticsearch): authentication, TLS, and network exposure.
- **Containers and Kubernetes**: root user, host mounts, missing network policy, missing resource limits, unpinned or unsigned images.
- **Proxies and ingress**: TLS, snippet or header injection, rate limiting.
- **CI/CD**: secrets in logs, script injection from untrusted input, mutable dependencies, unsigned artifacts.
- **gRPC and message queues**: transport security, per-call authentication, reflection enabled in production, message signing.
- **LLM and agent features**: untrusted content reaching privileged tools, sensitive data sent to an external model, missing output validation.
- **Key management**: hardcoded keys, no rotation, keys in source.
