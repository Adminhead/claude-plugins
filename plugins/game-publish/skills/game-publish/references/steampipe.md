# Steam with SteamPipe

Primary doc: Steamworks "Uploading to Steam" (`partner.steamgames.com/doc/sdk/uploading`), plus "Branches" (`/doc/store/application/branches`) and "Depots" (`/doc/store/application/depots`). Checked October 2026. All script files are Valve KeyValues (VDF): `"key" "value"`, braces for nesting, `//` comments.

## ContentBuilder layout (Steamworks SDK)

```text
tools/ContentBuilder/
  builder/         steamcmd.exe (Windows)
  builder_linux/   steamcmd.sh (Linux)
  builder_osx/     steamcmd (macOS)
  content/         the runnable build players get
  output/          logs and chunk cache (safe to delete; speeds re-uploads)
  scripts/         *.vdf build scripts
```

Bootstrap once by running steamcmd in its builder folder so it self-updates. macOS: `cd builder_osx`, `chmod +x steamcmd`, `bash ./steamcmd.sh`, then `exit` at the `Steam>` prompt. The Steamworks SDK is not redistributable: don't commit it to a public repo.

## Single-depot app build

```text
// scripts/app_build_1000.vdf
"AppBuild"
{
    "AppID"       "1000"
    "Desc"        "1.0.0 launch build"     // internal; shown in Your Builds
    "ContentRoot" "..\content\"            // relative to this script
    "BuildOutput" "..\output\"             // a separate disk is faster
    // "Preview" "1"                       // logs and manifest only, uploads nothing
    // "SetLive" "beta-qa"                 // auto set live on a BETA branch; never default
    "Depots"
    {
        "1001"
        {
            "FileMapping"
            {
                "LocalPath" "*"
                "DepotPath" "."
                "Recursive" "1"
            }
        }
    }
}
```

## Multi-depot with depot scripts

Keep the app script thin and give each depot its own `depot_build_<DepotID>.vdf`:

```text
"Depots"
{
    "1001" "depot_build_1001.vdf"   // Windows
    "1002" "depot_build_1002.vdf"   // Linux
}
```

```text
// scripts/depot_build_1002.vdf
"DepotBuild"
{
    "DepotID" "1002"
    // "ContentRoot" "..\content\linux\"   // optional per-depot override
    "FileMapping"
    {
        "LocalPath" "linux\*"
        "DepotPath" "."
        "Recursive" "1"
    }
    "FileExclusion" "*.pdb"
    "FileExclusion" "*.debug"
    "FileProperties"
    {
        "LocalPath"  "settings.cfg"
        "Attributes" "userconfig"     // written at runtime: never overwritten, never fails verify
    }
}
```

`versionedconfig` is like `userconfig` but is overwritten when the depot copy changes; use it only for format changes. `InstallScript` marks and signs a client install script; most games need none. `Local` builds to a SteamPipe Local Content Server for install testing.

## Running a build

```bash
# Linux / macOS; Windows uses builder\steamcmd.exe with the same arguments
./tools/ContentBuilder/builder_linux/steamcmd.sh +login <build_account> +run_app_build "$PWD/tools/ContentBuilder/scripts/app_build_1000.vdf" +quit
```

`+login <account>` with no password prompts for the password and Steam Guard on first use, then reuses the cached token. Do not add the password to the command or to a wrapper script. steamcmd hashes files into roughly 1 MB chunks, uploads only new chunks, and ends with a global BuildID. The build is not live yet.

At the `Steam>` prompt, `find <partial>` lists matching commands when you forget a name.

## Branches

1. Create a branch on the Builds page in App Admin: no spaces in the name; add a password for a private branch.
2. Upload, or target it from the script with `"SetLive" "<branch>"`.
3. Builds page: pick the build, choose the branch in "Set build live on branch", Preview Change, Set Build Live Now.
4. Testers opt in: game Properties, Betas, pick the branch (and enter the password).
5. Promote the tested build to `default` by hand. `default` cannot be set live from a script. For a released app, setting a build live is confirmed through the build account's verified methods.

## CI upload

The documented CI path reuses steamcmd's cached login token; no password is stored anywhere.

1. On a trusted machine: `steamcmd +login <build_account>`, enter the password and the Steam Guard code, type `info` to confirm it is connected, then `quit`.
2. The token is in `config/config.vdf` under the steamcmd install (on Linux often `~/Steam/config/config.vdf`; check after the login). Store its base64 as a CI secret, for example `STEAM_CONFIG_VDF`, with the account name as `STEAM_BUILD_ACCOUNT`.
3. Each run restores it on an ephemeral runner, logs in without a password, and saves the refreshed file back if the runner is persistent; steamcmd may update it after a login.

```yaml
- name: Restore steamcmd login token
  env:
    STEAM_CONFIG_VDF: ${{ secrets.STEAM_CONFIG_VDF }}
  run: |
    mkdir -p "$HOME/Steam/config"
    printf '%s' "$STEAM_CONFIG_VDF" | base64 -d > "$HOME/Steam/config/config.vdf"
    chmod 600 "$HOME/Steam/config/config.vdf"
- name: Upload to Steam
  env:
    STEAM_BUILD_ACCOUNT: ${{ secrets.STEAM_BUILD_ACCOUNT }}
  run: steamcmd +login "$STEAM_BUILD_ACCOUNT" +run_app_build "$PWD/steam/app_build_1000.vdf" +quit
- name: Remove token
  if: always()
  run: rm -f "$HOME/Steam/config/config.vdf"
```

Rules: run this only on tag or release events from protected branches, never on pull requests from forks; never print or upload `config.vdf` as an artifact; logging in again with a password issues a new Steam Guard token and invalidates the stored one. On `Account Login Denied`, Steam Guard is blocking: take the code from the build account's email, run `set_steam_guard_code <code>` in steamcmd, log in interactively on the trusted machine, and refresh the secret.

## Patch size

- Don't compress or encrypt your own pack files across asset boundaries; a small change then rewrites the whole blob. Steam compresses on its side.
- Keep asset order stable, group pack files by level or feature at about 1 to 2 GB, and add new pack files for new content rather than rewriting big ones.
- Godot: a single large `.pck` changes in place; consider splitting DLC or late content into extra packs.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Failed to get application info for app NNNN` | Wrong App ID, account lacks access, config never published | Check the App ID; Publish the app config |
| `ERROR! Failed 'DepotBuild ...' status = 6` | Missing permission, or `ContentRoot`/`LocalPath` empty | Grant Edit App Metadata and Publish App Changes; check paths are relative to the script |
| `Account Login Denied` | Steam Guard | `set_steam_guard_code <code>`, re-login on a trusted machine |
| Uploaded but players don't get it | Not set live, or only on a beta branch | Set live on the right branch; `default` is manual |
| Mac or Linux install no files | OS depot not in the package | Add every depot on Associated Packages & DLC |
| "Invalid content configuration" at launch | No build live on that branch, or bad launch options | Set a build live; fix Installation launch options |
