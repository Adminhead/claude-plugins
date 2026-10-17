# Input and the InputMap

Godot input API: the callback order, events versus polling, actions and deadzones, gamepad, mouse and touch, runtime rebinding saved with `ConfigFile`, and input while paused. Feel techniques (input buffering, coyote time, rebinding UX) belong to the `game-feel` skill. Written for Godot 4.x, checked against 4.7.

Contents: Callback order; Actions, not keys; Events versus polling; Gamepad; Mouse; Touch; Rebinding; Pause; Pitfalls.

## Callback order

An event visits each stage until something marks it handled (`get_viewport().set_input_as_handled()`). Within a stage, nodes run in reverse tree order: deepest and last child first.

| Stage | Use for |
| --- | --- |
| `_input(event)` | Input that must arrive before the GUI: mouse look, debug keys |
| `_shortcut_input(event)` | Global shortcuts (pause, screenshot, quick save) |
| GUI (`Control._gui_input`, focus navigation) | Buttons, sliders, text fields consume events here |
| `_unhandled_key_input(event)` | Keys the GUI did not consume |
| `_unhandled_input(event)` | Gameplay actions: jump, attack, interact |

Use `_unhandled_input` for gameplay so an open menu eats the click or key first. Check each action in one callback only, or it fires twice.

## Actions, not keys

- Define actions in Project Settings > Input Map with game names (`move_left`, `jump`, `interact`, `pause`), never key names. Give each action a keyboard and a gamepad binding.
- Keep the built-in `ui_*` actions for UI navigation; add separate gameplay actions.
- Prefer `physical_keycode` for movement keys so WASD stays in place on AZERTY.
- Add actions in code only for mods or generated bindings: `if not InputMap.has_action(a): InputMap.add_action(a)` then `action_add_event()`. `add_action` defaults to a 0.2 deadzone.

## Events versus polling

```gdscript
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed(&"jump"):
        _jump_requested = true
        get_viewport().set_input_as_handled()

func _physics_process(delta: float) -> void:
    var dir := Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
    velocity = dir * speed
    move_and_slide()
```

| Call | Returns | For |
| --- | --- | --- |
| `Input.is_action_pressed(a)` | bool | Held: sprint, fire, crouch |
| `Input.is_action_just_pressed(a)` / `just_released(a)` | bool | Edges: jump, variable-jump cut |
| `Input.get_action_strength(a)` | float 0..1 | Analog triggers |
| `Input.get_axis(neg, pos)` | float -1..1 | One axis |
| `Input.get_vector(nl, pr, nu, pd, deadzone = -1.0)` | Vector2, length at most 1 | Movement; -1 uses the actions' own deadzones, applied radially |
| `event.is_action_pressed(a)` / `is_action_released(a)` | bool | Inside input callbacks |

- `is_action_just_pressed()` is safe in `_physics_process`: it is tick-aware and, with `input_devices/compatibility/legacy_just_pressed_behavior = false` (the default), does not drop presses between physics ticks. Buffering a press for a few frames is a feel choice (`game-feel`), not a bug fix.
- `event.is_action_pressed(a, true)` also accepts key echo (auto-repeat); the default ignores echoes.
- Polling with `Input` ignores GUI consumption. Gate gameplay polling yourself when a menu is open.

## Gamepad

- Deadzones are per action in the Input Map (0.2 is a good default; raise for worn sticks).
- Hot-plug: `Input.joy_connection_changed(device, connected)`; list pads with `Input.get_connected_joypads()`.
- Prompt icons: track the last device from the event type (`InputEventJoypadButton`/`JoypadMotion` versus `InputEventKey`/`InputEventMouse*`) and swap the prompt text or icons.
- Vibration: `Input.start_joy_vibration(device, weak, strong, duration)`, `stop_joy_vibration(device)`.
- 4.7+: `Input.has_joy_vibration(device)` and `get_joy_vibration_strength/duration/remaining_duration()`; motion sensors via `has_joy_motion_sensors()`, `set_joy_motion_sensors_enabled()`, `get_joy_accelerometer()`/`get_joy_gyroscope()` (Vector3); extra buttons `JOY_BUTTON_MISC2` to `MISC6`; setting `input_devices/joypads/ignore_joypad_on_unfocused_application` (default false).
- 4.7: keyboard and mouse events carry `device = InputEvent.DEVICE_ID_KEYBOARD` (16) and `DEVICE_ID_MOUSE` (32) instead of 0, because some pads use 0. Code testing `event.device == 0` for keyboard breaks; test the event type or the constants.

