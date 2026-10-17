# Package-specific checks

Read the section for each package the change touches. Confirm every behavior against the docs for the installed `@tanstack/*` version and adapter. APIs, generated artifacts, SSR behavior, and defaults differ across majors and adapters.

## Query

- **Read when** changing query keys, cache lifecycle, mutations, cancellation, invalidation, optimistic updates, or SSR hydration.
- **Verify** the adapter's provider and hydration boundary, how the `signal` reaches the query function, and the documented mutation rollback and error behavior.
- **Test** the first fetch, cache reuse and refetch expectations, failure and recovery, and mutation-driven sync with no stale or duplicated results.

## Router

- **Read when** changing route declarations, search or path validation, loaders, route generation, navigation, or the Router–Query handoff.
- **Verify** whether routes are file-based and generated, who owns the route tree, and the documented SSR and error-boundary behavior.
- **Test** direct load, client navigation, nested layout and error behavior, reload, and back/forward, with both valid and malformed URL input.

## Form

- **Read when** changing field state, validation timing, submission, server-error mapping, or reset and persistence.
- **Verify** the adapter's field and subscription model and the contract for async validation and submission. Keep server-side validation and authorization.
- **Test** client validation, server rejection, successful submit, repeated-submit prevention, and the preserve or reset behavior the contract requires.

## Table

- **Read when** changing columns, row models, sorting, filtering, pagination, selection, or expansion.
- **Verify** which row models the installed version provides, and whether each transform runs client-side or comes from the remote data contract (`manualPagination`, `manualSorting`, `manualFiltering`).
- **Test** sort, filter, page, and selection behavior, empty and error states, and the server request inputs when data is remote.

## Virtual

- **Read when** adding or changing virtualized list or table rendering, measurement, scrolling, or infinite-data coordination.
- **Verify** the adapter's measurement and scroll-container requirements, including `estimateSize` and `measureElement` for dynamic sizes.
- **Test** long-list scrolling, dynamic-size measurement, loading and end boundaries, and keyboard focus. Check for overlap, gaps, and focus stranded on unmounted items. Test in a real browser, since jsdom has no layout.

## Start

- **Read when** changing server functions, server/API routes, middleware, SSR, streaming, or client/server data boundaries.
- **Verify** the installed version's execution boundaries and serialization rules. Keep secrets and authorization decisions on the server.
- **Test** a direct SSR request, client navigation and hydration, and server failure handling. Confirm that no server-only data appears in the HTML or client bundle.
