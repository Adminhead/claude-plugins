# Plan: MCP servers in programming-core, plus tilt and mise skills

Status: in progress, 2026-10-18.

## Decisions (user, 2026-10-18)

1. **`programming-core` gains `grep-app` and `context7@claude-plugins-official`.** These replace two items from decision 2 in `docs/plans/plugin-adoption.md` (2026-10-17): "Context7 is added on its own when a project needs it" and `grep-app` as a direct install. `claude-plugins-official` is already allowlisted (`.claude-plugin/marketplace.json:11`), and it now serves `csharp-lsp` and `context7`.
2. **Context7 runs anonymous or with OAuth, not with an API key.** The official plugin's `.mcp.json` is only `{"type":"http","url":"https://mcp.context7.com/mcp?client=claude-code-plugin"}`. Its README says it picks up `CONTEXT7_API_KEY`, but its config sends no header, and a dependency can't add one. The server publishes OAuth metadata (`/.well-known/oauth-protected-resource`, authorization servers `clerk.context7.com` and `context7.com`), so a user signs in through `/mcp` to get their plan's limits. Using an API key would need a separate local plugin; we chose not to build one.
3. **New skill plugins: `tilt` (tilt.dev) and `mise` (mise.jdx.dev).** `devenv` already exists (`plugins/devenv`).
4. **Meta wiring:**
   - `tilt` joins `kubernetes-meta`.
   - `mise` and `devenv` stay direct installs, since each repo picks one.
   - `recommend-plugins` gets marker rows so it suggests each of them.

5. **Exa: `exa@claude-plugins-official` is a direct user-scope install that starts turned off.** It is not a `baseline` dependency, because a dependency can't default to off. A disabled dependency also disables `baseline`.
   - **When to turn it on:** the built-in WebSearch is unavailable on Bedrock and on Vertex with pre-4.x models, and when a deny rule blocks WebSearch.
   - **Installer:** `scripts/install.mjs` installs and then disables Exa, but only if Exa is installed at no scope and the user's settings don't enable it. It registers `claude-plugins-official` if that marketplace is missing.
   - **Settings example:** `examples/claude-settings/settings.global.json` sets `"exa@claude-plugins-official": false`.

Why `programming-core`: all seven stack metas install it, and both servers only matter while coding. `coding` ships a skill, and a plugin holds one component. `baseline` loads in every session. Cost: two third-party network MCP servers in every stack project.

## Slices

1. **tilt and mise plugins** (coder-high):
   - Scaffold with `scripts/plugins.py new <name> --kind skill`.
   - Write each SKILL.md per `skill-authoring`, with facts checked against docs.tilt.dev and mise.jdx.dev.
   - Add 3 trigger evals each, including one hard negative: tilt against kubernetes, helm and docker; mise against devenv.
2. **Manifests**, after slice 1 so `marketplace.json` has one writer:
   - `programming-core`: add `"grep-app"` and `{"name": "context7", "marketplace": "claude-plugins-official"}`, version 0.1.0 → 0.2.0.
   - `kubernetes-meta`: add `"tilt"`, version 0.1.0 → 0.2.0.
   - `recommend-plugins`: named rows `devenv.nix`/`devenv.yaml` → `devenv`, `mise.toml`/`.mise.toml`/`.tool-versions` → `mise`, `Tiltfile` → `tilt`, and a patch version bump.
   - Make the same version bumps in `.claude-plugin/marketplace.json`, because `scripts/plugins.py:141` checks that `plugin.json` and `marketplace.json` match.
3. **Docs:**
   - `docs/plans/plugin-adoption.md:34`: claude-plugins-official now serves `csharp-lsp` and `context7` (via `programming-core`).
   - `docs/plans/plugin-adoption.md:270`: `grep-app` moves into `programming-core`, and add `tilt` and `mise`.
   - `plugins/grep-app/README.md:26`: point "(Context7)" at the `context7` dependency.
4. **Verify:**
   - `claude plugin validate --strict` on each touched plugin.
   - `python3 scripts/plugins.py check`, then `catalog`.
   - Install smoke test in a throwaway `CLAUDE_CONFIG_DIR`. Install `python-meta` and confirm that `/mcp` shows grep-app and context7 connected. Install `kubernetes-meta` and confirm the tilt skill is listed.
5. **Commits** (Conventional Commits, explicit paths), then `ship-plugin` per plugin. Push only when asked.
   - `feat(tilt): add tilt skill plugin`
   - `feat(mise): add mise skill plugin`
   - `feat(programming-core): install grep-app and context7`
   - `feat(kubernetes-meta): install tilt`
   - `feat(recommend-plugins): suggest devenv, mise and tilt`
   - `docs(plan): ...`

## Acceptance criteria

- `plugins/tilt` and `plugins/mise` each ship one skill plus evals, and `check` and `validate --strict` pass.
- `programming-core` lists `grep-app` and `context7@claude-plugins-official`, and `kubernetes-meta` lists `tilt`. Versions match `marketplace.json`.
- A fresh `python-meta` install connects both MCP servers.
- `plugin-adoption.md` matches the new layout.

## Open

- Is the claude.ai Context7 connector on for this account? If it is, sessions show two copies of the Context7 tools.
