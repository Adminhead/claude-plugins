# Tower defense

Core loop: prepare (place and upgrade towers with current gold), start the wave, enemies walk toward the goal while towers auto-fire, earn gold from kills, survive, repeat against a harder wave. The tension is a planning puzzle: is my damage enough for what's coming, and can I afford the answer?

## Core systems (build in this order)

1. **Enemy path:** fixed waypoint lanes, or a grid with pathfinding for maze TD.
2. **Wave spawner:** data-driven sequences with per-wave scaling.
3. **Towers:** range, fire rate, damage, projectile or hitscan, splash; placement validation.
4. **Targeting** with per-tower priority.
5. **Economy:** kill bounty, wave bonus, build, upgrade and sell.
6. **Lives:** leaks cost lives; zero ends the game.
7. **Prep UI:** lives, gold, next-wave preview, start-next-wave button, tower range preview.

## Data model

```text
enemy_type = { id, hp, speed, armor, bounty, tags: [flying, armored, swarm, boss], lives_cost }
wave       = [ { enemy: "grunt", count: 10, spacing: 0.5, delay: 0 }, ... ]   # spawn groups
tower_type = { id, cost, range, fire_rate, damage, splash_radius?, can_hit: [ground, air],
               upgrades: [ { cost, damage, range, fire_rate } ], sell_ratio: 0.7 }
enemy      = { type, hp, path_progress, waypoint_index }     # progress drives "first" targeting
```

## Paths and targeting

- **Waypoints:** move toward the next waypoint by `speed * dt`, advance within an arrival radius, leak at the end. Most TD games use this.
- **Maze TD:** A* or a flow field from the goal over the grid; towers reshape the path. Before accepting a placement, check a path from spawn to goal still exists; reject it otherwise. Recompute the flow field once per placement, not per enemy (`game-ai`, pathfinding reference).
- Targeting modes per tower: **first** (furthest along the path, the default, stops leaks), **last**, **closest**, **strongest**, **weakest**. Filter to in-range enemies (squared distance) before sorting. Let the player change the mode; it changes play more than raw stats do.
- Spatial queries: with hundreds of enemies, bucket them in a grid so each tower checks nearby cells only.

## Feel targets

- Placement preview shows range and validity (green or red) before committing.
- Projectiles or beams are readable; hits flash the enemy; kills pop with a bounty number.
- Fast-forward (2x, 3x) for confident players; pause while placing is allowed.
- Leaks are loud: a distinct sound and a lives counter flash.
- The next wave's composition (especially flying and boss waves) is previewed one wave ahead.

## Balancing norms

```text
tower_dps     = damage * fire_rate * (1 - armor_reduction)
time_in_range = path_length_inside_range / enemy_speed
damage_dealt  = tower_dps * time_in_range                  # one tower vs one passing enemy
lane holds if the sum over covering towers >= enemy hp, allowing for single-target towers
splitting fire when enemies overlap
```

| Knob | Norm |
| --- | --- |
| Enemy HP growth | geometric, about 1.10 to 1.20x per wave |
| Income | roughly linear per wave; the player should almost afford each wave's answer |
| Enemy variety | fast and light (needs slows), armored (beats rapid low damage), flying (needs anti-air), swarm (needs splash), boss (HP spike) |
| Upgrades | cost-efficient enough that "tall" competes with "wide"; diminishing returns stop a god-tower |
| Sell refund | about 70%, so repositioning is possible but not free |
| Leaks | cost lives and the lost bounty, so leaking is never optimal |
| Interest or banking | optional; cap it or it snowballs |
| Pacing | spike, breather, spike; an early-call bonus rewards confident players |

Simulate before playtesting: a script that runs each wave against a reference build (a fixed tower layout bought with the income so far) shows where the HP curve outruns income, or the reverse. Spreadsheet and simulation methods are in `game-design` (balancing reference).

## Pitfalls

- HP scaling slower than income and DPS: the game trivializes after a few waves. Faster: it walls.
- One dominant tower or build: add hard counters and diminishing upgrade returns.
- Maze TD placements that fully block the goal: enemies stall or the game soft-locks.
- No next-wave telegraph: special waves feel random and unfair.
- Movement not scaled by delta time, which also breaks fast-forward. Fast-forward should scale the simulation step count or time scale consistently, not just enemy speed.
- Targeting by list order instead of path progress: towers shoot whatever spawned first, not what's about to leak.
- Monotonic difficulty ramp: exhausting.

## Engine pointers

- Path following and navigation: `game-ai`; in Godot, `Path2D`/`PathFollow2D` for lanes and the `godot` navigation reference for maze TD.
- Towers, enemies and waves as data resources; HUD and build menu: `godot` (resources and UI references).
- Map layout: `level-design`; feedback juice: `game-feel`.
