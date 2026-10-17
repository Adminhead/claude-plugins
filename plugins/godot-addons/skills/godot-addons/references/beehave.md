# Beehave

Addon v2.9.3 (bitbrain/beehave, MIT) checked against Godot 4.7, 2026-10-17. Pure GDScript; there is no C# API (from C#, call the GDScript nodes through `Call`/`Get`).

## Contents

- Tree shape and the `BeehaveTree` node
- Composites and decorators
- Writing leaves
- Blackboard
- Custom decorators and manual ticking
- Debugger and performance
- Checklist

## Tree shape

Every part of a Beehave tree is a regular node in the scene:

```
Enemy (CharacterBody2D)
  BeehaveTree            # actor defaults to the parent
    SelectorComposite
      SequenceComposite  # attack if in range
        IsInRangeCondition
        AttackAction
      PatrolAction       # fallback
```

`BeehaveTree` extends `Node`, not `BeehaveNode`. Its exports:

| Property | Default | Notes |
|---|---|---|
| `enabled` | `true` | `enable()` / `disable()`; signals `tree_enabled`, `tree_disabled` |
| `tick_rate` | `1` | Tick every N frames. Raise it (3 to 10) for distant or background agents |
| `process_thread` | `PHYSICS` | `ProcessThread.IDLE`, `PHYSICS` or `MANUAL`. Match the actor's loop |
| `blackboard` | auto-created | Assign a shared `Blackboard` node to share data across trees |
| `actor_node_path` / `actor` | parent | The node passed to every `tick()` |
| `custom_monitor` | `false` | Adds a Performance monitor with this tree's process time |

Other methods: `tick() -> int` (manual mode), `interrupt()`, `get_running_action()`, `get_last_condition()`.

## Composites and decorators

| Composite | Logic |
|---|---|
| `SequenceComposite` | AND: fails on the first failure; resumes a RUNNING child next tick |
| `SequenceReactiveComposite` | AND, re-checks from the first child every tick (interrupts the running child if an earlier one now fails) |
| `SequenceStarComposite` | AND that keeps its progress: after a failure it retries the failed child next tick instead of re-running children that already succeeded |
| `SelectorComposite` | OR: succeeds on the first success |
| `SelectorReactiveComposite` | OR, re-checks from the first child every tick |
| `SequenceRandomComposite` / `SelectorRandomComposite` | Shuffled order; set `use_weights` for per-child weights (Inspector only) |
| `SimpleParallelComposite` | Runs a primary (child 0) and a secondary; the result follows the primary |

| Decorator | Effect |
|---|---|
| `InverterDecorator` | SUCCESS and FAILURE swap; RUNNING passes through |
| `AlwaysSucceedDecorator` / `AlwaysFailDecorator` | Force the result; RUNNING passes through |
| `RepeaterDecorator` | Re-runs the child for `repetitions` successes |
| `LimiterDecorator` | Allows `max_count` ticks, then FAILURE |
| `CooldownDecorator` | Blocks re-entry for `wait_time` seconds after the child finishes |
| `TimeLimiterDecorator` | Interrupts the child after `wait_time` seconds |
| `DelayDecorator` | Waits `wait_time` before the first child tick |
| `UntilFailDecorator` | Loops the child until FAILURE, then returns SUCCESS |

A decorator must have exactly one child.

## Writing leaves

Extend `ConditionLeaf` for a one-tick check and `ActionLeaf` for work that may take several ticks. Override `tick(actor, blackboard) -> int` and return `SUCCESS`, `FAILURE` or `RUNNING` (constants on `BeehaveNode`). A condition never returns RUNNING.

```gdscript
class_name IsInRangeCondition
extends ConditionLeaf

@export var detection_range := 150.0

func tick(actor: Node, blackboard: Blackboard) -> int:
	var body := actor as Node2D
	var target: Node2D = blackboard.get_value("target")
	if body == null or not is_instance_valid(target):
		return FAILURE
	return SUCCESS if body.global_position.distance_to(target.global_position) <= detection_range else FAILURE
```

