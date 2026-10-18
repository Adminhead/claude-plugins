---
name: godot-xr
description: Godot 4 XR with OpenXR for VR, AR and passthrough on Meta Quest, Pico and PC VR. Use for XROrigin3D and XRController3D setup, the action map, locomotion, grabbing, in-world UI, hand tracking, passthrough, spatial anchors, or a Quest export, and when project.godot has xr/openxr/enabled=true.
---

# Godot XR (OpenXR)

Build VR and mixed-reality games in Godot 4 with the core OpenXR interface. Examples are GDScript; C# idioms belong to `godot-csharp`. Godot version notes and the facts that change between releases are in [references/platform-features.md](references/platform-features.md).

Start by reading the project's Godot version from `config/features` in `project.godot` and follow that version, not the newest; per-version changes are in the `godot` plugin's `references/version-notes.md`, if installed.

## Setup checklist

1. **Enable OpenXR in Project Settings, not Plugins.** OpenXR is built into the engine. Turn on **XR → OpenXR → Enabled** and **XR → Shaders → Enabled**, then Save & Restart. OpenXR must be on at startup; it cannot be switched on at runtime.
2. **Renderer.** The Godot XR setup guide recommends Mobile for PC VR and standalone headsets; Forward+ works but is less optimized for XR. The Android deploy page still advises Compatibility for Android headsets. Pick Mobile by default and profile on device; fall back to Compatibility if Mobile misbehaves on the target headset.
3. **Scene.** `XROrigin3D` is the play-space centre, with `XRCamera3D` and two `XRController3D` children (`tracker` = `left_hand` / `right_hand`, `pose` = `aim` or `grip`). Build at 1 unit = 1 metre.
4. **Start XR.** OpenXR initializes before the scene loads, so check it rather than calling `initialize()`:

```gdscript
extends Node3D

var xr_interface: OpenXRInterface

func _ready() -> void:
	xr_interface = XRServer.find_interface("OpenXR")
	if xr_interface and xr_interface.is_initialized():
		get_viewport().use_xr = true
		xr_interface.session_begun.connect(_on_session_begun)
	else:
		push_error("OpenXR not initialized; is the headset connected and the runtime running?")

func _on_session_begun() -> void:
	# Run physics at the headset's refresh rate to avoid judder.
	var rate := xr_interface.display_refresh_rate
	if rate > 0:
		Engine.physics_ticks_per_second = roundi(rate)
```

V-Sync settings are ignored while OpenXR renders; the runtime paces frames. Don't tell users to change V-Sync for XR. The physics tick rate (60 by default) is what needs raising.

5. **Session events.** Connect `session_visible`, `session_focussed` (input is live), `session_stopping` and `pose_recentered`. Pause or dim the game when focus is lost (system menu open, headset off). On Godot 4.7, `user_presence_changed` reports the headset being taken off; see the platform reference.

## What to read next

| Task | Read |
|---|---|
| Buttons, triggers, thumbsticks, the action map, locomotion, snap turn, grabbing, pointer UI on a quad | [references/input-and-interaction.md](references/input-and-interaction.md) |
| Hand tracking, pinch and hand meshes; passthrough and blend modes | [references/hands-and-passthrough.md](references/hands-and-passthrough.md) |
| Quest/Android export, the OpenXR Vendors plugin, refresh rate, foveation, SpaceWarp, render models, spatial anchors, 4.5 to 4.7 changes | [references/platform-features.md](references/platform-features.md) |

For production locomotion, grabbing and UI, suggest Godot XR Tools (GodotVR/godot-xr-tools) before hand-writing large systems; the references show the minimal versions.

## Comfort and performance rules

- Hold the headset's frame rate (72, 90 or 120 Hz). A missed frame is felt as judder and causes nausea. Profile on the device, not in the editor.
- Offer snap turning (about 30 to 45 degrees) and a comfort vignette for smooth locomotion; never move or rotate the camera without player input.
- Move the `XROrigin3D` (or a body that carries it), never the `XRCamera3D`; the tracking system owns the camera transform.
- Many screen-space post effects don't support stereo rendering yet. Test glow, SSR, SSAO and FXAA in the headset before keeping them.
- Put world-space UI 1 to 3 metres away, and render it at a resolution high enough to read (a 1024-pixel-wide viewport for a 1-metre panel is a reasonable start).

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Headset shows nothing or the desktop view | `use_xr` not set, or OpenXR not enabled at startup | Set `get_viewport().use_xr = true` after the `is_initialized()` check; enable OpenXR in Project Settings and restart |
| No controller input | Action names don't match the action map | Open the OpenXR Action Map editor (bottom panel) and use its action names; see the input reference |
| Choppy physics or hands | Physics at 60 Hz on a 90 Hz headset | Set `Engine.physics_ticks_per_second` from `display_refresh_rate` |
| Trigger fires at odd pressure | Runtime thresholds on bool trigger actions vary | Bind triggers and grips as Float and apply your own threshold |
| Hand tracking returns nothing | Extension off, or the wrong tracker name | Enable `xr/openxr/extensions/hand_tracking`; trackers are `/user/hand_tracker/left` and `/right` |
| Quest export fails or runs flat | Missing gradle build or XR Mode | Install the Android build template, enable Use Gradle Build, set XR Mode to OpenXR, arm64 only |

Adapted from GodotPrompter (MIT, jame581/GodotPrompter), skill `xr-development`; see `NOTICE`.
