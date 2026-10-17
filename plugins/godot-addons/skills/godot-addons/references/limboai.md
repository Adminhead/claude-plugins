# LimboAI

Addon v1.8.1 (limbonaut/limboai, MIT) checked against Godot 4.7, 2026-10-17. C++, shipped two ways: a GDExtension (AssetLib, Godot 4.6 or later for 1.8.x) and an engine module (prebuilt editor and templates on Godot 4.7). Projects can switch between the two.

## Contents

- Build choice
- Behavior trees and BTPlayer
- Custom tasks
- Blackboard and BlackboardPlan
- State machines (LimboHSM)
- BTState: a tree inside a state
- Checklist

## Build choice

| Need | Build |
|---|---|
| GDScript only, stock Godot | GDExtension: AssetLib or the release's `addons/limboai/`, then enable the plugin |
| C# tasks or states | Module build. The upstream docs only confirm C# with the module; its NuGet packages ship under `GodotSharp/Tools/nupkgs/` and are added with `dotnet nuget add source <dir> --name LimboNugetSource` |
| In-editor class docs and the `BBParam` property editor | Module build (the GDExtension lacks both) |

The module build means the project runs on LimboAI's custom editor and exports with its custom templates. Say so before recommending it.

## Behavior trees and BTPlayer

A `BehaviorTree` is a resource edited in the LimboAI main-screen editor. A `BTPlayer` node, placed under the agent, runs it.

| BTPlayer member | Notes |
|---|---|
| `behavior_tree` | The `.tres` resource |
| `agent_node` | Defaults to the parent |
| `update_mode` | `IDLE`, `PHYSICS` (default) or `MANUAL` (call `update(delta)` yourself) |
| `active` | Pauses ticking when false |
| `blackboard_plan` | Variable schema; edit in the Inspector |
| `monitor_performance` | Adds a Performance monitor for this player |

Signal `updated(status)` fires after each update; `behavior_tree_finished` is deprecated. `restart()` resets the tree.

```gdscript
extends CharacterBody2D

@onready var bt_player: BTPlayer = $BTPlayer

func _ready() -> void:
	bt_player.updated.connect(func(status: int) -> void:
		if status == BT.SUCCESS:
			bt_player.restart())
```

## Custom tasks

Extend `BTAction` (work over several ticks) or `BTCondition` (an immediate check). Put scripts under `res://ai/tasks/` (configurable in Project Settings → Limbo AI, Advanced Settings on); each subfolder becomes a category in the task palette. Mark them `@tool` so `_generate_name()` and `_get_configuration_warnings()` run in the editor.

Lifecycle: `_setup()` once when the tree instance is created (`agent`, `blackboard` and `scene_root` are available), `_enter()` when the status goes from not-RUNNING to RUNNING, `_tick(delta) -> Status` each execution, `_exit()` after SUCCESS or FAILURE.

```gdscript
@tool
extends BTAction
## Moves the agent toward a blackboard position.

@export var target_pos_var: StringName = &"target_pos"
@export var speed := 200.0
@export var arrive_distance := 5.0

func _generate_name() -> String:
	return "MoveToward %s" % LimboUtility.decorate_var(target_pos_var)

func _tick(_delta: float) -> Status:
	var target: Vector2 = blackboard.get_var(target_pos_var, Vector2.ZERO)
	if agent.global_position.distance_to(target) < arrive_distance:
		return SUCCESS
	agent.velocity = agent.global_position.direction_to(target) * speed
	agent.move_and_slide()
	return RUNNING
```

```gdscript
@tool
extends BTCondition

@export var target_var: StringName = &"target"
@export var distance_max := 150.0

func _tick(_delta: float) -> Status:
	var target = blackboard.get_var(target_var, null, false)  # untyped: the instance may be freed
	if not is_instance_valid(target):
		return FAILURE
	return SUCCESS if agent.global_position.distance_to(target.global_position) <= distance_max else FAILURE
```

Name blackboard-key exports with a `_var` suffix and type them `StringName`; the Inspector then shows a variable picker.

## Blackboard and BlackboardPlan

`Blackboard` is a `RefCounted` store shared by the tasks of one tree instance. Methods: `get_var(name, default := null, complain := true)` (it prints an error for a missing variable even when a default is given, so pass `complain = false` where absence is normal, or declare the variable in the plan), `set_var`, `has_var`, `erase_var`, `list_vars`, `get_vars_as_dict`, `bind_var_to_property(name, object, property)`, `link_var(name, target_blackboard, target_var)`, `set_parent` (scopes), `print_state()`.

A `BlackboardPlan` (on `BTPlayer`, `BTState` or `LimboHSM`) declares the variables, their types, defaults and hints, so designers can override values per instance in the Inspector. `plan.create_blackboard(prefetch_root)` builds a blackboard from a plan at runtime.

In C# (module build), `Blackboard.GetVar` returns a `Variant`; cast it (`(float)bb.GetVar(name, 0f)`) or use `.As<T>()`.

## State machines (LimboHSM)

`LimboHSM` is itself a `LimboState` and manages child `LimboState` nodes. Wire transitions, then initialize, then activate, in that order:

```gdscript
extends CharacterBody2D

@onready var hsm: LimboHSM = $LimboHSM
@onready var idle: LimboState = $LimboHSM/Idle
@onready var move: LimboState = $LimboHSM/Move

func _ready() -> void:
	hsm.add_transition(idle, move, idle.EVENT_FINISHED)
	hsm.add_transition(move, idle, move.EVENT_FINISHED)
	hsm.add_transition(hsm.ANYSTATE, $LimboHSM/Stunned, &"stunned", func() -> bool: return health > 0)
	hsm.initial_state = idle  # otherwise the first child
	hsm.initialize(self)
	hsm.set_active(true)
```

A state script overrides `_setup()`, `_enter()`, `_exit()` and `_update(delta)`, and calls `dispatch(event, cargo := null)` to request a transition; `dispatch` returns true when a transition consumed the event. Events bubble from the leaf state up through nested machines. `add_transition` takes an optional guard `Callable` returning bool; `set_guard()` sets a state-wide guard. From 1.8.1 a state can also hold a nested state machine as a child.

States can be built without scene nodes: `LimboState.new().named("Idle").call_on_enter(f).call_on_update(g)`, then `add_child` them to the HSM before `initialize`.

HSM `update_mode` mirrors BTPlayer's (`IDLE`, `PHYSICS`, `MANUAL` with `update(delta)`). Signal `active_state_changed(current, previous)`.

## BTState: a tree inside a state

`BTState` is a `LimboState` that runs a `BehaviorTree`. On SUCCESS it dispatches `success_event` (default `&"success"`), on FAILURE `failure_event` (default `&"failure"`). Wire those events as transitions on the parent HSM. When creating a `BTState` in code, call `set_scene_root_hint(owner_node)` before `initialize()` so node paths in the tree resolve.

## Checklist

- [ ] Build choice stated: GDExtension for GDScript, module only if C# or BBParam editing is needed
- [ ] `BTPlayer` under the agent with `behavior_tree` assigned; `update_mode` matches the agent's loop
- [ ] Custom tasks are `@tool`, live under the user task directory, and return SUCCESS, FAILURE or RUNNING
- [ ] Object-valued blackboard reads are untyped and checked with `is_instance_valid`
- [ ] `updated` used, not the deprecated `behavior_tree_finished`
- [ ] HSM: all `add_transition` calls happen before `initialize()`, then `set_active(true)`
- [ ] Every reachable state has an exit transition (or an `ANYSTATE` one)
