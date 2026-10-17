---
name: godot-export
description: Godot 4 export and builds. Export templates, export_presets.cfg, headless CLI exports (--export-release, --export-pack), Web threads and COOP/COEP, Android keystores and AAB, iOS and macOS signing, dedicated-server builds, PCK patches, CI export jobs. Use for "build for Windows/Web/Android/iOS" or export errors.
license: Apache-2.0 AND MIT
---

# Godot export

Turn a Godot project into platform builds from the editor, the CLI or CI. Written for Godot 4.x, checked against 4.7. Version-gated facts are tagged inline (`4.5+`); per-minor changes live in the `godot` skill's version notes.

Not for: uploading to Steam or itch.io (steamcmd, butler, depots, store pages; `game-publish`); the networking code of a server (`godot-multiplayer`); C# project and `.csproj` setup (`godot-csharp`); writing shaders (`godot-shaders`); running tests in CI (`godot-testing`).

## Orient first

1. Read the version from `config/features` in `project.godot` (and the renderer: Web supports only Compatibility; C# projects can't export to Web).
2. Read `export_presets.cfg`: preset `name=`, `platform=`, `export_path=`, filters, `[preset.N.options]`. Confidential options (keystore and codesign passwords, the encryption key) live in `.godot/export_credentials.cfg`, which is not committed, so a fresh clone or CI runner lacks them; supply them through environment variables.
3. Find the editor binary (`godot` on `PATH`, a `GODOT` env var, or the CI setup step). Exports need an editor build, not an export template, and installed templates of exactly the same version, including `-stable`, `-rc` or `.mono` flavor.

## Workflow

1. Install templates: Editor > Manage Export Templates > Download, or install the `.tpz` offline. In CI let the setup action install them.
2. Create presets in Project > Export (prefer the editor over hand-writing `export_presets.cfg`), set the export path, icons, features and resource filters, and commit `export_presets.cfg`.
3. Export:

   ```bash
   mkdir -p build/linux                 # the target directory must already exist
   godot --headless --path . --export-release "Linux" build/linux/game.x86_64
   godot --headless --path . --export-debug "Windows Desktop" build/win/game.exe
   godot --headless --path . --export-pack "Linux" build/game.pck   # .pck or .zip by extension
   ```

   The preset argument is the exact `name=` (case- and space-sensitive; quote names with spaces). A relative output path is relative to the directory holding `project.godot`, not the shell's cwd. On a fresh checkout, export implies an import pass; run `godot --headless --path . --import` first when you want import errors separated from export errors.
4. Check the result: the command's exit code, that the file exists, and a smoke run of the build (`./build/linux/game.x86_64 --headless --quit-after 300` for a non-interactive start; `--quit-after` counts frames).

Full flag list, preset structure, feature tags, PCK patches, encryption and desktop platform options: [references/presets-and-cli.md](references/presets-and-cli.md). Android and iOS: [references/mobile.md](references/mobile.md). GitHub Actions matrix, version injection and secrets: [references/ci.md](references/ci.md).

## Platform notes

- **Windows:** 4.5+ writes the `.exe` icon and version metadata natively from `application/*` preset options, so drop any `rcedit` step. Code signing uses SignTool on Windows or `osslsigncode` elsewhere (`GODOT_WINDOWS_CODESIGN_*` env vars).
- **macOS:** unsigned or un-notarized apps are blocked by Gatekeeper when downloaded. Sign with Xcode `codesign` on a Mac or `rcodesign` from Linux and Windows, notarize with `notarytool` or `rcodesign`, then staple. "Built-in (ad-hoc only)" signing helps local testing only. A `.app` exported from Windows loses its executable bit; finish it on macOS or Linux.
- **Linux:** the 4.x platform is `Linux` (the old `Linux/X11` name is 3.x; some docs examples still show it). `chmod +x` the binary when the archive step loses permissions.
- **Web:** since 4.3 the default export is single-threaded and needs no special headers; that's the choice for itch.io, Poki and CrazyGames. Turning on the preset's Thread Support (`variant/thread_support`) or Extensions Support requires cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. If the host can't send them, the PWA option Ensure Cross Origin Isolation Headers injects them through a service worker. Serve over HTTP(S), never `file://`; keep `index.html` and don't rename exported files. Web audio defaults to Sample playback (no audio effects).
- **Dedicated server:** a separate preset with Resources > Export Mode = Export as dedicated server strips textures and materials, adds the `dedicated_server` feature tag and forces headless. Run it on an export template binary, not the editor. Detect at runtime with `OS.has_feature("dedicated_server")`, or `DisplayServer.get_name() == "headless"` when started with `--headless`.
- **Android and iOS:** keystores, AAB, Gradle builds, signing, Team ID, lifecycle and permissions are in [references/mobile.md](references/mobile.md).

## Runtime checks

```gdscript
func _ready() -> void:
    if OS.has_feature("dedicated_server"):
        _start_server()
    elif OS.has_feature("web"):
        _apply_web_settings()
    if OS.has_feature("demo"):           # a custom tag added in the preset's Features
        _limit_content()
```

Feature tags are case-sensitive. Custom tags apply only to exported builds, not to editor runs. `res://` is read-only in exports; write saves and settings to `user://`.

## Version notes

- 4.7: the runnable flag moved out of each preset into a top-level `[runnable_presets]` section of `export_presets.cfg` (old files still load; expect `runnable=` lines to vanish on save). Android drops built-in OBB expansion files (use AAB with Play Asset Delivery, or the separate OBB plugin). An APK or AAB can be a base pack for patch PCKs. Sparse (patch) PCKs can encrypt their index. `PCKPacker.add_file_from_buffer()` packs bytes without a temp file. Use Gradle Build is no longer experimental.
- 4.5: Shader Baker (below); native Windows exe metadata.
- 4.3: single-threaded Web export becomes the default.

## Shader Baker (4.5+)

Per-preset Shader Baker > Enabled pre-compiles shaders into the PCK for faster first launch, most on Direct3D 12 and Metal. Limits that bite in CI:

- It bakes only drivers the exporting OS supports: Windows exports Vulkan and D3D12, macOS Vulkan and Metal, Linux Vulkan only. A D3D12 preset needs a Windows exporter; Metal needs macOS.
- It doesn't run with `--headless`, because it needs the GPU. Baking in CI needs a runner with a GPU and a display server (for example a virtual display), exporting without `--headless`.
- No effect with the Compatibility renderer (so not on Web) and always off for dedicated-server exports.

## Gotchas

- **"No export template found" / version mismatch:** reinstall templates after every editor upgrade; a .NET editor needs the .NET templates.
- **Preset not found:** the CLI name must equal `name=` exactly; list names with `grep '^name=' export_presets.cfg`.
- **Missing files in the build:** non-resource files (`.json`, `.txt`, `.csv`) are excluded unless matched by the preset's "Filters to export non-resource files" (for example `*.json`). Files loaded only by path string may be excluded under "export selected scenes" mode.
- **Output directory missing:** exports fail rather than create it; `mkdir -p` first.
- **CI lacks passwords:** they live in `.godot/export_credentials.cfg`; set the `GODOT_*` environment variables instead (Android keystore, Windows codesign, `GODOT_SCRIPT_ENCRYPTION_KEY`).
- **PCK encryption** works only with export templates you compile yourself with the same key; with the official templates the encrypted build won't load. It deters casual extraction and nothing more.
- **Debug versus release:** `--export-debug` builds include the debugger and debug checks; ship `--export-release`.
- **Web blank page or SharedArrayBuffer error:** Thread Support is on without COOP/COEP; turn it off or fix the headers.

## References

- [references/presets-and-cli.md](references/presets-and-cli.md): read for the CLI flag table, `export_presets.cfg` layout, feature tags, PCK patches and DLC, encryption, desktop options and the dedicated-server preset.
- [references/mobile.md](references/mobile.md): read for Android (SDK, keystore, AAB, Gradle build, permissions, plugins, JavaClassWrapper) and iOS (Xcode, Team ID), app lifecycle and safe areas.
- [references/ci.md](references/ci.md): read when writing a CI export job: GitHub Actions matrix with setup-godot, templates, secrets, version injection, artifacts and Shader Baker runners.

Adapted from awesome-gamedev-agent-skills (Apache-2.0) and GodotPrompter (MIT); see NOTICE.
