# CI export jobs

A GitHub Actions matrix that exports desktop and Web builds headlessly, with secrets from the environment and the version from git. Adapt the same steps to other CI systems.

## Contents

- Workflow
- Pinning and setup-godot inputs
- Secrets
- Version injection
- Android and macOS jobs
- Shader Baker runners
- Checks

## Workflow

```yaml
# .github/workflows/export.yml
name: export
on:
  push:
    branches: [main]
  release:
    types: [published]

permissions:
  contents: read

env:
  GODOT_VERSION: "4.7.2"        # major.minor.patch, matching project.godot's config/features

jobs:
  export:
    name: export ${{ matrix.preset }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - { preset: "Windows Desktop", artifact: windows, out: build/windows/game.exe }
          - { preset: "Linux",           artifact: linux,   out: build/linux/game.x86_64 }
          - { preset: "Web",             artifact: web,     out: build/web/index.html }
    steps:
      - uses: actions/checkout@<full-sha>            # pin actions to a commit SHA
        with:
          fetch-depth: 0                             # git describe needs tags
      - uses: chickensoft-games/setup-godot@<full-sha>   # v2 line
        with:
          version: ${{ env.GODOT_VERSION }}
          use-dotnet: false                          # default is true; set true only for C# projects
          include-templates: true
      - name: Version from git
        run: |
          v="$(git describe --tags --always --dirty)"
          echo "GAME_VERSION=$v" >> "$GITHUB_ENV"
          if grep -q '^config/version=' project.godot; then
            sed -i "s|^config/version=.*|config/version=\"$v\"|" project.godot
          else
            sed -i "/^\[application\]/a config/version=\"$v\"" project.godot
          fi
      - name: Import
        run: godot --headless --path . --import
      - name: Export
        run: |
          mkdir -p "$(dirname '${{ matrix.out }}')"
          godot --headless --path . --export-release "${{ matrix.preset }}" "${{ matrix.out }}"
          test -s "${{ matrix.out }}"
      - uses: actions/upload-artifact@<full-sha>
        with:
          name: game-${{ matrix.artifact }}-${{ env.GAME_VERSION }}
          path: build/${{ matrix.artifact }}/
          if-no-files-found: error
```

Notes:

- Preset names in the matrix must equal `name=` in `export_presets.cfg`; the 4.x Linux platform is `Linux`.
- A failed export can still leave a zero-byte file; `test -s` catches it along with the exit code.
- Separating `--import` makes import errors visible on their own step.
- Upload to stores in a later job that depends on this one (`game-publish` covers butler and steamcmd).

## Pinning and setup-godot inputs

`chickensoft-games/setup-godot` (v2.x) inputs: `version` (must include the patch, for example `4.7.2`, or `global` to read a `global.json`), `use-dotnet` (default **true**, which downloads the .NET editor), `include-templates` (default false; set true to export), `cache` (default true), `path`, `downloads-path`, `bin-path`. It puts `godot` on `PATH` and sets `GODOT` and `GODOT4`. Pin it and every other action to a full commit SHA, and bump the Godot version and the action together when the project upgrades.

For C# projects add `godot --headless --path . --build-solutions --quit` before exporting, and set `use-dotnet: true`.

## Secrets

`.godot/export_credentials.cfg` is not committed, so CI has no passwords or keys. Pass them as environment variables on the export step from the CI secret store:

| Variable | Used for |
|---|---|
| `GODOT_ANDROID_KEYSTORE_RELEASE_PATH`, `_USER`, `_PASSWORD` | Android release signing (write the keystore from a base64 secret to a temp file first) |
| `GODOT_ANDROID_KEYSTORE_DEBUG_PATH`, `_USER`, `_PASSWORD` | Android debug signing |
| `GODOT_WINDOWS_CODESIGN_IDENTITY_TYPE`, `_IDENTITY`, `_PASSWORD` | Windows signing |
| `GODOT_SCRIPT_ENCRYPTION_KEY` | PCK encryption (needs custom templates) |

Never echo them, never commit keystores, and delete decoded key files at the end of the job.

## Version injection

`application/config/version` is what `ProjectSettings.get_setting("application/config/version")` returns at runtime; the step above writes it from `git describe` (tags like `v1.2.3` produce `v1.2.3-4-gabc123` between releases). Windows `application/file_version` and `product_version` need a numeric `1.2.3.0` form; derive it from the tag rather than the describe string. Don't use an `EditorScript` run with `--script` for this: `--script` needs a `SceneTree` or `MainLoop` script, and `EditorScript` only runs inside the editor.

## Android and macOS jobs

- Android: add a Java 17 setup step and the Android SDK packages listed in mobile.md. On a fresh runner the editor seeds `export/android/java_sdk_path` and `export/android/android_sdk_path` from `JAVA_HOME` and `ANDROID_HOME`, so export those variables before the first Godot command (an existing editor settings file keeps its old values). Then run `godot --headless --path . --install-android-build-template --export-release "Android" build/android/game.aab` when the preset uses the Gradle build.
- macOS and iOS: export on a `macos-*` runner for Xcode signing and notarization, or use `rcodesign` from Linux for macOS apps (iOS still needs macOS and Xcode).

## Shader Baker runners

The Shader Baker (4.5+) does not run with `--headless`, and it bakes only for drivers the exporting OS supports (Windows: Vulkan and D3D12; macOS: Vulkan and Metal; Linux: Vulkan). To ship baked shaders:

- export the D3D12 preset on a Windows runner and the Metal preset on a macOS runner;
- run those exports without `--headless`, on a runner with GPU access and a display (a virtual display such as Xvfb on Linux may not provide a usable GPU; verify the baker actually ran by comparing PCK sizes);
- or accept unbaked shaders in CI builds and bake release builds on a workstation.

## Checks

- [ ] `GODOT_VERSION` matches `config/features` and includes the patch.
- [ ] `use-dotnet` set deliberately; templates included.
- [ ] Actions pinned to SHAs; `permissions: contents: read`.
- [ ] Output directories created; output file checked.
- [ ] Secrets only in env vars; no `export_credentials.cfg` in the repo.
- [ ] Version injected before export.
- [ ] Shader Baker presets exported on the right OS without `--headless`, or knowingly skipped.
