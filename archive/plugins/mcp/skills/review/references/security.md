# Static security review

Review the implementation source of an MCP server (or the token and session handling of a client) and report with `file:line` evidence. The protocol requirements below were checked against the 2026-07-28 revision. Re-read the live spec for anything you cite as a MUST.

The baseline controls MCP-01 to MCP-05 are this skill's own checklist, built on the spec's server requirements. They are not an official standard.

## 1. Classify the target

Record these before judging anything:

- **Role**: server or client. For a client, apply the client duties in section 3 and don't apply the server controls unless asked.
- **Protocol revision** the code targets. A server that serves only the 2026-07-28 revision has no `initialize` handshake and no protocol sessions. Servers that also serve earlier revisions keep the legacy session behavior.
- **Exposure**: network-exposed or local-only (below).
- **SDK and version**, and whether the HTTP layer is the SDK's or hand-written.

### Exposure

Treat a server as network-exposed when traffic can reach it over a network from outside its own process tree, whatever the inner binding says.

| Signal | Exposure |
| --- | --- |
| Streamable HTTP or SSE transport in code | Network-exposed, unless it is bound only to loopback with no published port, in which case it is local-only. The `Origin` and `Host` transport checks still apply |
| Binding to `0.0.0.0` or `::`, or no explicit host in Express, Node `http`, Go `http.ListenAndServe(":8080")` | Network-exposed (these default to all interfaces) |
| Python SDK with no explicit host | Loopback by default (`127.0.0.1`), so network-exposed only if `host` is set to a non-loopback address or a container or proxy publishes it |
| `EXPOSE` or published ports (`ports: "8000:8000"`) in a Dockerfile or Compose file | Network-exposed even if the process binds `127.0.0.1` inside the container |
| Reverse proxy, tunnel, or ingress in front | Network-exposed |
| stdio transport only (`StdioServerTransport`, `serveStdio`, `mcp.run()` with no arguments, a `command` entry with no URL in `.mcp.json`) | Local-only |

If you can't establish the transport from the code, flag it for manual review. Don't assume stdio, because that would skip the server controls.

## 2. Filter false positives

Drop these before opening findings:

