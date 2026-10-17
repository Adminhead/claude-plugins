# Platform features and version notes

Checked against Godot 4.7.2 (class reference, ProjectSettings, XR docs on the 4.7 branch) and the OpenXR Vendors plugin 5.1.0, 2026-10-17. Recheck this file when the engine or the vendors plugin changes major or minor version.

## Contents

- Quest and Android export
- Refresh rate and performance settings
- Foveated rendering
- Frame synthesis and Application SpaceWarp
- Render models
- Spatial anchors (experimental)
- Godot 4.7 additions
- Other platforms
- Version notes

## Quest and Android export

1. Set up Android export in general first (OpenJDK 17, Android SDK path in Editor Settings); see `godot-export`.
2. **Project → Install Android Build Template**.
3. **OpenXR Vendors plugin** (GodotVR/godot_openxr_vendors; 5.x is for Godot 4.6 and later): from the Asset Library, or copy `assets/addons/godotopenxrvendors` from a release into `addons/`. Since Godot 4.6 it is optional (stock Godot can export to most OpenXR Android devices), but it is needed for vendor features (Meta passthrough settings, hand tracking flags, SpaceWarp, scene and anchor APIs) and may be required by app stores. Recommend it for any Quest release.
4. Export preset per device: Android, **Use Gradle Build** on, **XR Mode = OpenXR**, architecture **arm64** only, then pick the headset under XR Features (or the Khronos loader if no vendor entry fits). Enable Runnable for one-click deploy.
5. Vendor sections (Meta, Pico, Magic Leap, Khronos/HTC) hold Hand Tracking, Passthrough and Boundary Mode. Disabling the boundary entirely requires passthrough to be on all the time.
6. Leave the preset's minimum SDK at the template default unless a store says otherwise; the vendors plugin's own samples leave `gradle_build/min_sdk` empty.
7. Enable `rendering/textures/vram_compression/import_etc2_astc` so textures import in a format the headset can use.
8. Deploy: developer mode on the headset (Meta's docs), USB debugging accepted, then one-click deploy. On Windows, Quest needs Meta's ADB driver.

## Refresh rate and performance settings

- After `session_begun`, read `xr_interface.get_available_display_refresh_rates()`, set `display_refresh_rate` to the highest rate the game can hold (72, 90, 120 on Quest 3), and set `Engine.physics_ticks_per_second` to match.
- `xr/openxr/submit_depth_buffer` lets the runtime use depth for better reprojection; some rendering features are incompatible with it.
- Keep draw calls and transparent overdraw low; mobile GPUs are tile-based. MSAA 2x or 4x is cheaper there than screen-space AA. Test any post effect in the headset.
- Measure on device with Meta's OVR Metrics Tool (or Pico's equivalent) and Godot's remote profiler.

## Foveated rendering

- `xr/openxr/foveation_level` (0 off, 1 low, 2 medium, 3 high) and `xr/openxr/foveation_dynamic` (vary with GPU load, up to the set level). High plus dynamic is the usual standalone choice.
- Godot 4.5 added foveation on Vulkan through the fragment density map extension, so it works on the Mobile renderer on Quest, not only Compatibility. Older pages of the OpenXR settings doc still say "Compatibility only" and point Vulkan users to `Viewport.vrs_mode = VRS_XR`; if foveation has no visible effect on a Vulkan renderer, set that too and measure.
- On non-Android platforms, enabling 3D MSAA disables foveation.
- Godot 4.7: `xr/openxr/foveation_eye_tracked` and `xr/openxr/foveation_with_subsampled_images` both default to `true`. Eye-tracked foveation is used where the headset supports it; subsampled images give a bigger gain on Vulkan but are switched off automatically (with a log warning) when FXAA, glow or similar screen-space effects are on. Set either to `false` to opt out.

## Frame synthesis and Application SpaceWarp

- **Application SpaceWarp** (Meta and Pico, vendors plugin): the app renders at half rate and the runtime synthesizes the in-between frames from motion vectors. Enable it under Project Settings → OpenXR → Extensions (Advanced Settings on); see the vendors plugin's `meta-space-warp-sample`. Expect artefacts on fast-moving objects and test on device.
- **Frame synthesis** (`xr/openxr/extensions/frame_synthesis`, core, Godot 4.6+): the cross-vendor replacement. Never enable it together with ASW; where frame synthesis is supported it replaces ASW.

