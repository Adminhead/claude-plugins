# Vite plugins

Read this when choosing, ordering, or writing a plugin. Prefer the plugin the framework or repo already uses, and read its README for the installed Vite major.

## Common choices

| Need | Plugin | Notes |
| --- | --- | --- |
| React (Fast Refresh) | `@vitejs/plugin-react` | Version 6 requires Vite 8 and uses Oxc; Vite 7 stays on version 5. For the React Compiler, 6.1 adds an experimental `react({ compiler: true })` that needs `oxc-transform-react`, and the Babel route is `@rolldown/plugin-babel` with `reactCompilerPreset()`, per the plugin README |
| React with SWC | `@vitejs/plugin-react-swc` | Peer range covers Vite 4 to 8. Use it when the repo already does |
| Vue SFCs | `@vitejs/plugin-vue` | Peer range covers Vite 5 to 8 |
| Path aliases from `tsconfig.json` | `resolve.tsconfigPaths` (Vite 8) | Built in. Before Vite 8, use `vite-tsconfig-paths` or explicit `resolve.alias` entries |
| Type errors in the dev overlay | `vite-plugin-checker` | Peer range is Vite 5.4.21 and later. Runs `tsc`, `vue-tsc`, ESLint, and others. It does not replace a CI type-check |
| Declaration files for a library | `vite-plugin-dts` or `tsc --emitDeclarationOnly` | Vite itself emits none |
| Bundle report | `rollup-plugin-visualizer` | Use for a periodic audit, with `enforce: 'post'` |
| Offline support | `vite-plugin-pwa` | Adds a service worker, so confirm that it fits the cache and update policy |
| Old browsers | `@vitejs/plugin-legacy` | Adds fallback chunks. Add it on evidence of traffic that needs it |

Verify the version ranges before installing, because plugin peer ranges follow Vite majors.

## Writing a plugin

Start inline in `vite.config.*` and extract it only when it is reused. A plugin is an object with a unique `name` and hooks. The same plugin runs in dev and build.

```ts
function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    enforce: 'pre',        // optional: 'pre' | 'post'
    apply: 'build',        // optional: 'build' | 'serve'
    transform(code, id) {
      if (!id.endsWith('.custom')) return
      return { code: convert(code), map: null }
    },
  }
}
```

- `transform` edits source, `resolveId` plus `load` define virtual modules, `transformIndexHtml` edits the page, `configureServer` adds dev middleware, and `hotUpdate` customizes HMR per environment (Vite 6 and later).
- A virtual module's resolved id conventionally starts with `\0`, so other plugins skip it. User code imports `virtual:my-id`.
- Order matters. `enforce: 'pre'` runs before core plugins and `'post'` after the build plugins. `vite-plugin-inspect` shows what each plugin did to a module.
- Framework plugins handle HMR. Use `import.meta.hot` directly only for a custom store or dev tool. Mutate `import.meta.hot.data` (`data.count = 1`), never reassign it. `import.meta.hot` code is removed from production builds.

Plugin API: <https://vite.dev/guide/api-plugin>.
