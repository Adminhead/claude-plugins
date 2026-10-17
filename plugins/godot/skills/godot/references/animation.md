# Animation

AnimationPlayer clips, AnimationTree state machines and blend spaces, sprite-sheet animation, Tweens, and a pointer list for 3D bone tools. Written for Godot 4.x, checked against 4.7.

Contents: Pick the tool; AnimationPlayer; AnimationTree; Sprite frames; Tweens; 3D skeletons (pointer list); Pitfalls.

## Pick the tool

| Need | Use |
| --- | --- |
| Keyframed clip (properties, method calls, audio, hitbox toggles) | `AnimationPlayer` |
| Blending and transitions between clips (idle/walk/run, 8-way, layered) | `AnimationTree` fed by an `AnimationPlayer` |
| 2D frames only | `AnimatedSprite2D` + `SpriteFrames` |
| 2D frames plus hitboxes, sounds or other properties in sync | `Sprite2D` + `AnimationPlayer` keying `frame` |
| Short procedural motion in code (UI pop, fade, damage number) | `Tween` from `create_tween()` |

Start with AnimationPlayer; add an AnimationTree only when you need blending.

## AnimationPlayer

```gdscript
@onready var anim: AnimationPlayer = $AnimationPlayer

func attack() -> void:
    anim.play(&"attack")
    await anim.animation_finished
    anim.play(&"idle")
```

- `play()` with the clip that is already playing does not restart it, so calling it every frame is safe. Use `seek(0, true)` or `stop()` first to restart.
- Other controls: `play_backwards`, `queue`, `pause`, `stop`, `seek(t, true)`, `speed_scale`.
- Signals: `animation_finished(name)`, `animation_started(name)`, `current_animation_changed(name)`.
- Loop mode is per clip (None, Linear, Ping-Pong). Loop idle and walk; leave attack, jump and death at None, or `animation_finished` never fires.
- Call Method tracks call a function at an exact frame: spawn a projectile, enable a hitbox, play the impact sound. The method must exist on the keyed node, or the track does nothing.
- Track paths are relative to the player's `root_node`. Renaming or moving a node breaks them silently; recheck after restructuring a scene.
- 4.4+: animation markers name points or regions in a clip. `play_section_with_markers(&"attack", &"loop_start", &"loop_end")` plays a region without splitting the clip.

## AnimationTree

Setup: an `AnimationTree` beside the `AnimationPlayer`, `anim_player` pointed at it, `active = true`, and `tree_root` set to an `AnimationNodeStateMachine` or an `AnimationNodeBlendTree`.

```gdscript
@onready var tree: AnimationTree = $AnimationTree
@onready var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")

func _physics_process(_delta: float) -> void:
    playback.travel(&"run" if velocity.length() > 5.0 else &"idle")
    tree.set("parameters/Move/blend_position", input_dir)   # BlendSpace2D named "Move"
```

- `travel(state)` walks the transition graph with its fades; `start(state)` jumps immediately. `get_current_node()` reads the active state.
- Parameter paths are `parameters/<NodeName>/<property>` and must match node names exactly. A typo is a silent no-op. The root state machine's playback is always `parameters/playback`.
- Transitions switch Immediate, Sync or At End, gated by advance conditions (`tree.set("parameters/conditions/is_dead", true)`) or an advance expression. Use 0.1 to 0.2 s fades for responsive gameplay.
- `AnimationNodeOneShot` plays a hit reaction over the base: `tree.set("parameters/Shot/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)`.
- Set blend parameters every frame from gameplay code, not only on state changes.
- While the tree is active, it owns playback. Do not also call `AnimationPlayer.play()` for the same tracks.
- Root motion: set `root_motion_track`, then apply `get_root_motion_position()` (and rotation) to the body each physics frame.

Blend spaces:

- 1D for speed (`inverse_lerp(walk_speed, run_speed, speed)` into `blend_position`), 2D for direction (`input_dir`).
- 4.7+: the bool `sync` is deprecated and replaced by `sync_mode`: `SYNC_MODE_NONE` (default, inactive clips frozen), `SYNC_MODE_INDEPENDENT` (the old `sync = true`), `SYNC_MODE_CYCLIC_MUTABLE`, `SYNC_MODE_CYCLIC_CONSTANT` (uses `cyclic_length`, which must be above 0). A tree that blended correctly in 4.6 and transitions wrongly after upgrading needs `sync_mode` set on each blend space.
- 4.7+: `add_blend_point(node, pos, -1, &"run")` takes a name; look points up with `find_blend_point_by_name()`. Pass a name, since empty names are slated for deprecation.

