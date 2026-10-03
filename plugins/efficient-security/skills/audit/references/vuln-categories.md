# Vulnerability categories and verification

Read this when briefing the step 2 subagent, and again before accepting its table. Part 1 is the checklist, part 2 is the reachability filter, part 3 is how to prove a finding.

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
