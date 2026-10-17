---
name: design
description: Design what an MCP server exposes to agents: a small set of workflow tools instead of API endpoint mirrors, tool descriptions and parameters, risk tiers and safeguards for write tools, resource-server auth, and versioning of the tool surface. Use when planning or restructuring an MCP server's tools before building, when agents pick the wrong tool, or when adding write actions. Not for implementing the server (`mcp:build`), reviewing server code (`mcp:review`), wiring an existing MCP server into a Claude Code plugin (`plugin-dev:mcp-integration`, if installed), or building the OAuth authorization server (`api:oauth-provider`, if installed).
---

# Design an MCP server's tool surface

An agent sees a server as a list of tool names, descriptions, and schemas. Design that list as a product surface for a model that has no other documentation. This skill produces the design; `mcp:build` implements it and `mcp:review` checks the result.

The protocol is date-versioned and moves. This skill was checked against the 2026-07-28 revision. Read the latest at <https://modelcontextprotocol.io/specification/latest> before citing a requirement to someone.

## Gather the inputs

Read the repo, the existing API contract (OpenAPI, GraphQL schema, SDK), and any prior design notes first. Ask with AskUserQuestion only for what the files can't answer:

- Which jobs do agents need done, and which of those write, delete, spend money, or message people?
- Is the audience a developer's local tools (stdio) or unattended agents and many users (remote HTTP)?
- Does an OAuth authorization server already exist for this product?

## 1. Curate the tool surface

Design top-down from user workflows, not bottom-up from endpoints. Every tool's name and description is loaded into the agent's context on each session, so each extra tool costs attention and makes mistakes more likely.

- Aim for 5 to 15 tools per server, each doing one job. Collapse endpoint chains into one workflow tool (`acme_create_invoice(customer_id, items)`, not `get_customer` + `get_price` + `post_invoice`).
- Derive tools from the existing stable API contract rather than hand-building a parallel surface, so the two can't drift.
- Write each description for a reader who has never seen the product. State when to use the tool, what it returns, which parameters are required, and how it differs from its nearest sibling. Descriptions are the strongest lever on tool selection, so budget review time for them.
- Shape parameters so a wrong call is hard (poka-yoke): enums over free strings, absolute identifiers over relative ones, bounded integers, required fields marked required.
- Use verb-first, service-prefixed names in `snake_case` (`acme_list_invoices`). The spec asks for 1 to 128 characters from letters, digits, `_`, `-`, and `.`. The prefix keeps names unique when an agent runs several servers.
- Paginate lists with a `limit` (default 20 to 50) and return a cursor and a has-more flag.
- Return results in the form the agent needs: concise text, plus `structuredContent` and an `outputSchema` when the caller will parse it.
- Report failures the model can fix as tool results with `isError: true` and an actionable message. Reserve protocol errors for malformed requests and server faults, and never put stack traces or internals in either.
- Give each tool exactly one risk tier (step 2). A tool that reads and also irreversibly writes is two tools.
- Set the annotations honestly (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and treat them as hints. The spec requires clients to treat annotations as untrusted unless the server is trusted, so they cannot enforce anything.
- Keep a generic "run any endpoint" tool, toolset switching, or dynamic tool loading for a demonstrated breadth need, not as the default.

## 2. Make write tools safe

Enforcement has to live on the server, because a user can switch clients or disable a client-side prompt. Annotations and client confirmation dialogs help a supervised user but do not count as controls.

Start with scoped credentials and a verified read-only mode, put approval on every contained write, and disable irreversible or deployment-triggering tools by default. Add the rest as write volume or autonomy grows. Read [write safety](references/write-safety.md) for the six patterns (scoped credentials, read-only lockdown, human approval, risk-tiered gates, dry-run, idempotency and spend caps), and the tier table.

## 3. Choose hosting and auth

- Pick stdio when a developer's client launches the server on the same machine. Credentials come from the environment, and the authorization spec says stdio servers should not follow the HTTP OAuth flow.
- Pick Streamable HTTP for anything shared, hosted, or used by unattended agents. Design every instance to be interchangeable behind a load balancer. The 2026-07-28 revision removes protocol sessions, so state belongs in your own store, keyed by an explicit handle the tool returns (the spec's "Stateful Tools" section shows the pattern).
- For a remote server, act as an OAuth 2.1 resource server only. Validate tokens and never mint them. Build the authorization server separately (`api:oauth-provider`, if installed) or use an existing identity provider.
  - Publish protected resource metadata (RFC 9728) and answer an unauthenticated request with 401 and a `WWW-Authenticate` header that points to it.
  - Accept only tokens issued for this server as audience (RFC 8707). The spec says servers must not accept or transit any other tokens, so never forward the caller's bearer token to an upstream API. Get a separate upstream credential (token exchange or a service credential) and keep the user's identity in your audit log.
  - Return 403 with `insufficient_scope` and the needed scopes when a token lacks permission.
- On a locally run HTTP server, bind to `127.0.0.1` and validate `Origin` and `Host`. The spec requires the Origin check to stop DNS rebinding.
- Validate every input against its schema with bounds, canonicalize paths, and rate limit calls. The tools spec lists these as server requirements.

## 4. Version the tool surface

Three layers change at different speeds, so version them separately:

1. **Protocol revision.** Pin exact SDK versions and read the release notes on upgrade. The revision is negotiated, so one server can serve older and newer clients during a transition.
2. **Your public API.** Renaming or removing a tool is a breaking change because agents find tools by name. Alias the old name and publish a deprecation window.
3. **Names, descriptions, and schemas.** No spec standardizes this layer, and a wording change can alter which tool a model picks even when the schema is unchanged. Treat a description edit as a breaking change: review it like code, hash the full surface in CI to catch drift, and run a fixed set of golden prompts that must still select the right tools.

## Optional: interactive UI

MCP Apps lets a tool return an interactive HTML view. Read [MCP Apps](references/mcp-apps.md) only when text and structured output cannot carry the job.

## Deliver the design

Write a short design document (or update the existing one) with:

- A table of tools: name, one-line job, parameters, read or write, risk tier, safeguards.
- The transport and auth posture, and where credentials come from.
- What was deliberately left out, and the golden prompts for the surface.

Check it against these gates before handing it over:

- Every write tool has one risk tier and at least one safeguard, and every irreversible tool is approval-gated or disabled by default.
- A remote server has resource metadata, audience validation, and no token passthrough.
- The surface stays within 5 to 15 tools unless a breadth need is written down.
- No description reads as a docs fix: each was written for tool selection and has a golden prompt.

Hand the design to `mcp:build` for implementation, and to `mcp:review` before release.

## Sources

- <https://modelcontextprotocol.io/specification/2026-07-28/server/tools> (errors, annotations, names, security)
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization> (resource server duties)
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http> (Origin validation, binding)
