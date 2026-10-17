# Vulnerability categories and verification

Read this when briefing the step 2 subagent, and again before accepting its table. Part 1 is the checklist, part 2 is the reachability filter, part 3 is how to prove a finding.

The anti-pattern list in part 1 is adapted from `instructions/security-and-owasp.instructions.md` in github/awesome-copilot (Copyright GitHub, Inc., MIT License; see the plugin's LICENSE), condensed and rewritten.

## 1. Categories

| Category | Look for | Safe form |
| --- | --- | --- |
| Injection (SQL, command, template, header, log, LDAP, XPath) | Input concatenated or interpolated into a query, command, template, or header | Bind parameters, argument arrays without a shell, autoescaped templates, allowlists for identifiers that cannot be bound (table, column, sort order) |
| Cross-site scripting | Unescaped output, raw-HTML sinks, URLs from input in `href` or `src` | Framework autoescape, URL scheme allowlist, a sanitizer for rich text |
| Authentication | Routes missing the auth guard, routes registered before it, debug or admin routes left on, `alg: none` or unverified JWTs, weak or hardcoded signing secrets, no `exp` check | Central guard applied by default; explicit allowlist of public routes |
| Authorization (IDOR, BOLA) | `findById(params.id)` with no ownership or tenant check; role checks only in the UI; mass assignment from a request body | Scope every query by the caller's identity; ignore client-supplied owner and role fields |
| Request forgery (CSRF, SSRF) | State-changing cookie-authenticated routes with no token or SameSite; server fetches of user-supplied URLs, webhooks, image or PDF fetchers | CSRF token or SameSite plus origin check; allowlist hosts, resolve and block private and link-local ranges, no redirects |
| Deserialization and uploads | Native object deserializers on request data; upload paths that execute or serve files; archive extraction | Data-only formats with schema validation; store uploads outside the web root with generated names |
| Path traversal | File paths built from input | Resolve, then verify the result is inside the root |
| Data exposure | Secrets, tokens, or personal data in logs, errors, and API responses; verbose errors; over-broad serializers | Allowlist response fields; generic errors with a correlation id |
| Cryptography | MD5, SHA-1, DES, ECB for security; static IV or salt; non-cryptographic randomness for tokens; certificate checks disabled | Library defaults for password hashing (argon2, bcrypt, scrypt), authenticated encryption, OS randomness |
| Business logic | Check-then-act races (TOCTOU) on balances, stock, or one-time tokens; client-controlled prices; enumerable ids with no rate limit on sensitive routes | Transactions or atomic updates; server-side pricing; rate limits on login, reset, and export |

Secrets in code are covered by gitleaks in step 1. Do not hand-search for key patterns.

### Anti-patterns the table above misses

Each line is a pattern to look for, then the safe form. The OWASP Top 10:2025 id is in brackets. Apply the reachability filter in part 2 to every one.

- **NoSQL operator injection** [A05]: a request body passed straight into a Mongo-style filter, so `{"password": {"$gt": ""}}` matches any row. Cast fields to the expected scalar type, or validate with a schema, before building the query.
- **XML external entities** [A05]: an XML parser reading uploads or request bodies with DTDs or external entities enabled. Disable DTD and entity processing in the parser options.
- **Session fixation** [A07]: login sets the user on the existing session without regenerating its id. Regenerate the session id at login and privilege change, and invalidate other sessions on password change.
- **OAuth client without `state` or PKCE** [A07]: an authorization request with no unguessable `state` bound to the session, or a public client (SPA, mobile, CLI) without PKCE `S256`. Both are login CSRF or code interception.
- **JWT claims not checked** [A07]: beyond the signature and `alg`, `exp`, `aud` and `iss` are not verified, so a token minted for another service is accepted.
- **Sensitive action without re-authentication** [A01]: password, email, MFA or payout changes accepted on an old session alone. Require a fresh credential or step-up.
- **Cookie flags** [A02]: session cookies without `HttpOnly`, `Secure` and a `SameSite` value, or set on a broad `Domain`.
- **CORS** [A02]: a reflected `Origin` or `*` together with `Access-Control-Allow-Credentials: true`. Allowlist exact origins.
- **CSP that does nothing** [A02]: `script-src` with `'unsafe-inline'` or `'unsafe-eval'` is no XSS defence. Report it only next to a real injection sink, since a missing header alone fails the filter.
- **`postMessage` without an origin check** [A01]: a `message` listener that acts on `event.data` without comparing `event.origin` to an exact allowlist, or `postMessage(data, "*")` carrying secrets.
- **Open redirect** [A01]: a `redirect`, `next` or `returnTo` parameter sent to `Location` or `window.location`. Accept relative paths only (starts with `/`, not `//` or `/\`), or an allowlist of hosts.
- **Unsigned webhooks** [A08]: an inbound webhook parsed and acted on before verifying the provider's HMAC or signature over the raw body, or with no timestamp or replay check.
- **File uploads** [A05]: no size limit, type checked only by client-supplied MIME or extension, stored under the web root or with the client's file name. Limit size, sniff content, store outside the web root under a generated name.
- **GraphQL without limits** [A05]: no depth, complexity or alias limit, or introspection on in production for a private API.
- **No body size or pagination cap** [A10]: request bodies, page sizes or batch endpoints without an upper bound, so one request causes unbounded work.
- **Failing open** [A10]: a `catch` that grants access, skips a check or commits half a transaction on error. Deny by default and roll back on failure.
- **Errors that leak** [A10]: stack traces, SQL, internal paths or upstream responses returned to clients. Log them server-side and return a generic error with a correlation id.
- **Log injection and secrets in logs** [A09]: user input concatenated into log lines (forged entries, CRLF), or tokens, passwords and personal data written to logs. Use structured logging and an allowlist of logged fields.
- **Default credentials** [A02]: shipped admin passwords, sample API keys or `changeme` values in config or seed data that reach a deployed environment.
- **Secrets reachable by the client** [A02]: server secrets in client bundles (`NEXT_PUBLIC_*`, `VITE_*`, `process.env` read in a `'use client'` file), or full database objects passed to client components.
- **LLM and agent features** [A05, A08]: user or retrieved content concatenated into a prompt that drives privileged tools; model output passed to SQL, a shell, `eval` or raw HTML; model output used without schema validation. Treat model output as untrusted input and gate tools by the caller's permissions, not the model's request.

CI, IaC and supply-chain trust issues are in [ci-supply-chain.md](ci-supply-chain.md).

## 2. Reachability filter

Report a finding only when all three hold:

1. **Reachable.** A route, job, webhook, message consumer, CLI argument, or file the product ingests leads to the code. Code that only tests, examples, or build scripts run is out.
2. **User-controlled.** The tainted value comes from someone other than the operator. A hardcoded command string is not input.
3. **Meaningful sink.** The sink does something an attacker wants: runs code, reads or writes data they should not touch, calls an internal host, bypasses a check.

Usually not findings on their own: `pickle.loads` or `torch.load` on a local trusted file, `eval` in a local-only CLI, `shell=True` on a fully hardcoded command, missing security headers alone, rate-limit complaints with no exploit impact, self-XSS, demo or test code. Say which condition failed when you drop one, so the person can disagree.

## 3. Proving a finding

- **Trace.** Write the path from entry point to sink as `file:line` hops, naming each transformation. Follow it across files, through middleware, wrappers, and ORMs. A trace that stops at a function boundary is a hypothesis.
- **Look for the control you missed.** Before reporting, check for sanitization, framework escaping, a validator, or an upstream auth guard on the path. If one exists, say why it does not stop the exploit or drop the finding.
- **State the exploit.** One concrete request or input and what the attacker gains. No scenario means a low-confidence note at most.
- **Fix every Critical and High.** Name the specific change, not "validate input".
- **Do not silently downgrade or drop.** A severity reduction needs a stated reason. A dropped scanner finding goes in the dropped list with its reason, as step 3 requires.
- **Report coverage.** For each category above with no finding, write "none detected" so the person sees what was checked.
