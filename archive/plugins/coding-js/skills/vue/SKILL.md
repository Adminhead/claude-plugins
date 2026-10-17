---
name: vue
description: "Vue 3 component and state work with the Composition API (script setup), Pinia stores, and Nuxt 4 data fetching and hydration: props, emits and defineModel, composables, ref vs reactive, watchers and cleanup, template refs, SSR safety, and focused component tests. Use when adding, changing, reviewing, or debugging .vue files, Pinia stores, or a Nuxt app (stale state, lost reactivity, hydration mismatches, duplicate fetches). Not for React (coding-js:react), Vite configuration (coding-js:vite), TanStack's Vue adapters (coding-js:tanstack), or visual design (web:web-design, if installed)."
---

# Efficient Vue

This skill owns Vue component structure and local state, Pinia stores, and Nuxt page data and hydration. It does not own bundler configuration (`coding-js:vite`), visual direction (`web:web-design`, if installed), language-level concerns (`coding-js:javascript`, `coding-js:typescript`), or TanStack Query, Router, and Form (`coding-js:tanstack`).

## Before editing

- Read the affected component, its callers, nearby tests, `package.json`, the lockfile, and `vite.config.*` or `nuxt.config.*`. Note the installed Vue, Nuxt, and Pinia versions.
- Check version-sensitive APIs against <https://vuejs.org>, <https://nuxt.com/docs>, and <https://pinia.vuejs.org> (or Context7) for the installed version. Vue 3.5 added reactive props destructure, `useTemplateRef`, `onWatcherCleanup`, `useId`, and lazy hydration. Nuxt 4 changed the default `srcDir` to `app/` and the data-fetching defaults. Pinia 4 is ESM-only and needs Vue 3.5.11 or later. Do not assume an API exists in the installed version.
- Follow the repo's style (`<script setup lang="ts">` unless the code uses the Options API). Don't convert existing components as a side effect.
- List the visible states, props in, events out, and error and recovery behavior. Note whether the code runs on the server.

## State ownership

Classify each value, then place it:

- A prop, local UI state, a value derived from other values, shared UI state, or server data.
- Keep local state in the component that owns the interaction, and lift it to the nearest parent that must coordinate it.
- Derive with `computed`. Don't copy a prop or store into a second `ref` and sync it with a watcher. A computed value has no side effects and never mutates its inputs.
- Use `provide`/`inject` for a stable cross-tree concern such as a theme or config. Use Pinia for state shared across distant parts of the app, not for state that belongs to one component or one form.
- Fetch server data with the framework's tool (`useFetch` or `useAsyncData` in Nuxt), a query library the repo already uses, or an explicit composable. Do not copy fetched data into a store without a reason.

### Reactivity rules

- Use `ref` by default. It can be replaced wholesale. Use `reactive` only for an object that you never reassign or destructure, because both break reactivity.
- Use `shallowRef` for a large structure that is replaced rather than mutated (a parsed document, a big list from an API).
- Remember `.value` in script and automatic unwrapping in templates (top-level refs only).

### Props, emits, and models

- Props flow down and are read-only. For an initial value, copy once into a `ref`. For a transformed value, use `computed`.
- Declare props and emits by type: `defineProps<{ label: string }>()` with `withDefaults` for defaults, and `defineEmits<{ select: [id: string] }>()`.
- In Vue 3.5 and later, destructured props stay reactive because the compiler rewrites them to `props.x`. Pass them to `watch` or a composable through a getter (`watch(() => count, …)`, `useThing(() => count)`), because the bare value is a plain snapshot. Before 3.5, read `props.x` or use `toRefs`.
- Use `defineModel()` (Vue 3.4 and later) for `v-model`. A `default` on the model with no value from the parent desynchronizes the two sides.

## Pinia

- Prefer setup stores (`defineStore('cart', () => { … })`) when the project uses them. Return every state property, because Pinia cannot track private state, and private state breaks SSR and devtools.
- Destructure state and getters with `storeToRefs(store)`. Actions can be destructured directly.
- Put business rules in actions, and keep components thin. Handle loading and error in each async action.
- In Nuxt, add Pinia with `@pinia/nuxt`. Do not create a store at module scope outside `setup`, because the server shares modules between requests.

## Watchers, refs, and composables

- Prefer `computed` for derived values and event handlers for work caused by a user action. Use `watch` to synchronize with something outside Vue (a request, a storage write, a widget).
- Watch a getter for a prop or a nested property (`watch(() => props.id, …)`). Avoid `deep: true` on large objects.
- Cancel stale work. Call `onWatcherCleanup()` (Vue 3.5, synchronously inside the callback) or use the `onCleanup` argument to abort a request when the source changes. Stop a watcher created asynchronously yourself, because only synchronously created ones stop on unmount.
- Use `flush: 'post'` when the callback reads the updated DOM.
- Use `useTemplateRef('name')` (3.5) for template refs. The value is `null` until the component mounts, and refs in `v-for` do not follow source order. Expose methods to a parent with `defineExpose`.
- Name composables `useX`. Accept `MaybeRef` inputs through `toValue()`, return refs, and remove listeners and timers in `onUnmounted`. Avoid module-level state in composables, because on the server it leaks across requests. Use `useState` in Nuxt.

## Templates

- Give `v-for` a stable domain key, never the index when items can reorder or hold state.
- Do not put `v-if` and `v-for` on one element. Filter in a `computed` or wrap with `<template v-for>`.
- Render user-supplied HTML with `v-html` only after sanitizing it. Prefer text interpolation.
- Use `useId()` (3.5) for ids that must match between server and client.
- Start with native elements, labels, and keyboard behavior. The accessibility rules in `web:web-development`, if installed, apply unchanged.

## Nuxt and SSR

Read [references/nuxt.md](references/nuxt.md) when the project uses Nuxt, or the code runs on the server. It covers `useFetch` and `useAsyncData` keys and defaults, hydration safety, `useState`, runtime config, route rules, and lazy hydration.

## Performance

Reproduce a symptom and measure it first, with Vue devtools, the browser Performance panel, or the build report. Then fix the cause: misplaced state, an over-broad watcher, or a large reactive structure. `shallowRef`, `v-memo`, `<KeepAlive>`, and async components are tools for a measured problem. `v-once` and `v-memo` add invalidation risk when used by default. In an SSR app, `defineAsyncComponent` with a `hydrate` strategy (`hydrateOnVisible`, `hydrateOnIdle`) can defer below-the-fold interactivity.

## Tests

Read [references/vue-component-testing.md](references/vue-component-testing.md) when writing or revising a Vue, Pinia, or Nuxt test. It uses full mounts by default.

## Report

Cover the changed components, where each piece of state lives, any watcher and what it synchronizes, accessibility states checked, and before-and-after numbers when performance was the request. Stop when the requested behavior has direct evidence.
