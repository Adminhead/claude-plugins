# RPG

Core loop: explore, encounter (fight, talk, solve), earn rewards (XP, loot, story), grow (level, gear, unlocks), take on harder content. The fantasy is getting stronger and shaping who the character is; every system should feed growth and choice.

## Core systems (build in this order)

1. **Stats:** base attributes, derived combat stats, a modifier layer.
2. **Combat:** turn-based, ATB or action; damage formula, status effects.
3. **Leveling:** XP curve and level-up gains.
4. **Items, inventory and equipment** as data.
5. **Quests** as small state machines driven by game events.
6. **Dialogue** with conditions on game state (`dialogue.md`).
7. **Save and load** of character, inventory, quest progress and world flags, versioned.
8. **Economy and gating:** shops, gold, region or level locks.
9. **UI:** HUD, inventory, character sheet, quest log, dialogue box.

## Data model

```text
base     = { STR: 10, AGI: 10, INT: 10, VIT: 10 }       # the only stat truth
modifier = { source_id, stat, type: flat | percent | override, value, duration? }
derived(base, mods) -> { max_hp, attack, defense, crit, speed }   # recomputed, never stored
item     = { id, slot, stackable, max_stack, modifiers: [...], value }
inventory = [ (item_id, count) ];  equipment = { slot: item_id }
quest    = { id, state: available | active | complete | turned_in,
             objectives: [ { id, event, filter, count, needed } ], rewards }
```

- Modifier order: base, then flat adds, then percent multipliers, then overrides, then clamp. Equip pushes the item's modifiers with its id as `source_id`; unequip removes by that id.
- Effects that can stack or refresh key on source plus effect id, never on the effect resource alone, or reapplying silently resets it. Ability, effect and stat-modifier architecture is in `game-architecture` (patterns reference).
- Quest definitions are data; quest progress (state, objective counts) goes in the save.
- Inventory: `add_item` returns the leftover that didn't fit; fill existing stacks before empty slots; emit one change event per operation.

## Formulas

```text
subtractive: dmg = max(1, atk - def)                    # tactical at low numbers, trivializes at high
ratio:       dmg = atk * (1 - def / (def + K))          # K about 100; smooth diminishing returns
then:        dmg *= rng.range(0.9, 1.1); if crit: dmg *= 1.5; dmg *= type_multiplier   # 0.5 / 1 / 2
```

XP to next level: linear `base * L` (gentle), quadratic `base * L^2` (classic JRPG), exponential `base * g^L` with g 1.2 to 1.5 (steep; cap it). Pick a formula family and a curve deliberately and plot both to max level before writing content.

Combat timelines: turn-based orders by a speed stat (reuse the energy scheduler from `roguelike.md`); ATB fills a gauge by speed and acts when full; action combat uses cooldowns, attack timing and the engine's movement.

## Feel targets

- Level-ups are events: full heal or not (decide), a clear fanfare, the new numbers shown side by side with the old.
- Show damage numbers and effectiveness ("weak!", "resist") so the player learns the systems.
- Equipment comparison shows the stat delta before equipping.
- Turn-based menus: the last-used command is remembered; battle speed and auto-battle options for grinding.
- Telegraph the next unlock (skill, area, item) so players are pulled forward.

## Balancing norms

| Knob | Norm |
| --- | --- |
| Early levels | a level within the first few minutes; later levels stretch out |
| Variance and crit | about plus or minus 10% damage; crit about 1.5x; cap crit chance (about 50%) |
| Stat scaling | no single attribute should dominate every build; check each against every derived stat |
| Encounter difficulty | a standard fight costs a bit of resources; a boss should be beatable at the expected level with some preparation |
| Economy | loot sale value must not trivialize shop prices; sinks (repairs, consumables, upgrades) balance faucets |
| Gating | soft gates (strong enemies) feel better than invisible walls; hard gates tie to story |
| Choice weight | flags set by quests and dialogue change later content, not just the next line |

Economy, sinks and faucets, and progression curves in depth: `game-design`.

## Pitfalls

- Buffs or gear editing base stats: values drift and corrupt saves. Use the modifier layer.
- Derived stats stored as truth: stale after any change.
- Runaway numbers: an uncapped exponential curve or a subtractive formula at huge values.
- Content hardcoded instead of data.
- Save without a version field: old saves break on update.
- Quest progress not saved mid-quest, only completion.
- Choices that reconverge immediately: they read as fake.
- An inventory registry that scans resource folders at runtime: breaks in exported builds. Use an explicit list or the engine's export-safe listing.

## Engine pointers

- Items, enemies, quests as resources; save files; UI: `godot` (resources, save-and-config and UI references).
- Enemy AI: `game-ai`; dialogue: `dialogue.md` and, in Godot, `godot-addons` (Dialogue Manager).
- Overworld and dungeons: `level-design`.
