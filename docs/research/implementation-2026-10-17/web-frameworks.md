# Batch web-frameworks: implementation report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `react` | skill | Changes, reviews and debugs React components: state ownership, effects, keys, render purity, Server Components and Actions, accessibility, measured performance, React 19 upgrades and component tests. Use for .tsx/.jsx behavior or render cost, such as "this list lags when I type", "it re-renders too much", effect loops or hydration mismatches. | archive/plugins/coding-js/skills/react (+ 7 references); eval `stance-react-measure-first` from archive/plugins/coding-js/evals | none |
| `vite` | skill | Configures and debugs Vite 7 and 8 (Rolldown/Oxc): env variables and client-bundle exposure, dev vs build vs preview, chunking, library mode, SSR externals, pre-bundling, proxy and container access. Use when editing vite.config.*, when a build differs from dev, an env value is missing or leaked, chunks go stale after a deploy, or the dev server is slow. | archive coding-js/skills/vite (+ references/plugins.md); eval `vite-vs-javascript` | none |
| `vue` | skill | Builds and debugs Vue 3 components with the Composition API, Pinia stores and Nuxt 4 data fetching: props, emits, defineModel, composables, reactivity, watchers, SSR safety and tests. Use when adding, changing or debugging .vue files, Pinia stores or a Nuxt app, such as lost reactivity, stale state, hydration mismatches or duplicate fetches. | archive coding-js/skills/vue (+ nuxt.md, vue-component-testing.md) | none |
| `tanstack` | skill | Works with TanStack Query, Router, Form, Table, Virtual and Start: state ownership, query keys, cache invalidation, loaders, search-param validation, server-driven tables, virtualization and SSR boundaries. Use when code imports @tanstack/*, or for stale or duplicate data, lost form values, table and pagination mismatches, or Start server functions. | archive coding-js/skills/tanstack (+ packages.md) | none |
| `web-development` | skill | Builds or repairs a browser-facing web feature end to end: semantic HTML and forms, responsive CSS, keyboard and focus, request and response contracts, server validation, error mapping and measured performance, verified in a real browser. Use for a form, page or flow that must work for real users, an HTTP API contract change, or a browser or network bug. | archive/plugins/web/skills/web-development (+ 3 references) | none |

## Edits made

- All: "Efficient X" headings renamed to plain names; descriptions rewritten in third person, "Not for ..." lists moved into each body's ownership/hand-off paragraph; old `coding-js:*`, `testing:*`, `web:*`, `design:*`, `playwright-cli:*`, `auth:auth` refs rewritten to `react`, `vite`, `vue`, `tanstack`, `javascript`, `typescript`, `unit-testing`, `e2e-testing`, `web-design`, `ui-direction`, `accessibility-review`, `playwright-cli`, `app-auth`. Context7 references reworded to "the Context7 MCP tools, if available, else the official docs".
- react: `web:web-design` -> `web-design` (existing system) / `ui-direction` (new UI). Added `LICENSE` (MIT, Vercel Engineering) for the react-performance-catalog adaptation.
- web-development: hand-offs now `react`, `tanstack`, `web-design` (existing product), `ui-direction` (new UI / visual reshape), `app-auth`, `unit-testing`, `e2e-testing`. Removed the Playwright MCP (`mcp__plugin_web_playwright__*`) paragraph from browser-diagnostics.md (the Playwright MCP is not adopted); `api-contract-review.md` also points to `api-rest-design`.
- vite: rechecked against vite.dev (migration guide, releases, getting started, build/shared options) and npm registry on 2026-10-17. Changes: Vite 8 is current (8.3), 7.3 gets important fixes; Node `^20.19.0 || >=22.12.0` applies to both 7 and 8 (archive implied 8 only); old option names are "deprecated but auto-converted"; added the Vite 8 consistent CJS `default` interop change and `legacy.inconsistentCjsInterop`; added Vite 7 default target (Chrome/Edge 107, Firefox 104, Safari 16.0) next to Vite 8's (111/111/114/16.4); `build.minify` is `'esbuild'` in 7, `'oxc'` in 8; Lightning CSS is Vite 8's default CSS minifier; manualChunks function form is deprecated in 8 (object form removed). plugins.md: `@vitejs/plugin-react` 6 requires Vite 8 (Vite 7 stays on 5); 6.1 adds experimental `react({ compiler: true })` via `oxc-transform-react`, Babel route still `@rolldown/plugin-babel` + `reactCompilerPreset()`; plugin-react-swc peer ^4-^8 and plugin-vue ^5-^8 confirmed; vite-plugin-checker peer >=5.4.21 added. Confirmed unchanged: renames to `rolldownOptions`/`oxc`, `resolve.tsconfigPaths` (boolean, default false), `codeSplitting`.
- vue/tanstack/react version facts spot-checked on npm (2026-10-17): react 19.3.1, vue 3.5.44, nuxt 4.6.2, pinia 4.1.0 (ESM, peer vue ^3.5.11), @pinia/testing 2.0.2, motion 14.3.0. No text changes needed; skills already defer version-specific APIs to installed-version docs.
- Evals: moved into `plugins/react/evals/stance-react-measure-first/` and `plugins/vite/evals/vite-vs-javascript/`; grader `input_match` regexes changed from `coding-js:<x>` to `"(<x>:)?<x>"`. scaffold.sh reviewed (writes package.json and one .tsx only; safe).

## Validation

- `claude plugin validate --strict plugins/{react,vite,vue,tanstack,web-development}`: all passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<n>/skills/<n>`: all valid.
- grep for codegraph, claude-mem, coding-core:, coding-js:, github:, testing:, web:, design:, auth:auth, playwright-cli:, "Efficient ", dynamic-workflows, plugin_web: no matches.
- Evals not run (`claude plugin eval` costs model runs; not required by the brief).

## Deviations

- Descriptions for vite, tanstack and web-development are 351-356 characters, marginally over the ~350 target.
- `click-path-audit-vs-react` eval left in the archive for the click-path-audit implementer (its `not-react` grader should now match `"(react:)?react"`).

## Unverified / TODO

- The upstream vercel-labs/agent-skills repo has no top-level LICENSE; MIT taken from the skill's SKILL.md frontmatter. Copyright holder phrased as "Vercel Engineering (Vercel, Inc.)".
- Exact Skill-tool input format for plugin skills (`react:react` vs `react`) not tested; grader regex accepts both.
- TanStack Table is now v9 and Start requires Vite >= 8; the skill stays version-neutral, so no text change was made.

## Follow-ups

- Coordinator: register the five plugins; `react`, `vite`, `web-development` go in `web-meta`; `vue`, `tanstack` are direct installs.
- Run `claude plugin eval plugins/react` and `plugins/vite` once registered.
