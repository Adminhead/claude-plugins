---
name: trigger-godot-physics-1
description: A Godot CharacterBody2D falling through the floor should load godot-physics.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My player in Godot keeps falling straight through the ground. The player is a CharacterBody2D with a CollisionShape2D (capsule), the level is a TileMapLayer with physics on the tiles. `is_on_floor()` is never true. Here's player.gd:

```gdscript
extends CharacterBody2D

const SPEED = 180.0
const GRAVITY = 900.0

func _process(delta):
    velocity.y += GRAVITY * delta
    velocity.x = Input.get_axis("left", "right") * SPEED * delta
    position += velocity
    move_and_slide()
```

What's wrong?
