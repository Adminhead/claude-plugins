# Vue, Pinia, and Nuxt test decisions

Read this when adding or revising a Vue component, composable, store, or Nuxt test. Use `unit-testing` for scope, scenario choice, and failure diagnosis. This note covers the Vue-specific seams, and it mirrors the stance of the `react` skill's component-testing reference.

First inspect the manifest, lockfile, test config, setup files, and nearby tests. Use the installed runner (Vitest or Jest), the mounting library (Vue Test Utils or `@testing-library/vue`), and local wrappers. Check version-sensitive APIs on <https://test-utils.vuejs.org>, <https://pinia.vuejs.org/cookbook/testing.html>, and <https://nuxt.com/docs/4.x/getting-started/testing>. Don't add a dependency for one test.

## Mount the real tree

Use `mount`, not `shallowMount`, for behavior tests. The Vue Test Utils guide says "The more you stub, the less production-like your test becomes," and advises `mount` with a few `stubs` over `shallow` when only one or two children are irrelevant. A shallow mount renders stubs in place of children, so a test passes while the real child is broken, and it asserts on stub markup nobody ships.

- Stub a child only when it has a heavy or unreachable side effect (a chart canvas, a network client). Stub that one child by name, and keep the rest real.
- Use `shallowMount` for a deliberate isolation test of a component whose children are the subject of other tests, and say so in the test name.
- Don't stub transitions or teleports by habit. Add the stub when the test needs it.

## Drive and assert like a user

- Find elements by role and accessible name first, then by label, then by visible text. With `@testing-library/vue`, use `getByRole('button', { name: … })`. With Vue Test Utils alone, select by element and role or label attribute (`find('button[type="submit"]')`, `find('[role="dialog"]')`). Use a class or `data-testid` only when nothing accessible identifies the element, and a failing role query is a signal that the markup may be inaccessible.
- Act through inputs a user has: `setValue`, `trigger('click')`, `trigger('submit')`. Await each call, or `await flushPromises()` after async work, then assert rendered text, accessible state, emitted events (`wrapper.emitted('save')`), or a store or request effect.
- Don't read `wrapper.vm` or internal refs, assert render counts, or snapshot DOM for behavior. Snapshots fit stable serialized data.
- One behavior per test, with deterministic fixture data and mocks reset in `beforeEach`.

## Pinia

- **Store logic.** Test a store directly with a fresh instance per test: `setActivePinia(createPinia())` in `beforeEach`, then call actions and assert state and getters. If the store depends on plugins, create a small app that installs them.
- **Components.** `createTestingPinia` from `@pinia/testing` goes in `global.plugins`. It stubs every action by default, so use that when the test only needs to know whether an action was called with certain arguments (`createSpy: vi.fn` is required unless Vitest globals are enabled). Seed state with `initialState`. Set `stubActions: false` only when the test must exercise the real action, and keep the network at its boundary.
- Getters are writable on a testing store for an edge case. Reset the override after the test.
- Pass plugins through `createTestingPinia({ plugins: [...] })`, not `.use()` afterward.
- `@pinia/testing` 2.x pairs with Pinia 4. Match the versions in the lockfile.

```ts
const wrapper = mount(CartSummary, {
  global: {
    plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { cart: { items } } })],
  },
});
await wrapper.get('button').trigger('click');
expect(useCartStore().checkout).toHaveBeenCalledOnce();
```

## Composables

Test a composable that uses no lifecycle hooks as a plain function. For one that uses `onMounted`, watchers, or `inject`, run it inside a small host component with `mount` and read what it returns or renders, so the lifecycle runs for real. Test watcher cleanup by changing the source and checking that stale work is canceled.

## Nuxt

- Install `@nuxt/test-utils`, `vitest`, `@vue/test-utils`, and `happy-dom` or `jsdom`. Use `defineVitestProject` in a Vitest `projects` list, so plain unit tests keep `environment: 'node'` and Nuxt-aware tests use `environment: 'nuxt'` (or a `// @vitest-environment nuxt` comment per file).
- `mountSuspended` mounts a component with Nuxt's context and async `setup`. `renderSuspended` does the same for Testing Library queries. `registerEndpoint` fakes a Nitro endpoint so `useFetch` runs for real against a controlled response. `mockNuxtImport` replaces an auto-import. All come from `@nuxt/test-utils/runtime`.
- Use `mockNuxtImport` once per import per file, or wrap the mock in `vi.hoisted` to change it between tests.
- For SSR and hydration claims, use a real server and browser through `@nuxt/test-utils/e2e` (`setup`, `$fetch`, `createPage`) or `e2e-testing`. A DOM-environment pass is not evidence about hydration.

## Environment

jsdom or happy-dom suits rendered content, names and states, and ordinary interaction. Use a real browser (Vitest browser mode or Playwright) when the claim depends on layout, CSS, viewport, native browser APIs, or focus behavior the DOM shim does not model. Install the Vue plugin in the test config the same way the app config does.
