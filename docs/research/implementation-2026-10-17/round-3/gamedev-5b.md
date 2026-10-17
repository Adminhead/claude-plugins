# Batch gamedev-5b report

## Plugins created (direct installs, no dependencies, not in any meta)

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| game-prototype | skill | Timeboxed game prototyping: a greybox mechanic spike or vertical slice that answers one question with keep or kill criteria, and game-jam planning (scope to the clock, hour schedule, cut list, submit early). Use when prototyping a mechanic, greyboxing, or planning a jam or 48-hour build. | awesome-gamedev-agent-skills `workflows/prototype-fast`, `workflows/game-jam` @ 0a70cfc (Apache-2.0) | none |
| game-publish | skill | Ships a game build to a store and plans the release: itch.io uploads with butler channels and versions, Steam with SteamPipe depots, app_build.vdf, steamcmd and branches, and Steam release timing (app fee wait, Coming Soon, reviews, Next Fest, discounts). Use for butler push, steamcmd or a Steam launch date. | awesome-gamedev-agent-skills `workflows/itch-publish`, `workflows/steam-publish` (+refs) @ 0a70cfc (Apache-2.0); GodotPrompter `export-pipeline/references/steam-release-planning.md`, `distribution-itch-steam.md` @ bd9d180 (MIT) | none |
| game-assets | skill | Art direction and asset pipeline for game art, mainly 2D: a style bible, palette and scale rules, sprite, animation, tileset, UI and icon specs, an asset manifest with naming and licenses, image-generation briefs, and import checks. Use for a game's art style, sprites, tilesets, an asset list or sourcing art. | awesome-gamedev-agent-skills `disciplines/create-game-assets` (SKILL, 4 refs, 2 asset templates) @ 0a70cfc (Apache-2.0) | none |

Layout per plugin: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `LICENSE` (Apache-2.0 full text), `NOTICE` (with `Upstream: <url> @ <sha>` + `Paths:` lines), 3 evals (2 trigger + 1 hard negative). game-publish also ships `LICENSE-MIT` (Copyright (c) 2026 GodotPrompter Contributors).

- game-prototype: SKILL.md 92 lines, no references. Hard negative vs `prototype` (React layout variants); the mechanic eval also asserts `prototype` does not fire.
- game-publish: SKILL.md 63 lines + `references/itch-butler.md`, `steampipe.md`, `steam-release-planning.md`. Hard negative: a Godot export-template error (belongs to `godot-export`).
- game-assets: SKILL.md 79 lines + `references/art-direction.md`, `pipelines.md`; `assets/art-direction-brief.md` and `assets/asset-manifest.json` copied unchanged. Hard negative: SaaS web visual direction (`ui-direction`).

## Validation

- `claude plugin validate --strict plugins/{game-prototype,game-publish,game-assets}`: all pass.
- YAML parse of every SKILL.md and eval frontmatter: OK; SKILL name = plugin name; SKILL description == plugin.json description (checked by script). Descriptions are quoted (they contain ": ").
- grep for codegraph, claude-mem, coding-core:, github:, Efficient, old upstream skill names: none (outside NOTICE upstream paths).
- Evals were written but not run (`claude plugin eval` not run in this batch).

## Facts rechecked (2026-10-17)

- butler manual (pushing, installing, login): push syntax, channel tag rules, all flags in the table, push-preview, 30 GB cap, `BUTLER_API_KEY`, creds paths, broth URL is now `broth.itch.zone` (GodotPrompter's `broth.itch.ovh` is stale), itch app v26.12.0+ GUI push, wharf/latest API.
- Steamworks "Uploading to Steam": current doc uses `steamcmd +login <account_name> +run_app_build ... +quit` with no password; SetLive cannot target default; Preview/Local/FileExclusion/FileProperties; CI config.vdf token workflow; build account permissions; set_steam_guard_code.
- Steamworks appfee/onboarding/review/coming_soon/releasing/discounts/wishlist/demos/nextfest: USD 100 fee, $1,000 AGR recoup; 21-day wait for first titles; tax verification **up to 30 days** (GodotPrompter said 10-15 business days: corrected); 3-5 business day reviews, submit 7 business days ahead; 2-week Coming Soon; manual release; discount 10-95 %, launch <=40 % for 7-14 days, 30-day cooldowns, seasonal-sale exemption; wishlist emails >=20 % / >8 h / lowest package, 2-week cooldown; demo separate App ID, one wishlist notice within 14 days; Next Fest Feb/Jun/Oct, one edition, 5 weeks / 3 weeks demo review, press preview 11 days before, register from base game.
- Godot 4.7 importing_images: Lossless default, Detect 3D -> VRAM Compressed + mipmaps, filter/repeat on CanvasItem since 4.0, Mipmaps > Generate. (The project-setting name `rendering/textures/canvas_textures/default_texture_filter` is from memory, not on that page.)

## Deviations

- Credentials: game-publish opens with a credentials section (never write a credential into a project file, never put a password on a command line, CI via secret store only, revoke on leak, refuse "save the key" requests). Every steamcmd example drops `<password>`; CI examples pass secrets through `env:` and delete the restored config.vdf in an `always()` step.
- Dropped: the upstream "3-day safety delay after changing build-account email/phone" (not found in the docs checked); GodotPrompter's itch channel table and the third-party `Ayowel/butler-to-itch` action; the Pillow scripts and agents/openai.yaml from create-game-assets (replaced by manual or optional ImageMagick checks, with "confirm installed, never install without asking").
- game-publish has 3 references (design said 2), because the review added steam-release-planning.
- game-assets: provenance folded into SKILL.md; raster + 3D refs merged into `pipelines.md` with 3D condensed; Godot 3 "Flags > Filter" style advice replaced with 4.x facts.

## Unverified / TODO

- Steam store and library asset pixel sizes (kept from GodotPrompter, marked "not rechecked" in the reference).
- Linux steamcmd config.vdf location (written as "often `~/Steam/config/config.vdf`; check after login").
- "Steam asks about AI content on its content survey" (game-assets provenance) is from memory.
- Evals not run.

## Suggested follow-ups

- Coordinator: register the three plugins in marketplace.json and README as direct installs (not in `godot-meta` or `gamedev-core`).
- `recommend-plugins`: suggest `game-publish` when `export_presets.cfg`, `app_build_*.vdf` or `.itch.toml` exist.
- Run the 9 evals with `godot-meta` and `prototype` installed to check the `prototype` / `game-prototype` split.
