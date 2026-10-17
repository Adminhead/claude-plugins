# itch.io with butler

Primary docs: the butler manual at `itch.io/docs/butler` (installing, login, pushing). Checked October 2026.

## Commands

```bash
butler version                                   # confirms install and PATH
butler login                                     # browser authorization for this machine
butler logout                                    # erase local credentials (does not revoke)
butler which                                     # path of the running binary
butler upgrade                                   # update butler itself

butler push ./build/windows studio/my-game:windows --userversion 1.2.0
butler push ./build/linux   studio/my-game:linux   --userversion 1.2.0
butler push ./build/mac     studio/my-game:mac     --userversion 1.2.0
butler push ./build/web     studio/my-game:html5   --userversion 1.2.0   # then set Kind = HTML

butler status studio/my-game                     # channels and latest builds
butler push-preview ./build/windows studio/my-game:windows --changes-only
```

`user/game` is the lowercase project slug from `https://user.itch.io/game`. The itch app (v26.12.0+) also has a graphical push UI with a bundled, self-updating butler, which suits users who avoid the command line.

## Channel names

- Containing `win` or `windows` tags Windows, `linux` tags Linux, `mac` or `osx` tags macOS, `android` tags Android. Several platforms in one name are allowed (`win-linux-mac-stable` for a Java build).
- There is no architecture tag. Web builds get no automatic tag: mark the upload "playable in browser" by hand.
- Convention: lowercase kebab-case (`windows-beta`, `linux-demo`, `soundtrack`). Each distinct name is a separate download on the page, so a typo creates a duplicate slot.
- Tags are only the initial guess; fix them with the checkboxes on Edit game, then Save.

## `butler push` flags

| Flag | Effect |
| --- | --- |
| `--userversion <v>` | Your version string instead of the auto-incrementing integer. Ordering is upload order, not semver. |
| `--userversion-file <f>` | Read it from a one-line UTF-8 file without BOM. |
| `--if-changed` | Skip the push when the content matches the latest build. |
| `--hidden` | New channel only: upload hidden until unhidden in Edit game. Errors on an existing channel. |
| `--ignore '<glob>'` | Exclude matching files; repeatable. Go `filepath.Match` syntax. |
| `--dry-run` | List every file that would be pushed; uploads nothing; no diff. |
| `--no-auto-unzip` | Push a folder holding a single `.zip` as that zip, not its contents. |
| `--dereference` | Upload symlink targets as copies (bloats Linux `.so` chains and macOS bundles). |
| `--fix-permissions`, `--auto-wrap` | Walk options, also accepted by `push-preview`. |

`push-preview` authenticates, downloads the previous build's signature and classifies each entry NEW, MODIFIED, DELETED or SAME. It costs about as much hashing as a real push.

## After a push

The build is live as soon as the upload finishes, using a fast default patch. The backend then builds a smaller optimized patch (bsdiff plus high-quality Brotli), which can take around 30 minutes on a large game and replaces the default patch automatically.

## CI

Authentication: set `BUTLER_API_KEY` from the CI secret store and butler uses it without `butler login`. Create the key on `itch.io/user/settings/api-keys` (the butler key shows source `wharf`). `butler login` on a workstation stores credentials in the user's config dir (`~/.config/itch/butler_creds` on Linux, `~/Library/Application Support/itch/butler_creds` on macOS, `%USERPROFILE%\.config\itch\butler_creds` on Windows); never copy that file into a repo or a CI variable dump.

Install in CI from broth, whose URLs are permanent (the itch.io page links expire). Download to a file and unzip; don't pipe into a shell:

```yaml
name: Publish to itch.io
on:
  push:
    tags: ["v*"]
jobs:
  butler:
    runs-on: ubuntu-latest
    env:
      BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      # ... build steps that produce ./build/windows and ./build/linux ...
      - name: Install butler
        run: |
          curl -fsSL -o butler.zip "https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default"
          unzip -q butler.zip -d butler-bin && chmod +x butler-bin/butler
          butler-bin/butler version
      - name: Push builds
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          butler-bin/butler push ./build/windows studio/my-game:windows --userversion "$VERSION"
          butler-bin/butler push ./build/linux   studio/my-game:linux   --userversion "$VERSION"
```

Other broth channels: `windows-amd64`, `darwin-amd64`; `-head` channels are bleeding edge. Older guides use `broth.itch.ovh`; the manual now gives `broth.itch.zone`. Never `set -x` in a step that has the key in its env.

On a remote host, `butler login` prints a URL: open it locally, copy the address of the page it redirects to, and paste it back into the terminal.

## In-game update check

Players who download directly don't auto-update. Query the latest user version (no auth):

```text
GET https://api.itch.io/wharf/latest?target=<user>/<game>&channel_name=<channel>
GET https://api.itch.io/wharf/latest?game_id=<id>&channel_name=<channel>
-> {"latest": "1.2.0"}   (field absent if the build has no user version)
```

Private games return "invalid game".
