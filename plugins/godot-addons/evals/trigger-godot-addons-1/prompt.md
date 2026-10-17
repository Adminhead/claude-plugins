---
name: trigger-godot-addons-1
description: A Dialogue Manager syntax question in a Godot project that should load godot-addons.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My Godot 4.7 project has addons/dialogue_manager (plugin.cfg says version 4.1.0). This .dialogue file worked before I upgraded the addon and now the second response never shows and the editor flags the line:

```
~ start
Nathan: Need anything?
- Buy a potion [if PlayerState.gold >= 10] => shop
- No thanks
	Nathan: Suit yourself.
=> END
```

What changed and how do I fix it? Also, should I still use `set PlayerState.gold -= 10` in the shop branch?
