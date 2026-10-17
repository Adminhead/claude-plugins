---
name: game-publish
description: "Ships a game build to a store and plans the release: itch.io uploads with butler channels and versions, Steam with SteamPipe depots, app_build.vdf, steamcmd and branches, and Steam release timing (app fee wait, Coming Soon, reviews, Next Fest, discounts). Use for butler push, steamcmd or a Steam launch date."
---

# Game publish

Get an exported build onto itch.io or Steam, keep it updated, and plan a Steam launch date backwards from Valve's fixed waits. The engine export itself (presets, templates, signing) comes first and is not covered here.

Adapted from awesome-gamedev-agent-skills `itch-publish` and `steam-publish` (Apache-2.0, Copyright 2026 Abhishek Barali and contributors) and GodotPrompter `export-pipeline` references (MIT, Copyright (c) 2026 GodotPrompter Contributors); see LICENSE, LICENSE-MIT and NOTICE.

Not for building the export (`godot-export` for Godot), jam scoping (`game-prototype`), CI pipeline design in general (`gh-actions`), or in-game Steamworks API work such as achievements and overlay (use the engine's Steamworks binding docs). Pricing, tax and legal questions go to Steamworks docs and the user's own advisers. Use each plugin if installed.

## Credentials: the rule that comes first

- **Never write a credential into a file in the project**: not in scripts, `.vdf` build scripts, `.env`, CI YAML, `README` or notes. Never pass a password as a command-line argument; it lands in shell history and process lists.
- Interactive machines log in interactively: `butler login` (browser flow) and `steamcmd +login <build_account>` (prompts for password and Steam Guard).
- CI reads secrets from the CI secret store only: `BUTLER_API_KEY` as an env var; Steam's cached login token (`config.vdf`) restored onto an ephemeral runner. Never echo either.
- If a key or token reaches a log, a commit or a chat, treat it as burned: revoke the itch.io key on `itch.io/user/settings/api-keys`, and re-secure the Steam build account. Tell the user; do not try to scrub history as the fix.
- When asked to "save the key so it's easier", refuse that part and set up the secret store or interactive login instead.

## Pick the target

| Target | Read |
| --- | --- |
| itch.io page, `butler push`, channels, HTML5 games | `references/itch-butler.md` |
| Steam depots, `app_build.vdf`, steamcmd, branches, CI upload | `references/steampipe.md` |
| A Steam launch date, store assets, demo, Next Fest, launch discount | `references/steam-release-planning.md` |

Both stores at once is common; do itch.io first (minutes) and Steam in parallel (weeks of lead time).

## itch.io in short

1. Create the page at `itch.io/game/new`. Kind of project: **Downloadable** for native builds, **HTML** for a browser game. Keep it Draft until ready.
2. Install butler (`itchio.itch.io/butler`, or the permanent broth URL in CI), then `butler version` and `butler login`.
3. Push the exact folder a player runs, not an installer and not an archive of archives: `butler push <dir> <user>/<game>:<channel>`.
4. Name channels in lowercase kebab-case containing the platform (`windows`, `linux`, `mac`, `android`, `windows-beta`); the name sets the initial platform tag. Reuse the same names forever.
5. Pass `--userversion <v>` (or `--userversion-file <f>`) so players and the update API see your version, not an auto integer.
6. For HTML5, after the first push set the page Kind to HTML **and** tick "playable in browser" on the upload in Edit game. Neither follows from the channel name.
7. Check with `butler status <user>/<game>`; preview changes with `butler push-preview <dir> <user>/<game>:<channel>`.

## Steam in short

Two tracks run in parallel and both need Valve approval: the **store page** and the **build**.

1. **App fee and App ID.** Pay the Steam Direct fee (USD 100 per app); it creates the App ID everything hangs off. For a partner's first titles there is a 21-day wait from paying to releasing, and the tax verification can take up to 30 days, so this is step one of any date plan.
2. **Build account.** A separate Steam account with only *Edit App Metadata* and *Publish App Changes To Steam*. Releasing also needs *Manage pricing and discounts* on whoever clicks Release.
3. **App Admin config.** Launch options per OS, depots (one per OS where builds differ), every depot added to the Developer Comp package and the store package, then **Publish** the config. Unpublished config causes most first-upload failures.
4. **Build script and upload.** An `app_build_<AppID>.vdf` in the SDK's `tools/ContentBuilder/scripts/`; content in `content/`. Run `steamcmd +login <build_account> +run_app_build <path/to/app_build.vdf> +quit`. Use `"Preview" "1"` first to check file mappings without uploading.
5. **Set live.** Builds page: pick the build, Preview Change, Set Build Live Now on a beta branch, test it in the client, then promote to `default` by hand. `SetLive` in the script works only for beta branches, never `default`.
6. **Reviews.** Store page and build each take about 3 to 5 business days; submit each at least 7 business days ahead. The store page must be submitted before the build. Coming Soon must be public at least two weeks before release.
7. **Release.** Approved titles do not release themselves: Release App, Publish Now, Release Now.

## Gotchas

- **Installer or pre-compressed archives on itch.io** defeat patching; a tiny change re-uploads the whole blob. Push loose files.
- **A folder holding one `.zip`** is auto-unzipped by butler; `--no-auto-unzip` keeps it as one file.
- **`--hidden` works only when the push creates a new channel**; on an existing channel it errors.
- **itch.io rejects builds over 30 GB** total uncompressed size.
- **Mac or Linux players get no files** on Steam: those depots are missing from the package.
- **`status = 6` or "Failed to get application info"** from steamcmd: config not published, the build account lacks permission, or `ContentRoot`/`LocalPath` points at an empty folder. Read the logs in `BuildOutput`, not the console.
- **Logging steamcmd in again with a password** issues a new Steam Guard token and breaks the cached one in CI.
- **Store numbers move.** Every Steam rule in this skill and its references was checked against the Steamworks docs in October 2026. Before committing a user to a date, re-read the page named in `references/steam-release-planning.md` and say if a value changed.
