---
name: tanstack
description: "TanStack Query, Router, Form, Table, Virtual, and Start: state ownership, query keys, cache invalidation, loaders, search-param validation, server-driven tables, virtualization, and SSR/hydration boundaries. Use when code imports @tanstack/* or when debugging stale/duplicate data, lost form values, table/pagination mismatches, or Start server functions. Not for general React component design (efficient-js:react), Vite configuration (efficient-js:vite), Vue work outside TanStack (efficient-js:vue), or visual design."
---

# Efficient TanStack

Each package owns one kind of state. Keep that ownership explicit.

| Package | Owns |
| --- | --- |
| Router | route structure, navigation, path params, shareable search state |
| Query | remote-data lifecycle, cache freshness, refetch, mutation sync |
| Form | field values, touched/submit state, client validation |
| Table | columns, row models, sort, filter, pagination, selection, expansion (headless) |
| Virtual | visible-range calculation and item measurement |
| Start | server functions, server/API routes, middleware, SSR, streaming |

For component structure and effects, use `efficient-js:react`. For regression test scope, use `efficient-testing:unit`, if installed.

## 1. Establish the contract and versions

- Read the affected route, component, or server boundary and its closest tests. State the user-visible result, the source of truth, and the failure behavior.
- Check `package.json`, the lockfile, the framework adapter (`@tanstack/react-*`, `solid-*`, `vue-*`), existing providers, and any generated route tree.
- **Look up every API through Context7** for the installed package and major version before using it. Imports, option names, generated-route conventions, SSR and hydration behavior, and Start APIs change across majors and adapters. Never copy a snippet across adapters or majors. If the version is unknown, give only version-independent advice.
- Read [references/packages.md](references/packages.md) for each package the change touches. It lists what to verify and how to test that package.

## 2. Assign each state to one owner

- Put route hierarchy, navigation, and shareable state in Router. Validate and normalize search and path input at the route boundary before app code reads it.
- Put fetched remote data in Query. Keep ephemeral UI state out of the cache.
- Put editable drafts in Form. Final validation and authorization stay on the server.
- Table is headless. The app owns markup and controls.
- Virtual does not fetch, own table state, or replace semantic interaction.
- Never let client-provided authorization state or server-only credentials cross the Start boundary.
- Derive anything that one owner already has. Never duplicate it into a second store.

## 3. Choose the narrow integration pattern

- **Route data.** Router decides when a route is entered or invalidated. Query manages caching when caching is needed. Use the documented Router–Query integration for the installed versions, typically `ensureQueryData` in the loader and `useSuspenseQuery` in the component. Never fetch independently in both the loader and the component without a defined cache handoff.
- **Query keys.** Keys must be stable and serializable, and include every input that changes the result. The key shape and the request arguments must stay aligned. After a mutation, invalidate or update only the affected key scope.
- **Optimistic updates.** Add one only when the UX needs it and every failure or cancellation path restores the prior state.
- **Forms.** Keep drafts out of search params unless the product requires a shareable or restorable value. Submit through the established mutation or server boundary. Prevent duplicate submits, and map server validation errors back to fields.
- **Server-side tables.** The validated table state (sort, filters, page) is the request input and belongs in the query key. Never mix server pagination with client-side sort or filter over a partial page. Use client-side modes only when the full dataset is intentionally loaded.
- **Virtualization.** Virtualize only for large or unbounded collections with a measured render or scroll problem, or an explicit scale requirement. Combine it with infinite queries only when page, cursor, index, loading, and end-of-list contracts are explicit.
- **Start.** Use Start only when the app already does or the request requires it. Keep browser-only code off the server path.

## 4. Implement one coherent change

- Preserve provider placement, error boundaries, and request conventions. Keep one QueryClient and one router per application boundary, because duplicate providers split the cache or navigation state.
- Never hand-edit generated route files (`routeTree.gen.ts`). Change their inputs and run the project's generator or dev server.
- Skip wrappers, persisted cache, prefetching, manual memoization, and external table control unless the contract or a measurement requires them.

## 5. Model observable states

Cover these where they apply:

- initial pending
- success
- empty success (distinct from failure)
- recoverable error
- background refetch
- mutation pending
- mutation failure
- retry and recovery

Give route failures a route-level recovery path. Keep semantic controls, labels, focus order, and keyboard operation in forms, tables, and virtualized lists.

## 6. Verify and diagnose

- Run the narrowest typecheck, test, lint, build, or route-generation command that reaches the change. Then exercise the package-specific scenarios in `references/packages.md`. Use `playwright-cli:playwright-cli` (if installed) or the claude-in-chrome skill for real browser checks such as back/forward, hydration, and scroll.
- **Stale or duplicate data.** Check provider scope, query-key inputs, `enabled` logic, the loader-to-component handoff, and mutation invalidation.
- **Lost form values.** Separate draft state from URL state, and check for remounts or resets.
- **Table mismatch.** Check whether the dataset is partial and which side owns each transform.
- **Hydration failure.** Compare server output with the first client render before adding guards.

## Decision rules

- Put shareable navigation state in search params, not transient widget state.
- Use Query for data from a remote authority that has freshness needs. Don't use it in place of local state.
- Virtualization is a measured rendering optimization, not a pagination strategy.
- Don't control Table state externally unless another owner must persist or drive it.
- The server is authoritative for permissions, validation, totals, cursors, and mutation outcomes, even when the client predicts them.
- Take defaults such as `staleTime` and `gcTime`, persistence, SSR guarantees, and signatures from the installed version's docs, never from memory.
