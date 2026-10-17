# Hands and passthrough

Checked against the Godot 4.7 docs (OpenXR hand tracking, AR/passthrough) and class reference, 2026-10-17.

## Contents

- Hand tracking setup
- Reading hand data
- Gestures through interaction profiles
- Passthrough and blend modes

## Hand tracking setup

1. Enable `xr/openxr/extensions/hand_tracking` (off by default). On Quest, also enable Hand Tracking under the export preset's Meta XR Features (OpenXR Vendors plugin) as Optional or Required.
2. Hand data comes from `XRHandTracker` resources registered as `/user/hand_tracker/left` and `/user/hand_tracker/right`. These are separate from the `left_hand`/`right_hand` controller trackers.
3. To show hands: add an `XRNode3D` under `XROrigin3D` with `tracker = /user/hand_tracker/left` (and one for the right), leave its `pose` on `default` (no other pose works here) and tick Show When Tracked, put a rigged hand mesh (Godot Humanoid hand bones) under it (the Godot demo project's hand models work), and add an `XRHandModifier3D` as a child of its `Skeleton3D` with `hand_tracker` set to the same path. The modifier poses the bones every frame.
4. Keep controller nodes too. Players switch between hands and controllers at any time; show whichever source has tracking data.

## Reading hand data

```gdscript
func _physics_process(_delta: float) -> void:
	var hand := XRServer.get_tracker("/user/hand_tracker/left") as XRHandTracker
	if hand == null or not hand.has_tracking_data:
		return  # no tracker registered, or the hand isn't visible right now
	if hand.hand_tracking_source == XRHandTracker.HAND_TRACKING_SOURCE_CONTROLLER:
		return  # inferred from a held controller, not optical tracking
	var thumb := hand.get_hand_joint_transform(XRHandTracker.HAND_JOINT_THUMB_TIP).origin
	var index := hand.get_hand_joint_transform(XRHandTracker.HAND_JOINT_INDEX_FINGER_TIP).origin
	var flags := hand.get_hand_joint_flags(XRHandTracker.HAND_JOINT_INDEX_FINGER_TIP)
	if flags & XRHandTracker.HAND_JOINT_FLAG_POSITION_TRACKED and thumb.distance_to(index) < 0.02:
		_on_pinch()
```

Joint data is noisy. Smooth positions over a few frames and use hysteresis (start a pinch under 2 cm, end it over 3 cm) rather than one threshold.

## Gestures through interaction profiles

Prefer runtime-recognized gestures to hand-rolled joint math where available:

- **Hand interaction profile** (`XR_EXT_hand_interaction`): enable `xr/openxr/extensions/hand_interaction_profile` and add the profile to the action map. It exposes pinch, grasp and poke, with a `pinch` float, a "pinch ready" bool and a pinch pose, on the normal `left_hand`/`right_hand` trackers, so existing controller code keeps working.
- **Microsoft hand interaction** exposes pinch as the `select` input; Quest supports it. If both it and the core profile are bound, the Microsoft one takes precedence on Quest.
- **HTC hand interaction** adds separate `/user/hand_htc/left|right` trackers; switch trackers when the player puts the controllers down.

## Passthrough and blend modes

Passthrough is set through the interface's environment blend mode (the unified API since Godot 4.3; the older `start_passthrough` style is legacy). Quest and similar video-passthrough headsets need the OpenXR Vendors plugin, with Passthrough set to Optional or Required in the export preset's vendor XR features.

| Blend mode | Meaning |
|---|---|
| `XR_ENV_BLEND_MODE_OPAQUE` | VR; passthrough off |
| `XR_ENV_BLEND_MODE_ADDITIVE` | Rendered image added to the world (see-through optics); use a black background |
| `XR_ENV_BLEND_MODE_ALPHA_BLEND` | Alpha-blended with the camera feed; needs `Viewport.transparent_bg = true` |

```gdscript
@onready var environment: Environment = $WorldEnvironment.environment

func switch_to_ar() -> bool:
	var xr := XRServer.primary_interface
	if xr == null:
		return false
	var modes := xr.get_supported_environment_blend_modes()
	if XRInterface.XR_ENV_BLEND_MODE_ALPHA_BLEND in modes:
		xr.environment_blend_mode = XRInterface.XR_ENV_BLEND_MODE_ALPHA_BLEND
		get_viewport().transparent_bg = true
	elif XRInterface.XR_ENV_BLEND_MODE_ADDITIVE in modes:
		xr.environment_blend_mode = XRInterface.XR_ENV_BLEND_MODE_ADDITIVE
		get_viewport().transparent_bg = false
	else:
		return false
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0, 0, 0, 0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR  # the background no longer lights the scene
	return true
```

Switching back to VR sets `XR_ENV_BLEND_MODE_OPAQUE`, `transparent_bg = false`, and restores the sky background and ambient source. `xr/openxr/environment_blend_mode` in Project Settings picks the startup mode.

To let real objects occlude virtual ones (a desk, the player's tracked hands), render proxy meshes with a spatial shader using `render_mode shadow_to_opacity` and black albedo: lit areas show the camera feed and shadowed areas darken it, so virtual objects can cast shadows onto real surfaces.

Passthrough-capable hardware includes Quest 3, Quest 3S and Quest Pro (Quest 2 in greyscale), Pico 4 and Varjo XR headsets. Apple Vision Pro is not an OpenXR target in Godot.
