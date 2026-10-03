---
name: graphql
description: Design and review a public GraphQL API: whether GraphQL fits at all, schema naming and nullability, the Node interface, input and payload types, Relay cursor connections, typed error results, depth, breadth and cost ceilings, introspection, the federation trust boundary, and persisted-query policy. Use when designing or reviewing a GraphQL schema that third-party developers will query, setting query limits, or exposing a federated graph. Not for gqlgen or other server code (efficient-go:golang, if installed), REST contracts (api:rest-design), rate-limit headers (api:rest-design), or deprecation policy (api:versioning).
---

# Public GraphQL API design

Design for strangers. A third party writes queries you have never seen, so schema conventions, ceilings, and the trust boundary matter more than they do for your own apps.

## Gate: is GraphQL the right surface?

For a public API the default is REST. Choose GraphQL only when a trigger holds, and say which one.

- Several client types (web, mobile, partners) need different shapes of the same data.
- Clients need nested, variable data that REST would serve with many round trips or a growing set of purpose-built endpoints.
- Round-trip count dominates load time for the consumers.

REST gets URL-keyed HTTP caching, a fixed endpoint list to learn, and the widest tooling for free. GraphQL needs those rebuilt. Offering both is a valid result. If no trigger holds, stop and use `api:rest-design` if installed.

If first-party and third-party clients share the endpoint, design for the third party. A surface safe for strangers serves your own apps, and the reverse is false.

## Schema conventions

Write the conventions down once and lint against them. Consistency matters more than the particular choice.

- PascalCase singular type names, camelCase fields and arguments, SCREAMING_SNAKE_CASE enum values, `is`/`has`/`can` on booleans.
- Mutations model business actions (`publishPost`, `cancelOrder`), not one `updateOrder` that edits any field. Pick verb-first (`createUser`) or noun-first (`userCreate`) and use it everywhere.
- Every mutation takes a dedicated input type and returns a dedicated payload type. Never reuse an output type as an argument.
- Nullability is deliberate. Use `[Type!]!` for lists, so a caller gets an empty list and never a null list or null item. Make a field non-null only where the domain guarantees it. Per the spec, a null in a non-null field propagates to the nearest nullable parent, so reflexive non-null spreads damage. Keep mutation payload fields nullable enough to carry a partial failure.
- Implement `interface Node { id: ID! }` with `node(id: ID!): Node` on entities (the Global Object Identification pattern). The pattern doesn't require opaque IDs, but make them opaque anyway so clients don't parse them. Share one identifier with the REST surface when both exist.
- Expose object references (`author: User!`), not foreign keys (`authorId`). Put the key on the object's own `id` only.
- Don't merge types just to avoid repeating a field. `Viewer` and `TeamMember` can share `name` and still evolve apart.
- Write docstrings for the public reader. A description that names an internal system leaks architecture.

Read `references/schema-and-results.md` for the casing table, the mutation argument shape, and SDL for connections and result unions.

## Pagination

Paginate every list a third party can grow. A bare list can't gain pagination later without a breaking change.

- Default to Relay cursor connections (`edges`, `node`, `cursor`, `pageInfo`, `first` and `after`). Cursors stay stable under concurrent writes and stay fast at depth. Treat cursors as opaque.
- A plain `nodes` list with `endCursor` is a documented shortcut used by large public APIs, but it is not in the Relay spec. Take it only when no per-edge data will ever exist, and return a wrapper object so promotion to a full connection stays additive.
- Don't offer offset arguments on a growing public list. Concurrent writes duplicate and skip items.
- Clamp `first` to a documented maximum. The schema can't express the bound.
- Avoid a non-null `totalCount` that forces an expensive count.

## Errors

GraphQL has two channels, and each error type has one right home.

- The top-level `errors` array (with partial `data`) carries what a caller can't plan around: server faults, malformed or invalid requests, authentication.
- Expected business outcomes on mutations go in the schema as a union or interface result: `union CreateOrderResult = CreateOrderSuccess | ValidationError | InsufficientInventory`. The schema then documents every outcome and a client can't skip a case. Adding a member to a shipped union is a dangerous change, since clients with exhaustive handling can break, so list the likely outcomes early.
- Use result types on queries too when partial data is routine, such as fields backed by flaky upstreams.
- Relying on the `errors` array alone suits only a first-party surface where you control every client.
- Put a shared `ErrorCode` enum under either posture so clients switch on stable codes while message text can change.
- An unauthorized field must behave the same whether or not the resource exists. If it nulls in one case and errors in the other, the response shape tells an attacker which resources exist.

## Ceilings

A public graph lets strangers compose arbitrary queries, so decide the acceptable shape before any metering exists.

- **Depth.** Reject queries nested past a documented maximum at validation time, before any resolver runs. Start low for a public API and raise it only with a written reason.
- **Breadth.** Combine the page-size cap with caps on aliases, root fields, and batched operations per request. Depth alone doesn't stop a wide, shallow query.
- **Cost.** Where you can, estimate a query's cost statically and reject over-budget operations before executing them. Weight mutations above reads. Header and budget mechanics belong to your rate-limit policy.
- **Document each ceiling** with the exact error a violating query gets. Otherwise third parties find the limits through production failures.
- **Introspection.** Allow it for development and authenticated tooling, and turn it off for anonymous production callers. GraphQL.org notes this is security through obscurity and not sufficient alone.
- **N+1.** Batch relationship resolvers per request (the DataLoader pattern). Treat an un-batched relationship field as a must-fix finding.
- Set request timeouts as well.

## Federation boundary

Federation is internal composition, not public exposure. Make the router the only publicly reachable component, and keep every subgraph on a private network.

- The subgraph spec's `Query._service { sdl }` returns the subgraph's full schema, and the spec says it is for the router's use only. `Query._entities` resolves `@key` entities by representation. Turning off introspection doesn't remove either field, because composition needs them.
- Verify the boundary by probing each subgraph address from outside the private network and expecting a connection failure, not a GraphQL response.
- Use `@inaccessible` to keep internal fields out of the composed public schema.
- Adopt federation only when schema ownership truly splits across teams that ship independently. One team keeps one schema.

## Persisted queries

- **First-party clients.** Use a closed allowlist (trusted documents): extract operations at build time, register them, and reject the rest.
- **Third-party traffic.** GraphQL.org says trusted documents can't be used for public APIs, because third-party operations aren't known in advance. Protect these callers with the ceilings above. Offer optional persisted queries only as a bandwidth and CDN-caching feature.
- An allowlist is defense in depth. Keep the ceilings on all traffic.

## Evolution

GraphQL evolves one live schema with field-level `@deprecated`. Shape types so they can grow: payload objects can gain fields, while a bare scalar return can't. A result union can gain members only as a dangerous change that clients must be ready for. A date-versioned GraphQL API is also legitimate, so record the chosen stance for `api:versioning` if installed. Deprecation still costs integrators work, so don't treat it as free.

## Review output

For a design, give one section per step above: the gate verdict and which trigger fired, the convention set, the pagination choice per list, the error posture with its result unions, each ceiling with its value and rejection error, the federation boundary with the probe result, and the persisted-query policy per traffic class. For a review of an existing schema, report each hit as the anti-pattern, the SDL location, and the convention it breaks.

## Sources checked

spec.graphql.org (September 2025 edition lists the response format, `@deprecated`, introspection, and non-null propagation), relay.dev/graphql/connections.htm, graphql.org/learn (global object identification, pagination, response, security), and Apollo Federation's subgraph specification.
