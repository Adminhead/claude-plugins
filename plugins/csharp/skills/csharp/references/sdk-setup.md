# Local SDK install and global.json

Adapted from the upstream `setup-local-sdk` skill (dotnet/skills); the PowerShell forms and team-script templates were not ported.

Read this when the SDK that `global.json` asks for isn't installed, when trying a preview SDK without touching the system install, or when pinning an SDK for a team or CI. Don't install anything system-wide; that's the user's decision.

## How SDK selection works

`dotnet` walks up from the current folder to the first `global.json` and picks an installed SDK that satisfies `sdk.version` under the `rollForward` policy. Check what resolves with `dotnet --version` and `dotnet --list-sdks` from the repo root. A `global.json` in a parent folder can be the one that applies.

| `rollForward` | Picks |
| --- | --- |
| `latestPatch` (default when `version` is set) | Same feature band, latest patch |
| `latestFeature` | Same major.minor, latest feature band |
| `latestMajor` | Newest installed, any version |
| `disable` | Exactly `version` |

`allowPrerelease: true` only when a preview SDK is intended.

## Install into the repo (host SDK 10+)

Since .NET 10, `global.json` `sdk.paths` lets the host find an SDK in a repo-local folder. If the system `dotnet` is older than 10, `paths` is ignored: say so and stop.

1. Check for an existing `.dotnet/` and ask before replacing it.
2. Download the official install script, then run it (never pipe it into a shell):

   ```bash
   script="$(mktemp "${TMPDIR:-/tmp}/dotnet-install.XXXXXX")"
   curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$script"
   bash "$script" --channel 11.0 --quality preview --install-dir .dotnet   # or --version <exact>
   rm -f "$script"
   ./.dotnet/dotnet --version
   ```

3. Merge into `global.json`, keeping other keys (`msbuild-sdks`, `test`, `tools`). Back it up first.

   ```json
   {
     "sdk": {
       "version": "<installed version>",
       "rollForward": "latestFeature",
       "allowPrerelease": true,
       "paths": [".dotnet", "$host$"],
       "errorMessage": "Required .NET SDK not found. Run ./install-dotnet.sh to install it locally."
     }
   }
   ```

   `.dotnet` first, then `$host$` (the system install) as fallback. Use `rollForward: "disable"` for an exact version. Add `errorMessage` only if the repo ships an install script.
4. Add `.dotnet/` to `.gitignore`.
5. Workloads: run them with the local binary (`./.dotnet/dotnet workload install <id>`); the system `dotnet` writes workload metadata to the wrong root.
6. Verify `dotnet --version` from the repo root shows the local version.

Undo: delete `.dotnet/` and remove `paths` and `errorMessage` from `global.json`.

## Gotchas

- `paths` affects SDK resolution only. `dotnet app.dll` or an apphost still uses the system runtime unless `DOTNET_ROOT` points at `.dotnet`.
- CI: `actions/setup-dotnet` with `global-json-file: global.json` installs the pinned SDK.
- For a team script, wrap the same download-then-run steps in `install-dotnet.sh` with `set -euo pipefail` and patch `global.json` with `jq` rather than overwriting it.