- Skill templates and example prompts that merely contain server code.
- Vendored SDK copies (`node_modules/`, `vendor/`, a file that defines the SDK's own server class). For SDK repositories, review the default configuration and public API only.
- MCP client configuration files with no server code.
- Docs and tutorials with code fences unrelated to this repo's own server. Docs that describe this server's transport, auth, or deployment are in scope.
- Outbound-only credentials (cloud default credentials, service account files) used only to call upstream APIs. They matter for MCP-01 only if inbound tokens are forwarded.

## 3. Baseline controls (network-exposed servers)

For a local-only server, give best-practice notes instead of PASS or FAIL and continue to section 4, because tool input can still execute code locally.

### MCP-01 Identity and audience

Spec basis: servers acting as OAuth resource servers must validate that tokens were issued for them as audience (RFC 8707), must accept only tokens valid for their own resources, and must not accept or transit any other tokens. They must publish protected resource metadata (RFC 9728) and return 401 for missing or invalid tokens and 403 for insufficient scope.

Check:
- Token validation and authorization run on every MCP route, not only on session start or in a gateway.
- The server checks audience against its own resource identifier. A shared application identity across servers is a finding.
- Outbound calls use their own credentials (token exchange or service credential). Any copy of the inbound `Authorization` header to an upstream call is a finding (confused deputy).
- Unauthenticated routes are limited to metadata discovery (`/.well-known/oauth-protected-resource` and similar) and expose nothing else.
- Authorization separates read, write, and admin operations.

### MCP-02 Sessions (legacy revisions only)

Mark N/A when no session identifier is issued or read anywhere, and say whether the server serves only revisions without protocol sessions. Per-request authentication still applies (MCP-01). When sessions exist:
- A session ID is never treated as authentication, and loss or reuse of one grants no access.
- IDs come from a CSPRNG, are unguessable, are bound to an authenticated context, and never appear in URLs.
- If the SDK manages sessions and generation isn't visible in source, mark `NEEDS INVESTIGATION`, not FAIL.
- For a handle returned by a stateful tool, the server validates the caller's authorization against the handle on every call.

### MCP-03 Rate limits

Spec basis: servers must rate limit tool invocations.
- Limits exist in the server runtime, not only at a gateway, and are keyed by authenticated identity.
- Mutation and high-cost tools have tighter budgets than reads, and tool discovery is limited too.
- A limited request fails closed (HTTP 429 with `Retry-After`) before any backend action.
- There is no universal threshold. Set budgets from downstream API limits and cost.

### MCP-04 Input validation

Spec basis: servers must validate all tool inputs.
- Every tool has an input schema with types, required fields, enums, and bounds, and rejects unknown properties where the contract is closed.
- Validation runs on the server on every call, not only in a client or gateway. SDK validation counts when the schema is explicit.
- Invalid input fails with no backend action.
- Tool outputs are sanitized, and error text carries no stack traces or internals.

### MCP-05 Official SDK

- A remote server is built on an official SDK and the dependency is pinned and current. The official list and tiers are at <https://modelcontextprotocol.io/docs/sdk>. Tier 1 is the most complete and supported, and Tier 3 is the least mature, so note the tier of the SDK in use.
- A hand-rolled HTTP layer is `NEEDS INVESTIGATION` until the repo shows direct evidence for auth, validation, limits, and header checks.

### Client duties (when the target is a client)

Review only what the client code shows. Spec basis, 2026-07-28 authorization:

- Send the RFC 8707 `resource` parameter in both the authorization request and the token request, set to the MCP server's canonical URI (no fragment, no trailing slash unless significant), whether or not the authorization server advertises support.
- Use PKCE. Before redirecting the user, record the `issuer` from the validated authorization server metadata alongside the PKCE verifier (and `state`). An issuer taken from an unvalidated source defeats the check.
- Validate `iss` on the authorization response (RFC 9207) before sending the code to any token endpoint. If the metadata sets `authorization_response_iss_parameter_supported` to true, reject a response with no `iss`. Compare a present `iss` to the recorded issuer by exact string match, with no normalization. Apply this to error responses too, and don't act on or display `error`, `error_description`, or `error_uri` on a mismatch.
- Send the token only to the server it was issued for, in the `Authorization` header on every HTTP request and never in the query string. Never send a token to a different MCP server.
- Keep refresh tokens confidential in transit and storage, and don't assume one will be issued.
- Don't trust a server-provided session ID as proof of identity or authorization.

### Transport checks

- Streamable HTTP validates the `Origin` header on all connections and returns 403 for an invalid one (spec MUST). Servers meant for local use bind `127.0.0.1`, and `Host` is validated too. Some SDK handlers do neither, so look for the check in front of them.
- Servers on revision 2026-07-28 reject a request whose `MCP-Protocol-Version`, `Mcp-Method`, or `Mcp-Name` header disagrees with the body, with 400 and error `-32020`.
- `x-mcp-header` is not applied to sensitive parameters, because header values are visible to intermediaries.
- Tool names, descriptions, and annotations are static and server-controlled. Annotations are advisory and must not gate authorization.

## 4. Remote-code-execution vectors

Mark each vector SAFE, AT RISK, or N/A for every tool, citing code.

| Vector | Dangerous pattern | Safe alternative | Test to describe (owner runs in isolation) | CWE |
| --- | --- | --- | --- | --- |
| Command injection | `exec("convert " + args.file)`, `os.system(f"p {x}")`, `subprocess` with `shell=True` | `execFile("convert", [args.file])`, `subprocess.run([...], shell=False)` | Argument containing `; id` or `$(id)` must be treated literally or rejected | CWE-78 |
| Dynamic code evaluation | `eval`, `exec`, `new Function` on tool input or output | Allowlist or AST-based evaluation in a sandbox | Expression that would import a module or call a shell must be rejected | CWE-94, CWE-95 |
| Unsafe deserialization | `pickle.loads`, `yaml.load` with an unsafe loader, binary formats on untrusted data | `yaml.safe_load`, JSON plus schema validation | Crafted serialized input must be rejected or handled safely | CWE-502 |
| Path traversal | `readFile(args.path)` with no check | Canonicalize, then enforce an allowed base directory before read, write, or execute | `../../../` and absolute-path inputs must be rejected | CWE-22 |
| Template injection | Tool input used as template source | Fixed templates with parameters only | `{{7*7}}` or `${7*7}` in a value must not render `49` | CWE-1336 |
| Dependency hijacking | Unpinned ranges, internal package names resolvable on public registries | Exact versions, lock file with integrity hashes, scoped registries | Review the lock file and registry config; run the ecosystem's audit command only with the user's approval | CWE-829 |
| SSRF | `fetch(args.url)`, `requests.get(x)` with user input | Allowlist schemes and hosts, block loopback, private ranges, and link-local (for example the cloud metadata address) | A URL pointing at a link-local or loopback address must be rejected | CWE-918 |

Describe the tests; don't run them against any live server.

## 5. OWASP MCP Top 10

The OWASP MCP Top 10 (<https://owasp.org/www-project-mcp-top-10/>) is an early-version project (the repository labels it v0.1), and its own pages word two titles differently (MCP04 and MCP06). Cite the ids and note which wording you used. For each risk, mark PASS, FAIL, or NEEDS INVESTIGATION. Reuse results from section 3 where they fully cover a risk, and mark MCP07 and MCP09 N/A for a local-only server.

| Id | Risk | Check in source |
| --- | --- | --- |
| MCP01 | Token mismanagement and secret exposure | No hardcoded secrets; secrets injected at runtime; tokens and prompts redacted in logs; short-lived scoped tokens |
| MCP02 | Privilege escalation via scope creep | Least-privilege scopes, per-request authorization, no tool that widens its own capability at runtime |
| MCP03 | Tool poisoning | Static server-controlled definitions; outputs are data, not instructions |
| MCP04 | Supply chain and dependency tampering | Lock file, exact pins, no suspicious install scripts, trusted registries |
| MCP05 | Command injection and execution | Section 4 command and code vectors |
| MCP06 | Prompt injection via contextual payloads (also titled "Intent Flow Subversion") | External content returned to the model is truncated, labeled as data, and chained calls are bounded |
| MCP07 | Insufficient authentication and authorization | Unauthenticated and invalid-token requests rejected in the server; per-tool authorization |
| MCP08 | Lack of audit and telemetry | Tool calls logged with caller identity, tool, and time; logs centralized |
| MCP09 | Shadow MCP servers | Server is in inventory with an owner; no undocumented endpoints or ports; dev and staging isolated |
| MCP10 | Context injection and over-sharing | Responses are minimal; sensitive fields masked; no context shared across users |

## 6. Report

Put `file:line` evidence in every justification cell. Use text statuses (PASS, FAIL, NEEDS INVESTIGATION, N/A, SAFE, AT RISK).

```markdown
# MCP security review: <server>

Target: server | client   Revision: <date>   Transport: <stdio | HTTP>   Exposure: <local | network>   SDK: <name version>

## Controls
| Control | Status | Evidence |
| --- | --- | --- |
| MCP-01 Identity and audience | | |
| MCP-02 Sessions | | |
| MCP-03 Rate limits | | |
| MCP-04 Input validation | | |
| MCP-05 Official SDK | | |
| Transport checks | | |

## RCE vectors
| Vector | Status | Evidence |
| --- | --- | --- |

## OWASP MCP Top 10 (v0.1)
| Risk | Status | Evidence |
| --- | --- | --- |

## Findings
| Severity | Location | Impact | Narrowest fix |
| --- | --- | --- | --- |

## Manual follow-ups
- <check that source can't settle, and the artifact or access needed>
```

Use PASS only when the code clearly satisfies the control, FAIL when the violation is observable, and NEEDS INVESTIGATION when it depends on evidence outside the source.

## Exceptions

When a control can't be met, record the unmet control, the exact deviation, residual risk, and compensating controls. Route it to whoever approves security exceptions with an owner and a review date, and revisit it when the server, its tools, or its exposure changes.

## Sources

- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http>
- <https://modelcontextprotocol.io/specification/2026-07-28/server/tools> (Security Considerations)
- <https://modelcontextprotocol.io/docs/2026-07-28/sdk> (SDK tiers)
- <https://owasp.org/www-project-mcp-top-10/>
