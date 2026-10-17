---
name: trigger-godot-testing-1
description: "Writing GUT tests for a GDScript class loads godot-testing."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We have GUT installed in addons/gut. Can you write tests for this inventory script (res://src/inventory.gd)? I want to check that adding past capacity is rejected and that `item_added` fires.

```gdscript
class_name Inventory
extends Node

signal item_added(id: StringName)

@export var capacity := 10
var _items: Array[StringName] = []

func add(id: StringName) -> bool:
	if _items.size() >= capacity:
		return false
	_items.append(id)
	item_added.emit(id)
	return true
```
