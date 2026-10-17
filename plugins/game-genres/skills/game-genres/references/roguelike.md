# Roguelike

Core loop: take a turn, the world resolves its turn, read the new state, loot, descend or die, then restart in a fresh dungeon. Replayability comes from the world changing each run, not from memorizing a layout.

Design anchor: the Berlin Interpretation (RogueBasin, 2008) lists "roguelikeness" factors, not a checklist. The high-value ones: random generation, permadeath, turn-based, grid-based, non-modal (everything in one mode), complexity (many item and monster interactions), resource management, exploration and discovery. Choose which to keep on purpose. A "roguelite" usually relaxes permadeath with meta-progression.

## Core systems (build in this order)

1. **Seeded run RNG** and a grid map with walkable and blocked queries.
2. **Turn scheduler** (energy-based, below). The player and monsters obey the same rules.
3. **Movement and bump-to-attack combat:** HP, attack, defense, status effects.
4. **Dungeon generator** with a guaranteed connectivity pass.
5. **Field of view** plus explored memory (fog of war).
6. **Items and drop tables**, scaled by depth.
7. **Message log and readable UI:** the player plans from text and numbers.
8. **Permadeath and optional meta-progression.**

## Data model

- Map: 2D grid of tile types plus per-cell `explored` and `visible` flags.
- Entity: position, `speed`, `energy`, stats, faction, AI kind, inventory.
- Content as data: monster and item definitions by id; spawn tables and drop tables as `(entry, weight, min_depth)` lists.
- Run state (wiped on death): seed, depth, current map, player, inventory, turn count.
- Profile state (survives death): unlocks, currency, high scores, settings.

## Turn scheduler

```text
TURN_COST = 100
next_actor():
    loop:
        for a in actors (stable order):
            a.energy += a.speed          # 100 = normal, 150 = hasted, 50 = slowed
            if a.energy >= TURN_COST: a.energy -= TURN_COST; return a
```

The scheduler blocks on the player's input when the player is next; monsters resolve instantly. Actions may cost different energy (a heavy attack 150, a quick step 50).

## Generation, FOV and loot

- Pick a generator by texture: rooms-and-corridors (readable), BSP (tidy, building-like), cellular automata (caves), drunkard's walk (winding). Algorithms and seeding rules are in `level-design` (procgen reference).
- Always finish with connectivity: flood-fill from the start and carve corridors to unreached regions, or keep only the largest region for caves. Assert every floor cell is reachable.
- Spawn the player in the first room and the stairs in the farthest one (by path distance).
- FOV: use recursive or symmetric shadowcasting with a circular radius (`dx*dx + dy*dy <= r*r`). Recompute when the player moves. Render visible cells lit, explored cells dimmed, the rest hidden. Symmetry (if A sees B, B sees A) matters for fairness.
- Drop tables: weights are relative, not percentages. Keep "nothing" and commons as most of the weight so rares stay exciting. Weighted-table math lives in `game-design` (economy reference).

## Feel targets

- One keypress, one turn, instant feedback. Animation must never delay the next input; play it fast or skip it when inputs queue.
- Bump to attack, bump to open doors, auto-pickup of common items: fewer modes, fewer keys.
- Every hit, miss and status change appears in the message log with numbers.
- Hit and death effects still matter on a grid: a short flash and a small shake sell impact (`game-feel`).

## Balancing norms

| Knob | Norm |
| --- | --- |
| Monster density and strength | scale by depth through depth-gated spawn entries |
| Power items | gate behind a minimum depth so early runs can't snowball |
| Resources (food, healing, ammo) | scarce enough to push descent; resource pressure is the core tension |
| FOV radius | 6 to 10 cells; smaller is tenser and slower |
| Run length | classic 26 levels is long; modern roguelites aim for 20 to 60 minute runs |
| Identification | unidentified potions and scrolls reward experimentation; keep a few safe ways to learn |
| Meta-progression | unlock options (new items, classes) more than raw power, or skill stops mattering |

## Pitfalls

- Disconnected rooms or the stairs behind a wall: missing connectivity pass.
- Naive per-cell raycast FOV: asymmetric or flickering vision.
- A real-time loop pretending to be turn-based: input races and double moves. Resolve one discrete turn at a time and queue input.
- Unseeded generation: bugs can't be reproduced and daily runs can't exist.
- Permadeath that wipes unlocks: keep run and profile saves separate.
- Save-scumming in a "permadeath" game: delete or invalidate the run save as it loads, keeping only the profile.
- Flat difficulty: monsters and loot not scaled by depth, so there's no reason to descend.
- Unreadable state: hidden numbers, no log, no way to inspect a monster.

## Engine pointers

- Grid rendering: `godot` (2D and tilemap reference); monster brains: `game-ai` (seek, flee and patrol are usually enough on a grid; Godot's `AStarGrid2D` handles grid paths).
- Save files and run/profile split: `game-architecture` (save reference) and `godot` (save-and-config reference).
- Item and monster definitions as data: `godot` (resources) in Godot.
