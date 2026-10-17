# Phantom Camera

Addon v0.11.0.3 (ramokz/phantom-camera, MIT) checked against Godot 4.7, 2026-10-17. GDScript nodes plus an official C# wrapper shipped as source (`namespace PhantomCamera`). Pre-1.0: a minor version can break the API, so pin it.

## Contents

- Model: one host, many shots
- Priority switching
- Follow modes
- Look-at (3D)
- Tweens and noise
- C# wrapper
- Checklist

## Model: one host, many shots

- **`PhantomCameraHost`** goes **under** the real `Camera2D`/`Camera3D` (keep one real camera per viewport). Each frame it moves that camera to match the highest-priority eligible PCam.
- **`PhantomCamera2D` / `PhantomCamera3D`** nodes go anywhere: under the player, inside trigger areas, in cutscene rigs. Each describes a shot (`priority`, follow mode, 3D look-at). They render nothing.
- Enabling the plugin registers the `PhantomCameraManager` autoload and restarts the editor each time the plugin is enabled; that is expected. New node types: `PhantomCamera2D`, `PhantomCamera3D`, `PhantomCameraHost`, `PhantomCameraNoiseEmitter2D`/`3D`, `PhantomCameraTweenDirector`.

```
Camera2D
  PhantomCameraHost
Player (CharacterBody2D)
  PhantomCamera2D      # priority 0, follow_mode SIMPLE, follow_target = Player
BossArena
  PhantomCamera2D      # priority 10, follow_mode GROUP, follow_targets = [Player, Boss]
```

Host members: `interpolation_mode` (`AUTO` default, `IDLE`, `PHYSICS`, `MANUAL`; in manual mode call `host.process(delta)`), `host_layers`, `get_active_pcam()`, signals `pcam_became_active(pcam)` and `pcam_became_inactive(pcam)`.

`host_layers` is a bitmask on both the host and each PCam. A PCam is eligible for a host only if the masks overlap; use this for split screen or picture-in-picture.

## Priority switching

`priority: int` (clamped to 0 or more). The host follows the highest eligible priority. Setting `priority` or calling `set_priority()` both go through the setter that notifies the host.

```gdscript
extends Area2D

@export var area_pcam: PhantomCamera2D

func _ready() -> void:
	body_entered.connect(func(body: Node2D) -> void:
		if body.is_in_group("player"):
			area_pcam.priority = 20)
	body_exited.connect(func(body: Node2D) -> void:
		if body.is_in_group("player"):
			area_pcam.priority = 0)
```

PCam signals: `became_active`, `became_inactive`, `tween_started`, `is_tweening` (every frame of a transition), `tween_interrupted(pcam)`, `tween_completed`, `follow_target_changed`, `dead_zone_reached(side)` (2D framed mode).

`priority_override` is an editor preview toggle and is ignored in exports; never drive gameplay with it. `inactive_update_mode` (`ALWAYS` or `NEVER`) saves work on idle PCams.

## Follow modes

`follow_mode`: `NONE`, `GLUED`, `SIMPLE`, `GROUP`, `PATH`, `FRAMED`, plus `THIRD_PERSON` on `PhantomCamera3D` only.

| Mode | Behaviour | Key properties |
|---|---|---|
| `GLUED` | Sits exactly on `follow_target` | `follow_target` |
| `SIMPLE` | Follows with an offset and optional damping | `follow_offset`, `follow_damping`, `follow_damping_value` (lower is snappier) |
| `GROUP` | Follows the centre of several targets | `follow_targets`; 2D `auto_zoom`, `auto_zoom_min/max/margin`; 3D `auto_follow_distance`, `..._min/max` |
| `PATH` | Follows the target, confined to the nearest point on a path | `follow_path` (`Path2D`/`Path3D`) |
| `FRAMED` | Dead zone; moves only when the target nears the frame edge | `dead_zone_width`, `dead_zone_height` |
| `THIRD_PERSON` (3D) | Drives a `SpringArm3D` around the target for orbiting | `follow_distance`, `spring_length`, `collision_mask`, `shape`, `set_third_person_rotation(_degrees)` |

Shared options: `follow_axis_lock` (2D `NONE/X/Y/XY`; 3D adds `Z/XZ/YZ/XYZ`), `lookahead` with `lookahead_time`, `lookahead_acceleration`, `lookahead_deceleration` (2D also has `lookahead_max`/`lookahead_max_value`), and 2D `rotate_with_target`, which needs `Camera2D.ignore_rotation = false`. `teleport_position()` snaps past damping, for example after a respawn. `is_following()` reports whether a target is set and followed.

The third-person rotation setters print an error and do nothing unless `follow_mode == THIRD_PERSON`; `set_follow_distance`, `set_spring_length`, `set_collision_mask` and `set_shape` have no such guard.

## Look-at (3D)

`look_at_mode`: `NONE`, `MIMIC` (copy the target's rotation), `SIMPLE` (`look_at_target`), `GROUP` (centre of `look_at_targets`). Damping is `look_at_damping` plus a single scalar `look_at_damping_value`. `up_target` overrides the up vector continuously. `PhantomCamera2D` has no look-at.

Using a follow mode and a look-at mode together on one `PhantomCamera3D` prints "has not been fully tested yet". Test that combination on device before shipping.

## Tweens and noise

Each PCam has a `tween_resource: PhantomCameraTween` (`duration`, `transition`, `ease`), used when that PCam becomes active. Share one `.tres` across shots that should blend alike. Passthrough properties on the PCam (`tween_duration`, `tween_transition`, `tween_ease`) write into the resource; the enums are `PhantomCameraTween.TransitionType` and `PhantomCameraTween.EaseType`, which mirror Godot's `Tween` curves. `tween_on_load = false` cuts instead of tweening when the PCam is already top priority at load. A `null` resource means an instant cut.

`PhantomCameraTweenDirector` overrides the tween for specific from/to PCam pairs without touching each PCam.

Shake: assign a `PhantomCameraNoise2D`/`3D` resource to a PCam's `noise` for continuous noise, or use a `PhantomCameraNoiseEmitter2D`/`3D` node and call `emit()` for one-off shakes (impacts, explosions). An emitter only shakes PCams that share a `noise_emitter_layer` bit with it; set `continuous` for an earthquake-style loop. Shake technique and tuning are in `game-feel`.

## C# wrapper

- Get wrappers with `node.AsPhantomCamera2D()`, `AsPhantomCamera3D()`, `AsPhantomCameraHost()`, `AsPhantomCameraTween()`. They wrap the node; they are not `Node` subclasses, so never write `class MyCam : PhantomCamera2D`.
- `FollowMode` and `LookAtMode` are getter-only on the wrapper. Set them on the node: `pcamNode.Set("follow_mode", (int)FollowMode2D.Simple)`.
- Only `FollowMode` and `FollowLockAxis` are dimension-suffixed (`FollowMode2D`, `FollowLockAxis3D`); `LookAtMode`, `TransitionType`, `EaseType`, `InterpolationMode` are not.
- Signals are C# events with PascalCase names (`BecameActive`, `TweenCompleted`).

## Checklist

- [ ] Exactly one `PhantomCameraHost`, as a child of each real camera
- [ ] Each PCam shares a `host_layers` bit with its intended host
- [ ] `GROUP` uses `follow_targets` (array), not `follow_target`
- [ ] Priorities changed through `priority`/`set_priority()`, never `priority_override`
- [ ] Follow plus look-at on one `PhantomCamera3D` tested by hand
- [ ] Addon version pinned in version control