## Render models

Enable `xr/openxr/extensions/render_model` (off by default) and add an `OpenXRRenderModelManager` under `XROrigin3D`. It creates and removes `OpenXRRenderModel` children as the runtime reports devices, so the player sees their own controllers without bundled meshes. Set its `tracker` to Any, Left Hand or Right Hand. Check `OpenXRRenderModelExtension.is_active()` and fall back to bundled meshes when the runtime lacks `XR_EXT_render_model`.

## Spatial anchors (experimental)

Godot 4.6 added the OpenXR spatial entities extensions: anchors, plane tracking and marker tracking. `OpenXRSpatialAnchorCapability` is marked experimental, so expect API changes.

1. Under XR → OpenXR → Extensions → Spatial Entity, enable the extension, Spatial Anchors, and Builtin Anchor Detection (all off by default). Add Persistent Anchors to keep anchors across sessions.
2. Create and display an anchor:

```gdscript
extends XROrigin3D

func place_anchor(local_transform: Transform3D) -> XRAnchor3D:
	if not OpenXRSpatialAnchorCapability.is_spatial_anchor_supported():
		return null
	var tracker: OpenXRAnchorTracker = OpenXRSpatialAnchorCapability.create_new_anchor(local_transform)
	if tracker == null:
		return null
	var anchor := XRAnchor3D.new()
	anchor.tracker = tracker.name
	add_child(anchor)
	return anchor
```

The capability singleton only exists while OpenXR is enabled; a script that names it will not parse in a project with OpenXR off. Persist with `persist_anchor(tracker, RID(), callback)` after checking `is_spatial_persistence_supported()`, store `tracker.uuid` with your data, and expect persisted anchors back as `XRServer.TRACKER_ANCHOR` trackers next launch. There is no `XRSpatialAnchor` class; the node is `XRAnchor3D`. Godot 4.7 adds an optional third `next` argument to `create_new_anchor` for vendor structs.

The OpenXR Vendors plugin also exposes vendor scene and anchor APIs (Meta scene, Android XR trackables) when the core extension isn't available on a device.

## Godot 4.7 additions

- **User presence:** `OpenXRInterface.user_presence_changed(is_user_present)`, `is_user_presence_supported()`, `is_user_present()`. Valid only after OpenXR initializes; not emitted at startup or shutdown, so assume present at start. Pause and mute when it goes false.
- **Composition layer eye visibility:** `OpenXRCompositionLayer.eye_visibility` = `EYE_VISIBILITY_BOTH` (default), `EYE_VISIBILITY_LEFT` or `EYE_VISIBILITY_RIGHT`, for per-eye content. Not every runtime or layer type honours it.
- Foveation defaults changed (above).

## Other platforms

- **PC VR on Windows:** SteamVR, Meta Link and other runtimes work through OpenXR. Godot 4.5 added a Direct3D 12 OpenXR path; if Vulkan drivers misbehave on a Windows target, try `rendering/rendering_device/driver.windows = d3d12`.
- **Linux:** Monado or SteamVR as the OpenXR runtime.
- **visionOS:** Godot 4.5 added a visionOS export preset for windowed (Shared Space) apps; immersive apps are not supported through 4.7, and OpenXR isn't available there.
- **WebXR** is a separate interface (`WebXRInterface`) with its own session flow; it is outside this skill.

## Version notes

| Version | Change |
|---|---|
| 4.3 | Unified passthrough through environment blend modes |
| 4.5 | D3D12 OpenXR on Windows; Vulkan foveation (fragment density map); render models; visionOS windowed export; ASW via the vendors plugin |
| 4.6 | Requests OpenXR 1.1 and falls back to 1.0 (`xr/openxr/target_api_version` forces one); spatial entities (experimental); core frame synthesis; vendors plugin optional |
| 4.7 | User presence; composition layer eye visibility; eye-tracked and subsampled foveation on by default; `create_new_anchor(..., next)` |
