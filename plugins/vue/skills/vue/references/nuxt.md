# Nuxt 4 notes

Read this when the project uses Nuxt, or when Vue code runs during server rendering. Nuxt 4 is the baseline here (<https://nuxt.com/docs/4.x/getting-started/upgrade>). Check the installed version before relying on a default.

## Project layout

- The default `srcDir` is `app/`. Pages, components, composables, and `app.vue` live there, while `server/`, `public/`, and `shared/` stay at the root. `shared/` holds code used by both the Vue app and the Nitro server, and cannot import Vue or Nitro APIs.
- Auto-imports cover `ref`, `computed`, `useFetch`, and the like. Outside Nuxt, import them explicitly.

## Data fetching

- Use `useFetch` for a simple API read, `useAsyncData` when the fetcher is not a plain `$fetch` call or you need your own key, and `$fetch` for user-triggered writes. A top-level `$fetch` in a page runs on the server and again on the client.
- `useFetch` and `useAsyncData` forward server data to the client through the payload, so hydration does not fetch again. Call them in `setup`, a plugin, or route middleware, not inside an event handler.
- Keys identify the data. `useFetch` derives its key from the URL and options, and `useAsyncData` takes it as the first argument. Calls with the same key share `data`, `error`, and `status`. The handler, `deep`, `transform`, `pick`, `getCachedData`, and `default` must match across those calls, while `server`, `lazy`, `immediate`, `dedupe`, and `watch` may differ. A key can be a getter or a computed value, so a route param change refetches.
- In Nuxt 4, `data` is a `shallowRef`, so changing a nested property does not trigger updates. Replace the value or pass `deep: true`. `data` and `error` default to `undefined` instead of `null`, so adjust `=== null` checks. Nuxt removes the data when the last component using it unmounts.
- `status` is `idle`, `pending`, `success`, or `error`. Handle each in the template. `lazy: true` (or `useLazyFetch`) stops the navigation from waiting, and the UI needs a pending state. `server: false` skips the server fetch, so use it for data that does not affect SEO or first paint.
- Keep `useAsyncData` handlers free of side effects, since they run during SSR and hydration. Use `callOnce` for one-time work. Trim payloads with `pick` or `transform`.
- On the server, `useFetch` forwards the caller's headers and cookies to internal routes, except unsafe ones such as `host`.

## Hydration safety

The first client render must produce the same markup as the server.

- Do not read `Date.now()`, `Math.random()`, `localStorage`, `window`, or `window.innerWidth` while rendering on the server. Use `useState` for a value computed once, `useCookie` for persisted values, CSS media queries for layout, and `NuxtTime` for formatted dates.
- Run browser-only code in `onMounted`, behind `import.meta.client`, or inside `<ClientOnly>` (give it a fallback). A `.client.vue` component is the file-level version.
- Invalid HTML nesting (a `div` in a `p`) also causes mismatches.
- Import `useRoute` from Nuxt (auto-imported or `#app`), not from `vue-router`. Nuxt's version updates after the page content changes. Do not use `route.fullPath` to drive rendered markup, because the URL fragment exists only on the client. Avoid `useRoute` in middleware, which has no current route, and use the `to` and `from` arguments.
- Use `ssr: false` in route rules for a truly browser-only area, not as the default fix for a mismatch.

## Shared state

Never declare `const state = ref()` at module level, because the server shares that module between requests and leaks state across users. Use `useState('key', () => initial)`, which survives hydration and holds serializable values only (no classes or functions). Use Pinia through `@pinia/nuxt` for larger stores.

## Runtime config

Declare every key in `runtimeConfig` in `nuxt.config`, because an environment variable overrides only a declared key. Top-level keys stay on the server (`NUXT_API_SECRET`), and `runtimeConfig.public` keys reach the client (`NUXT_PUBLIC_API_BASE`). Read them with `useRuntimeConfig()`. Do not put a secret under `public`.

## Server routes

Handlers go in `server/api/` (prefixed `/api`) or `server/routes/`, as `defineEventHandler`. Suffix a file with the method (`.post.ts`). Validate input with the h3 helpers and the repo's schema library: `getValidatedRouterParams`, `getValidatedQuery`, and `readValidatedBody`. Authorize inside the handler, because every route is reachable directly (see `app-auth`, if installed).

## Route rules and lazy hydration

- `routeRules` in `nuxt.config` set rendering per route group: `prerender: true` for static HTML, `swr` for cached content that revalidates in the background, `isr` where the host supports it (such as Vercel or Netlify), `ssr: false` for client-only routes, and `redirect`, `headers`, or `cors`. Pick rules per group from the page's freshness and SEO needs.
- Delayed hydration is documented as `experimental.lazyHydration`. A component with the `Lazy` prefix takes one strategy prop (`hydrate-on-visible`, `hydrate-on-idle`, `hydrate-on-interaction`, `hydrate-on-media-query`, `hydrate-after`, `hydrate-when`, or `hydrate-never`) and emits `@hydrated`. A prop change on a lazily hydrated component hydrates it at once, and `hydrate-never` is wrong for anything users must operate. Confirm the feature status for the installed version.
- Use `NuxtLink` for internal links so Nuxt can prefetch route components.