## Mouse

- Look: `InputEventMouseMotion.relative` (4.3+: `screen_relative`, unscaled by stretch) in `_input`, only while `Input.mouse_mode == Input.MOUSE_MODE_CAPTURED`, so menus do not rotate the camera.
- Modes: `MOUSE_MODE_VISIBLE`, `HIDDEN`, `CAPTURED`, `CONFINED`. Release capture on pause and on focus loss.
- Custom cursor: `Input.set_custom_mouse_cursor(texture, shape, hotspot)`.

## Touch

- `InputEventScreenTouch` (press, release, `index` per finger) and `InputEventScreenDrag`.
- Test on desktop with Input Devices > Pointing > Emulate Touch From Mouse.
- 4.7+: `VirtualJoystick` Control. Put it under a `CanvasLayer`, set `action_left/right/up/down` to the movement actions, and keep polling `Input.get_vector` as usual. Tune `joystick_mode` (fixed or dynamic), `visibility_mode`, `deadzone_ratio` (0 by default; action deadzones still apply), `clampzone_ratio`, and the `released`/`flicked` signals.

## Rebinding

Flow: the settings button enters listening mode; the next suitable event replaces the action's events; bindings are saved and reloaded at startup.

```gdscript
extends Button
@export var action: StringName = &"jump"
var _listening := false

func _pressed() -> void:
    _listening = true
    text = "Press a key..."

func _input(event: InputEvent) -> void:      # before the GUI, so the button does not eat it
    if not _listening or not event.is_pressed() or event.is_echo():
        return
    if event is InputEventKey and event.keycode in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META]:
        return
    if event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton:
        InputMap.action_erase_events(action)  # or erase only events of the same device kind
        InputMap.action_add_event(action, event)
        _listening = false
        text = event.as_text()
        get_viewport().set_input_as_handled()
```

Persist plain fields, not serialized objects, so a hand-edited file cannot inject anything:

```gdscript
const PATH := "user://input.cfg"

func save_bindings() -> void:
    var cfg := ConfigFile.new()
    for a in InputMap.get_actions():
        if String(a).begins_with("ui_"):
            continue
        var rows: Array = []
        for e in InputMap.action_get_events(a):
            if e is InputEventKey: rows.append({"k": e.physical_keycode})
            elif e is InputEventMouseButton: rows.append({"m": e.button_index})
            elif e is InputEventJoypadButton: rows.append({"j": e.button_index})
            elif e is InputEventJoypadMotion: rows.append({"axis": e.axis, "v": e.axis_value})
        cfg.set_value("input", a, rows)
    cfg.save(PATH)
```

Loading reverses it: for each saved action that `InputMap.has_action()`, `action_erase_events()`, then build `InputEventKey.new()` (set `physical_keycode`) and the others, and `action_add_event()`. Skip unknown rows. Offer "reset to defaults" with `InputMap.load_from_project_settings()`. File handling and save locations: `references/save-and-config.md`.

## Pause

- `get_tree().paused = true` stops processing and input for nodes with `process_mode` `PAUSABLE` (or `INHERIT` under a pausable parent).
- The pause menu and its input handler need `process_mode = PROCESS_MODE_ALWAYS`; `PROCESS_MODE_WHEN_PAUSED` runs only while paused.
- Handle `pause` in `_unhandled_input` or `_shortcut_input` on the always-processing node, and mark it handled.

## Pitfalls

- Action not found: a typo or the action is missing from the Input Map. Use `StringName` literals (`&"jump"`) and keep names in one place.
- Gameplay reacts through an open menu: the handler uses `_input` or polling instead of `_unhandled_input`.
- Stick drift: deadzone too low on the action.
- Rebinding captures a lone modifier, or the click that opened listening mode: filter both.
