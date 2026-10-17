# Survival-crafting

Core loop: gather raw resources, craft tools and items, build and upgrade a base, manage survival needs, explore farther for better resources, survive escalating threats, repeat at a higher tier. Each loop must unlock the next (better tool, new biome, new resource, better craft). When that ladder breaks, the game becomes a grind.

## Core systems (build in this order)

1. **Resource nodes and gathering** with tool tiers and respawn.
2. **Inventory:** stacks, a capacity limit (slots or weight), hotbar, transfer.
3. **Crafting:** recipes, stations, a tech tree.
4. **Survival needs:** hunger, thirst, temperature, stamina, health.
5. **Base building:** placement with snapping and validation, storage, stations.
6. **World and day/night cycle:** biomes, resource distribution, time driving threats.
7. **Threats:** creatures, weather, raids, escalating over time.
8. **Save and load** of a large, changing world.

## Data model

```text
item     = { id, max_stack, weight?, tags: [tool, food, fuel], tool_tier?, food_value? }
recipe   = { id, inputs: { wood: 3, stone: 2 }, output: [stone_axe, 1],
             station: workbench | none, requires_tech: basic_tools }
tech     = { id, requires: [ids], unlocks: [recipe ids, station ids] }       # a DAG
node     = { type, hp, required_tier, drop_table, respawn_time }
need     = { value 0..max, decay_per_sec, activity_multipliers, warn_at, fail_effect }
structure = { id, cost, footprint, sockets, provides: storage | station | defense }
```

- Recipe chains with intermediates (log to plank, ore to ingot, then plank plus nails to wall) add depth without more raw resource types.
- Inventories for survival: slots or weight, plus grid shapes if the design wants Tetris-style packing. `add` returns the leftover; fill existing stacks first. The general inventory pattern is in `game-architecture` (patterns reference).

## Rules that keep it correct

```text
craft(recipe):
    if not can_craft(recipe, inventory, tech, station): return false
    for item, n in recipe.inputs: inventory.remove(item, n)
    leftover = inventory.add(recipe.output)
    if leftover: drop_on_ground(leftover)          # never lose an output to a full inventory
    return true
```

- Crafting validates everything, then consumes and adds as one step. A partial craft that eats inputs is the classic bug.
- Gathering: a node yields only if `tool.tier >= node.required_tier`; tell the player why when it doesn't.
- Placement: validate overlap, ground, reach and materials before consuming anything.
- Needs decay by `rate * dt * activity_multiplier` (sprinting, cold and carrying weight raise hunger).

## Feel targets

- Needs show on the HUD with a warning state well before zero; failure is damage over time, never instant death.
- Gathering has hit feedback per swing (particles, sound, a node shake) and pops items toward the player.
- Crafting menus show what's craftable now, what's missing, and what a recipe unlocks.
- Building previews a ghost that snaps and colors itself valid or invalid.
- Nights or raids are telegraphed (dusk lighting, a warning, a "blood moon") so the player can prepare.

## Balancing norms

| Knob | Norm |
| --- | --- |
| Need decay | manageable during normal play, dangerous only when neglected; thirst faster than hunger |
| Need failure | warnings, then attrition; safe and fed regenerates health |
| Resource placement | scarce near the base, richer farther out; scarcity pushes exploration |
| Respawn | nodes regrow on a timer or repopulate while the player is away; a permanently stripped map makes players quit |
| Tool tiers | each tier opens a new node type (fists: wood; stone pick: stone and ore; metal pick: hard ore) |
| Inventory cap | tight enough to force base trips and storage, loose enough for a full gathering trip |
| Threat escalation | tied to days survived, tech tier or distance from spawn; new threats arrive as the player unlocks the answer |
| Day length | day for gathering, night for defense; shipped games range from about 8 to 30 real minutes per full cycle (Minecraft is 20) |

## Pitfalls

- Needs that kill instantly: frustration and save-scumming.
- Grind without a ladder: gathering that never unlocks better gathering.
- Non-atomic crafting, or outputs lost to a full inventory.
- No inventory limit: no logistics tension, no reason for storage or a base.
- Permanent depletion: the world empties.
- Decay not scaled by delta time.
- Saving the whole world at once on a big map: hitches and corrupted saves on crash. Save changed chunks and structures incrementally, keep a `version`, autosave on safe events (sleeping, day rollover), never mid-combat.
- A flat threat curve: no late-game pressure.

## Engine pointers

- Items, recipes and tech trees as data resources; inventory and crafting UI: `godot` (resources and UI references).
- World generation and biome placement: `level-design` (procgen reference).
- Creature AI: `game-ai`; save systems: `game-architecture` and `godot` (save-and-config reference).
