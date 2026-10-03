---
name: vite
description: "Vite configuration and build behavior: env variables and what reaches the client bundle, dev vs build vs preview, chunking, library mode, SSR externals, dependency pre-bundling, dev-server proxy, Docker and monorepo access, and slow dev servers, for Vite 7 and 8. Use when editing vite.config.*, debugging a build that differs from dev, a missing or leaked env value, stale chunks after a deploy, or a slow or unreachable dev server. Not for React component behavior (efficient-js:react), Vue components (efficient-js:vue), TanStack Start (efficient-js:tanstack), or ESM/CJS runtime semantics (efficient-js:javascript)."
---

# Efficient Vite

This skill owns build and dev-server configuration. Framework code belongs to the framework skill: `efficient-js:react`, `efficient-js:vue`, or `efficient-js:tanstack` when the project uses TanStack Start. Module-format semantics belong to `efficient-js:javascript`.

## 1. Establish the version and the setup

- Read `package.json`, the lockfile, and `vite.config.*`. Run `npx vite --version` (or the project's script) and note the framework plugin and its version.
- Vite 8 replaces esbuild and Rollup with Rolldown and Oxc, and needs Node `^20.19.0 || >=22.12.0`. Vite 7 still uses esbuild for dev transforms and Rollup for builds. Option names differ between them, so look up each option for the installed major at <https://vite.dev/config/> (Context7 `resolve-library-id` then `query-docs` also works) before using it. Keep both majors working when the repo has not upgraded.
- Vite 8 renamed `build.rollupOptions` to `build.rolldownOptions`, `worker.rollupOptions` to `worker.rolldownOptions`, `optimizeDeps.esbuildOptions` to `optimizeDeps.rolldownOptions`, and `esbuild.*` to `oxc.*`. The old names still work with automatic conversion, so do not rewrite them unless the task is the upgrade (<https://vite.dev/guide/migration>).
- Run the narrowest check that reaches the change: `vite build` for build config, then `vite build && vite preview` to smoke-test the bundle. A dev-server run alone does not prove the production build works.

## 2. Dev, build, and preview differ

- The dev server serves source as native ESM and transforms each module on request. It pre-bundles dependencies once (section 8).
- `vite build` bundles for production with tree-shaking, splitting, and minification. A library that works in dev can fail in the build, mostly through CommonJS interop. Reproduce with the build, not the dev server.
- `vite preview` serves the built output locally. It is a smoke test, not a production server. Deploy `dist/` to a static host or a server that sets proper cache headers.
- Vite transpiles TypeScript and does not type-check (<https://vite.dev/guide/features>). Run `tsc --noEmit` (or `vue-tsc --noEmit` for Vue) in CI and before release. `vite-plugin-checker` can show errors in the dev overlay.

## 3. Env variables and secrets

- Vite loads `.env`, `.env.local`, `.env.[mode]`, and `.env.[mode].local`. Variables already in the process environment win, then mode-specific files, then the generic ones. Add `.env.local` and `.env.*.local` to `.gitignore`.
- Only variables whose names start with `VITE_` reach client code through `import.meta.env`. They are inlined into the bundle at build time, so anyone can read them. The prefix keeps accidental exposure down, but it does not protect a secret. Put API tokens, database URLs, and private keys behind a server or edge function, and keep only public values (API base URL, public keys, feature flags) in `VITE_` variables (<https://vite.dev/guide/env-and-mode>).
- Never set `envPrefix` to `''`. Vite's docs warn that it exposes all environment variables.
- `loadEnv(mode, envDir, prefixes = 'VITE_')` reads env files for use in `vite.config`. Passing `''` as the third argument loads every variable, including server secrets. That is safe only if none of them reaches client-visible config. A value copied into `define` is inlined into the bundle. List the prefixes you need (`['VITE_', 'APP_']`) and pass each `define` value deliberately.
- `define` replaces identifiers statically. Wrap string values in `JSON.stringify`.
- Type custom variables by augmenting `ImportMetaEnv` in `src/vite-env.d.ts`. In HTML, `%VITE_NAME%` is replaced at build time.
- Mode and `NODE_ENV` are separate. `vite build --mode staging` stays a production build unless `NODE_ENV` is changed.

## 4. Build output

- The default `build.target` is `baseline-widely-available` (Chrome and Edge 111, Firefox 114, Safari and iOS 16.4 in Vite 8). Lower it only for a measured audience need. `@vitejs/plugin-legacy` adds fallback chunks and polyfills, so add it on evidence, not by default.
- `build.minify` defaults to `'oxc'` in Vite 8. `'terser'` needs the `terser` package installed.
- Leave `build.sourcemap` off unless an error tracker needs the maps, because public maps expose the original source. Use `'hidden'` when you upload them and do not serve them.
- To split vendor code, use the bundler's own option. Vite 8 removed the object form of `manualChunks`. Use `build.rolldownOptions.output.codeSplitting` with `groups` (`name`, `test`, `priority`, `minSize`) (<https://rolldown.rs/reference/OutputOptions.codeSplitting>). In Vite 7, `build.rollupOptions.output.manualChunks` still takes an object or a function. Manual splitting can change module execution order, so test the built app. One chunk per package creates hundreds of small files.
- Set `base` when deploying under a sub-path, and use `import.meta.env.BASE_URL` for runtime URLs.

### Stale chunks after a deploy

New builds get new chunk hashes, so a tab opened before the deploy requests files that no longer exist. Vite emits `vite:preloadError` when a dynamic import fails, so reload the page from that handler (<https://vite.dev/guide/build>). Serve `index.html` with `Cache-Control: no-cache`, and keep the previous assets available for a deploy window.

## 5. Library mode

`build.lib` takes an `entry`, `formats`, and `fileName`. Single-entry libraries default to `es` and `umd`, and multi-entry libraries to `es` and `cjs`.

- Externalize every peer dependency (`build.rolldownOptions.external`, or `rollupOptions` in Vite 7), including JSX runtime paths such as `react/jsx-runtime`. A bundled peer causes duplicate-runtime errors in the consumer.
- Vite does not emit type declarations. Run `tsc --emitDeclarationOnly` or a declaration plugin.
- Check the `exports`, `main`, and `types` fields of `package.json` against the output files, then install the packed tarball in a scratch project.

## 6. SSR

Most apps should get SSR from a framework (Nuxt, SvelteKit, Astro, TanStack Start) rather than a custom `middlewareMode` server.

- When a dependency breaks in SSR, adjust `ssr.noExternal` (bundle it, which fixes most ESM-only package errors) or `ssr.external` (keep it as a Node import). `ssr.target` is `'node'` or `'webworker'`.
- Run Node with the same `--conditions` in dev and production when `ssr.resolve.externalConditions` is set (<https://vite.dev/config/ssr-options>).

## 7. Dev server

- **Proxy.** `server.proxy` maps a path to a backend. Add `changeOrigin: true` for virtual-hosted backends, `rewrite` to strip a prefix, and `ws: true` for WebSockets.
- **Containers and remote access.** The server listens on `localhost` by default. Set `server.host: true` (or `--host 0.0.0.0`) to reach it from outside a container. A hostname other than `localhost` or an IP address is rejected unless it matches `server.allowedHosts`. List the host you need, and avoid `true` because it allows any host. Behind a reverse proxy, set `server.hmr.clientPort` or the HMR host so the WebSocket connects.
- **Monorepos.** `server.fs.strict` blocks files outside the workspace root. List the directories you need in `server.fs.allow`. Keep `server.fs.deny` entries for `.env` files and keys.
- **File watching.** Use `server.watch.usePolling` where native events fail, such as WSL2 with files on the Windows side or some network mounts.

## 8. Dependency pre-bundling and slow dev servers

Vite pre-bundles dependencies once to turn CommonJS and UMD into ESM and to collapse packages with many internal modules. The cache lives in `node_modules/.vite` and is invalidated by lockfile, patch, config, and `NODE_ENV` changes.

- A "new dependencies found, reloading" loop usually means an import that the scanner could not see (a plugin transform, a dynamic import). Add it to `optimizeDeps.include`.
- Use `optimizeDeps.exclude` only for a dependency that is already valid ESM. Linked monorepo packages are treated as source by default.
- `vite --force` (or deleting `node_modules/.vite`) rebuilds the cache. Treat it as a diagnostic, not a fix.
- For a slow dev server, measure first: `vite --profile`, use the app, press `p` then Enter, and open the `.cpuprofile` in Speedscope. `vite --debug plugin-transform` shows slow transforms. Typical fixes from the performance guide are direct imports instead of barrel files, explicit file extensions, `server.warmup.clientFiles` for hot entry files, and trimming plugins that do heavy work in `buildStart`, `config`, or `configResolved` (<https://vite.dev/guide/performance>).

## 9. Plugins

Prefer what the framework and the repo already use. Read [references/plugins.md](references/plugins.md) when choosing, ordering, or writing a plugin.

## Report

State the Vite major and framework plugin versions, the config keys changed and why, and the commands run (`vite build`, `vite preview`, `tsc --noEmit`). Say what the dev-only checks did not cover.