## Sprite frames

```gdscript
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

func face(dir: float) -> void:
    sprite.flip_h = dir < 0.0
    sprite.play(&"walk")
```

- `SpriteFrames` holds named animations, each with frames, FPS and looping.
- 4.7+: per-animation `LoopMode` (`LOOP_NONE`, `LOOP_LINEAR`, `LOOP_PINGPONG`) through `set_animation_loop_mode()`. The bool `set_animation_loop()` is deprecated. Works for `AnimatedSprite2D` and `AnimatedSprite3D`.

## Tweens

```gdscript
var _move_tween: Tween

func move_to(target: Vector2) -> void:
    if _move_tween and _move_tween.is_valid():
        _move_tween.kill()                          # tweens on one property compete
    _move_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
    _move_tween.tween_property(self, "position", target, 0.4)
```

- 3.x's `Tween` node is gone. `create_tween()` returns a one-shot tween that starts on its own and frees itself. Make a new one for each animation.
- `create_tween()` binds to the node, so the tween dies when the node leaves the tree. `get_tree().create_tween()` outlives it.
- Steps run in sequence by default. `set_parallel(true)` runs all together; `parallel()` makes only the next tweener run with the previous one; `chain()` goes back to sequential (put a final callback after `chain()`).
- Tweeners: `tween_property`, `tween_interval`, `tween_callback`, `tween_method(setter, from, to, t)`. Sub-properties use a colon: `"modulate:a"`, `"position:x"`.
- `PropertyTweener` modifiers: `.from(v)`, `.from_current()`, `.as_relative()`, `.set_delay(s)`, and per-tweener `.set_trans()`/`.set_ease()`.
- `set_loops(0)` loops forever. `as_relative()` accumulates across loops, so use absolute values for looping tweens.
- Signals: `finished`, `step_finished(idx)`, `loop_finished(n)`. Use `await tw.finished` only while the node is sure to live; otherwise end with `tween_callback(queue_free)`.
- Pause and time: `set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)` for pause-menu motion, `set_speed_scale()`, `set_ignore_time_scale()` to ignore `Engine.time_scale` during slow motion.
- Hit-stop: drop `Engine.time_scale` (to 0.05, say), then restore it from a timer that ignores time scale: `await get_tree().create_timer(0.08, true, false, true).timeout` (`process_always`, `process_in_physics`, `ignore_time_scale`), then `Engine.time_scale = 1.0`. A plain timer would itself be slowed. Timing and feel (how long, what else to layer) are in `game-feel`.
- 4.7+: `has_tweeners()` tells you whether a dynamically built tween got any tweeners. Kill an empty tween before it runs to avoid errors.
- `TRANS_CUBIC` + `EASE_OUT` reads as natural; `TRANS_BACK` + `EASE_OUT` overshoots for playful pops.

Recipes: hit flash (`modulate` to white and back), damage number (rise plus fade in parallel, then `tween_callback(queue_free)`), panel slide (tween `position:x` from off-screen with `from()`). For UI motion that must not fight container layout, tween the 4.7 `offset_transform_*` properties (see `references/ui-control.md`).

## 3D skeletons (pointer list)

Niche; check the class reference before writing code.

- Retargeting through `SkeletonProfileHumanoid` in the scene import dock (since 4.0).
- 4.4+: `LookAtModifier3D` for head and eye tracking; `SpringBoneSimulator3D` for hair, capes and tails.
- 4.5+: `BoneConstraint3D` family (`AimModifier3D`, `CopyTransformModifier3D`, `ConvertTransformModifier3D`) for bone-relative constraints.
- 4.6+: `IKModifier3D` solvers: `TwoBoneIK3D` (two-bone limbs, with a pole), `FABRIK3D` (chains without limits), `CCDIK3D` (joint limits), `SplineIK3D` (follow a `Path3D`), `JacobianIK3D` (smooth, slower).
- 4.7: `LookAtModifier3D.relative` defaults to `false` (rotation relative to the rest pose). Only 4.6.0 had `true`; set it back if a 4.6.0 rig looks wrong.

## Pitfalls

- `active` left false or `anim_player` unset: nothing animates and `travel()` seems dead.
- `yield` is gone; use `await anim.animation_finished`.
- Animation snaps instead of blending: the transition has no fade time, or code calls `start()` where it meant `travel()`.
- The state machine that decides what to play lives in gameplay code (`references/patterns.md`); movement code belongs to `godot-physics`; shader effects to `godot-shaders`.
