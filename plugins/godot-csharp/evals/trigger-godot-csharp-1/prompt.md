---
name: trigger-godot-csharp-1
description: A Godot C# port request that should load godot-csharp.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot 4.7 project (project.godot plus Arena.csproj in the root) has this GDScript enemy. Port it to C# as scripts/Enemy.cs and keep the signal working for the HUD, which is also C#:

```gdscript
extends CharacterBody2D
signal died(score: int)
@export var speed := 80.0
@export var max_hp := 30
var hp := max_hp
@onready var target: Node2D = get_tree().get_first_node_in_group("player")

func _physics_process(delta: float) -> void:
	velocity = global_position.direction_to(target.global_position) * speed
	move_and_slide()

func hit(amount: int) -> void:
	hp -= amount
	if hp <= 0:
		died.emit(10)
		queue_free()
```