```gdscript
class_name AttackAction
extends ActionLeaf

@export var attack_duration := 0.5

func before_run(actor: Node, blackboard: Blackboard) -> void:
	blackboard.set_value("attack_elapsed", 0.0, str(actor.get_instance_id()))

func tick(actor: Node, blackboard: Blackboard) -> int:
	var key := str(actor.get_instance_id())
	var elapsed: float = blackboard.get_value("attack_elapsed", 0.0, key) + get_physics_process_delta_time()
	if elapsed < attack_duration:
		blackboard.set_value("attack_elapsed", elapsed, key)
		return RUNNING
	if actor.has_method("play_attack"):
		actor.play_attack()
	return SUCCESS

func after_run(actor: Node, blackboard: Blackboard) -> void:
	blackboard.erase_value("attack_elapsed", str(actor.get_instance_id()))

func interrupt(actor: Node, blackboard: Blackboard) -> void:
	after_run(actor, blackboard)
	super(actor, blackboard)
```

Lifecycle hooks: `before_run` once before the first tick of a run, `after_run` when the node finishes, `interrupt` when a reactive composite or the tree cuts a RUNNING node off. Clean up blackboard keys in both `after_run` and `interrupt`.

Scaffolding templates ship in the addon's `script_templates/`; copy that folder to the project root to get them in the New Script dialog.

## Blackboard

A `Blackboard` node is a key/value store passed to every `tick`. Methods: `set_value(key, value, blackboard_name := "default")`, `get_value(key, default := null, blackboard_name := "default")`, `has_value(key, name)`, `erase_value(key, name)`, `keys()`. The optional `blackboard_name` is a namespace; use it (or the actor's instance id, as above) when one blackboard serves several actors or subsystems.

Inspector-only leaves exist for simple cases: `BlackboardSetAction`, `BlackboardEraseAction`, `BlackboardHasCondition`, `BlackboardCompareCondition`. Their expressions run through Godot's `Expression` with the blackboard as the base instance, so `get_value("health") < 20` works in the expression string.

## Custom decorators and manual ticking

A custom decorator extends `Decorator` and must drive its child's lifecycle itself, as the built-ins in `addons/beehave/nodes/decorators/` do (copy `inverter.gd` as the template):

```gdscript
@tool
class_name LogDecorator
extends Decorator

func tick(actor: Node, blackboard: Blackboard) -> int:
	var c: BeehaveNode = get_child(0)
	if c != running_child:
		c.before_run(actor, blackboard)
	var response: int = c._safe_tick(actor, blackboard)
	if response == RUNNING:
		running_child = c
	else:
		c.after_run(actor, blackboard)
	print("%s -> %s" % [c.name, ["SUCCESS", "FAILURE", "RUNNING"][response]])
	return response
```

Skipping `before_run`/`after_run` here breaks leaves that reset state in those hooks.

For turn-based or time-sliced AI, set `process_thread = MANUAL` and call `$BeehaveTree.tick()` yourself; it returns the status code and never ticks on its own.

## Debugger and performance

- Running the project from the editor adds a **Beehave** tab to the Debugger panel. Select a tree to watch active nodes light up each tick. `beehave/debugger/start_detached` in Project Settings opens it floating.
- `custom_monitor = true` registers a per-tree process-time monitor in the Debugger's Monitors tab.
- `RepeaterDecorator.get_class_name()` returns `LimiterDecorator` in this version (upstream bug). Use `is RepeaterDecorator` for identity checks.

## Checklist

- [ ] Plugin enabled; `BeehaveTree` is a child of the actor, or `actor_node_path` set
- [ ] `process_thread` matches the actor (`PHYSICS` for `_physics_process`, `IDLE` for `_process`)
- [ ] Every `tick` returns SUCCESS, FAILURE or RUNNING; conditions never return RUNNING
- [ ] Per-run state is on the blackboard, keyed or namespaced per actor, and cleared in `after_run` and `interrupt`
- [ ] `tick_rate` raised for agents that don't need per-frame decisions
- [ ] Tick flow checked in the Beehave debugger tab before tuning behaviour
