---
name: negative-godot-physics-unity
description: The same tunneling symptom in a Unity project does not route to godot-physics.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In Unity 6, my bullets (small Rigidbody spheres moving at about 200 m/s) pass straight through thin walls about half the time. I set the collision detection mode on the Rigidbody to Discrete. Should I switch to Continuous Dynamic, use a raycast in FixedUpdate, or both?
