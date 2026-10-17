# Presets, CLI, feature tags and packs

## Contents

- CLI flags
- export_presets.cfg
- Feature tags
- PCK patches, DLC and mods
- Encryption
- Desktop options
- Dedicated-server preset

## CLI flags

| Flag | Purpose |
|---|---|
| `--headless` | headless display and dummy audio; required on machines without a GPU (CI), and keeps a window from opening elsewhere |
| `--path <dir>` | project directory (contains `project.godot`) |
| `--export-release "<preset>" <path>` | release export; `<path>` includes the file name, its directory must exist |
| `--export-debug "<preset>" <path>` | debug template build |
| `--export-pack "<preset>" <path>` | data pack only; `.pck` or `.zip` by extension |
| `--export-patch "<preset>" <path>` | pack with only files changed against the preset's base packs |
| `--patches <a.pck,b.pck>` | base packs for `--export-patch` (comma-separated) |
| `--install-android-build-template` | install the Gradle template, used with an export flag |
| `--import` | start the editor, import resources, quit |
| `--build-solutions` | build C# solutions (implies editor) |
| `--quit-after <n>` | quit after n frames (smoke runs) |
| `--main-pack <file.pck>` | run with a specific pack |
| `--verbose` | detailed logs |
| `-- <args>` | pass user arguments; read with `OS.get_cmdline_user_args()` |

Rules:

- The editor binary exports; an export template binary can't.
- Relative output paths resolve against the project directory.
- Exit status is non-zero on failure; check it and check the output file exists.
- `--check-only` does nothing without `--script <file>`.

## export_presets.cfg

Written by the editor; commit it. One `[preset.N]` block plus `[preset.N.options]` per preset (4.7 shape):

```ini
[preset.0]
name="Windows Desktop"
platform="Windows Desktop"
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="*.json"
exclude_filter=""
export_path="build/windows/game.exe"
encrypt_pck=false
encrypt_directory=false

[preset.0.options]
binary_format/embed_pck=true
application/icon="res://icon.png"
application/product_name="My Game"
application/file_version="1.2.0.0"
application/product_version="1.2.0.0"
codesign/enable=false

[runnable_presets]
; 4.7+: platform name to preset, replacing per-preset runnable=true
```

- Don't edit it while the editor has the project open; the editor rewrites it on save.
- Copy option keys from the class reference (`EditorExportPlatformWindows`, `...Android`, `...Web`, `...MacOS`, `...IOS`, `...LinuxBSD`) rather than guessing them.
- Platform names: `Windows Desktop`, `Linux`, `macOS`, `Web`, `Android`, `iOS`.
- `export_filter`: `all_resources`, `scenes` (selected scenes and their dependencies), `resources` (selected resources), `exclude`, or `customized`.

## Feature tags

Built-in tags include platform (`windows`, `linux`, `macos`, `web`, `android`, `ios`), category (`pc`, `mobile`), build (`debug`, `release`, `editor`, `template`), architecture (`x86_64`, `arm64`, and others), precision (`single`, `double`), `threads` and `nothreads` (Web), `movie`, and `dedicated_server`. There is no `headless` tag; check `DisplayServer.get_name() == "headless"`.

Custom tags go in the preset's Features tab (`custom_features`) and only apply to exported builds. Override a project setting per tag in Project Settings (pick the setting, choose the feature, Add); `project.godot` stores it as `key.tag=value`, for example a lower-quality rendering default for `.mobile` or `.web`.

## PCK patches, DLC and mods

- Export a full release PCK and keep it. For a patch, open the preset's Patching tab, add the release PCK under Base Packs, and export with Export as Patch (or `--export-patch`); only changed resources go in. Add each shipped patch to Base Packs so the next patch excludes it. Delta encoding makes patches smaller at a load-time cost.
- 4.7+: an Android APK or AAB can be the base pack.
- Load packs early (an autoload), before scenes that `preload()` the replaced resources:

```gdscript
func _ready() -> void:
    var path := OS.get_executable_path().get_base_dir().path_join("dlc1.pck")
    if not ProjectSettings.load_resource_pack(path):     # 2nd arg false: don't replace existing files
        push_warning("DLC pack missing: %s" % path)
```

- Build packs from code with `PCKPacker` (`pck_start`, `add_file`, 4.7+ `add_file_from_buffer`, `add_file_removal`, `flush`).
- Loading PCKs runs their scripts with full privileges. Sign or verify patches you download (the `Crypto` class) and never load packs from untrusted locations.

## Encryption

Preset Encryption tab: Encrypt Exported PCK, Encrypt Index (`encrypt_directory`), include and exclude filters, and a 64-hex-character key (`openssl rand -hex 32`), or `GODOT_SCRIPT_ENCRYPTION_KEY` in CI. It requires export templates compiled from source with the same key; the official templates can't read encrypted packs. 4.7+: sparse patch PCKs support index encryption too. Treat it as obfuscation: the key ships inside the binary.

## Desktop options

- Windows: `binary_format/embed_pck` for a single exe; `application/*` metadata and icon (4.5+ native, no rcedit); `application/export_d3d12` and `application/export_angle` control the extra driver DLLs; `debug/export_console_wrapper` adds a console `.exe` for debug builds; codesign through SignTool or `osslsigncode` with `GODOT_WINDOWS_CODESIGN_IDENTITY_TYPE`, `GODOT_WINDOWS_CODESIGN_IDENTITY`, `GODOT_WINDOWS_CODESIGN_PASSWORD`.
- macOS: bundle identifier and version under `application/*`; Codesign = Xcode codesign (on macOS), rcodesign (Linux and Windows, PKCS#12 certificate) or Built-in ad-hoc; Notarization = notarytool or rcodesign with App Store Connect API keys; staple after notarization. Privacy usage descriptions (camera, microphone) go in the preset's privacy options.
- Linux: `binary_format/embed_pck`, architecture (`x86_64`, `arm64`); ship a tarball or AppImage.

## Dedicated-server preset

1. Duplicate the desktop preset for the server OS; set Resources > Export Mode to Export as dedicated server.
2. In the resource list, mark visual resources Strip Visuals (keeps references, drops texture data) or Remove; keep anything the server logic reads.
3. Export; the build gets the `dedicated_server` tag and runs headless automatically. Disable rendering work at startup if any remains (`RenderingServer.set_render_loop_enabled(false)` is an option for server-only processes).
4. Alternatively export only a PCK and place it next to an export template binary renamed to the PCK's base name.
5. Shader Baker is always off for these exports.
