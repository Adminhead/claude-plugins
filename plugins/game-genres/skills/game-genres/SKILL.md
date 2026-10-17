---
name: game-genres
description: Genre playbooks for any engine - core systems, data model, feel targets, balancing norms and pitfalls for platformers, roguelikes, deckbuilders and card games, puzzles, RPGs, FPS, tower defense, survival-crafting and visual novels, plus branching dialogue. Use for "make a roguelike/platformer/deckbuilder..." or genre-specific tuning.
---

# Game genres

Each genre has a reference with the same five parts: core systems, data model, feel targets, balancing norms and pitfalls, followed by pointers to the skills that implement the engine side. Read only the reference you need; read two for a hybrid.

Not for: general design documents, economies and progression curves (`game-design`), architecture patterns such as FSMs, save systems and inventories (`game-architecture`), enemy decision-making (`game-ai`), screen shake and hit-stop (`game-feel`), level layout and procedural generation (`level-design`), engine APIs (`godot` and its siblings).

## Route by genre

| The user is building | Read |
| --- | --- |
| A platformer, "Celeste-like", jump feel | `references/platformer.md` |
| A roguelike or roguelite, turn-based dungeon crawler, permadeath | `references/roguelike.md` |
| A deckbuilder, TCG/CCG, solitaire, any game of cards moving between zones | `references/card-game.md` |
| Match-3, sokoban, sliding or logic puzzles | `references/puzzle.md` |
| An RPG, JRPG or action RPG: stats, levels, quests, equipment | `references/rpg.md` |
| A first-person shooter, aim feel, TTK, recoil | `references/fps.md` |
| Tower defense, wave defense | `references/tower-defense.md` |
| Survival, crafting, base building | `references/survival-crafting.md` |
| A visual novel, dating sim, branching story game | `references/visual-novel.md` |
| Branching dialogue in any genre, Ink, Yarn Spinner, a custom runner | `references/dialogue.md` |

Common hybrids: roguelike deckbuilder (card-game + roguelike), action roguelite (platformer or fps + roguelike), RPG with dialogue (rpg + dialogue), VN with a puzzle layer (visual-novel + puzzle). For a genre not listed, pick the nearest reference and say which parts don't apply.

## What every genre build needs first

1. **Write the core loop in one sentence** (verb, feedback, reward, repeat) and check each planned system feeds it. Cut or defer systems that don't.
2. **Prototype the core verb before content.** The jump, the shot, the card play, the match must feel right in a greybox before levels, art or menus. `game-prototype` covers the greybox and jam process.
3. **Content is data.** Items, cards, enemies, waves, recipes, quests and dialogue live in data files or engine resources referenced by stable ids, interpreted by a small amount of code. One function per card or per item doesn't scale.
4. **Logic separate from presentation.** The game state (board, deck, stats) is the source of truth; visuals and animation read it. Lock input while a resolution plays out.
5. **One seeded RNG per run or level**, stored in the save, so bugs, daily runs and replays reproduce.
6. **Separate run state from profile state** in saves (current run versus unlocks and settings), with a `version` field from day one.
7. **Scale everything time-based by delta time** (movement, timers, decay, cooldowns).
8. **Expose the numbers you will tune** (jump height, TTK, wave HP growth, drop weights) in one place, then tune by playtest (`game-playtest`).

## Using a reference

- Treat each reference's numbers as starting points; state which ones you used so the user can tune them.
- Build in the order the reference's "core systems" list gives; earlier systems are prerequisites for later ones.
- Before calling a genre feature done, walk its pitfalls list and check each one against the code.
- Engine code isn't in these references. In a Godot project, the engine side comes from `godot` (scenes, resources, UI, tilemaps, navigation, save files), `godot-physics` (character controllers, raycasts) and `godot-addons` (Dialogue Manager, beehave, LimboAI, Phantom Camera).

Adapted from awesome-gamedev-agent-skills (genre skills and `dialogue-systems`, Apache-2.0) and GodotPrompter (`dialogue-system`, MIT); see NOTICE.
