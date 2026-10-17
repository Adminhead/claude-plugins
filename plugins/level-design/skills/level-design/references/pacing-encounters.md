# Pacing, encounters and readability

## Contents

1. The tension curve
2. The teaching loop
3. Encounter design
4. Arena layout
5. Readability and guidance
6. 2D versus 3D
7. Blockout review checklist

## 1. The tension curve

Plot intended intensity against progress.

- **Overall rise with local dips.** Spikes (combat, gauntlets, bosses) separated by rests (exploration, story, safe rooms). A constant high numbs the player's stress response; a constant low bores them.
- **Rhythm:** introduce, build, peak, release, then repeat higher. Each peak exceeds the last, and each rest sits a little above the previous baseline.
- **Rest before the climax.** A save point, a vista or a supply cache right before the hardest beat sharpens the spike.
- **Make it data.** Keep the beat list (room, type, intensity) in a file next to the level, and drive spawns and music intensity from it. Reviewers can then read the curve without playing.

```text
BEATS = [
  {room: "entry",     type: "teach",  intensity: 0.1},
  {room: "hall_1",    type: "combat", intensity: 0.5},
  {room: "vista",     type: "rest",   intensity: 0.1},
  {room: "gauntlet",  type: "combat", intensity: 0.8},
  {room: "save_room", type: "rest",   intensity: 0.2},
  {room: "boss",      type: "climax", intensity: 1.0},
]
```

## 2. The teaching loop

1. **Introduce** the mechanic in isolation, where failure is harmless (a visible spike to step over, an enemy that can't yet hurt you).
2. **Develop** it by combining it with movement or one known element.
3. **Twist** the context so the player applies the idea, not a memorised motion.
4. **Test** it under time or health pressure.

A new mechanic meets the player before a lethal test, never during one. A level is a lesson plan, which is why the first room is calm and the boss comes last. Introduce at most one new idea per section.

## 3. Encounter design

An encounter is a designed problem, not a headcount.

- **Roles over numbers.** Mix enemy roles: fodder (pressure), ranged (forces movement), tank (focus target), flanker (punishes standing still), support (priority target). Two roles that combine well beat many copies of one.
- **Telegraph.** Show the enemies or the arena before the fight starts, so the player can plan. Ambushes are seasoning, not the main course.
- **Spawns.** Never spawn in the player's view or behind them without warning. Spawn from readable places (doors, vents, the far side of the arena).
- **Waves.** Escalate across waves, trigger the next wave on a count left (for example two enemies left) rather than zero so tension holds, and cap the number alive at once.
- **Escalation across the level.** Reuse a known enemy in a harder context before introducing a new one.
- **Resources.** Place health and ammo where the curve dips, and a little before the spike, not after.
- **Difficulty knobs.** Count, mix, arena size, cover, time pressure and resource drops. Change one per step of escalation.
- **Exit.** Signal clearly that the encounter is over (music, a door opening, a sound), so the player can switch into exploration.

## 4. Arena layout

- Give the player choices: at least two routes around the space, and cover that blocks some lines of fire but not all.
- Height gives an advantage. Let the player earn it, or give it to the enemy on purpose.
- Keep sightlines from the entrance so the player can read the arena on arrival.
- Avoid dead-end corners where the player can cheese the AI, unless that's intended.
- Check the space against enemy navigation: every enemy can reach the player, and no enemy gets stuck on geometry.
- For 3D third-person, leave room for the camera; tight corners plus walls make the camera fight the player.

## 5. Readability and guidance

Players follow attention, not signs.

- **Light and contrast:** a lit doorway reads as "go here"; shadow reads as optional or dangerous.
- **Leading lines:** architecture, rails, cables and paths that point toward the objective.
- **Landmarks:** a tall, unique silhouette visible from afar orients the player across the level.
- **Colour language:** one consistent colour or material for climbable, breakable or interactive surfaces. Teach it once, then use it everywhere, and never use it on surfaces that aren't interactive.
- **Framing:** show the next goal from a high point before the player descends to it.
- **Breadcrumbs:** pickups or enemies along the path pull players forward.
- **Affordance honesty:** what looks reachable should be reachable, and what looks like a wall should be a wall. A fake affordance teaches players to distrust the level.

## 6. 2D versus 3D

- **2D:** think in the tile grid and the camera window. The player sees a fixed slice, so telegraph off-screen threats with audio and approach time. Platform spacing and sightlines dominate.
- **3D:** think in sightlines, verticality and navigation. Landmarks and framed vistas matter more, and the camera's view cone changes what feels reachable.

## 7. Blockout review checklist

- The critical path is solvable with keys and abilities obtained in order (the gated flood fill passes).
- Every required jump and traversal fits the safe metrics.
- The intensity reads as a rising sawtooth, with a rest before each major spike.
- Each mechanic is introduced safely before it's tested.
- The eye is guided to the path; first-time players were watched for getting lost.
- Optional content rewards the detour and rejoins smoothly.
- One-way moves are telegraphed and can't strand the player.
- Encounters telegraph, spawn fairly and signal their end.
- It plays well as untextured geometry.
- It was validated with players other than its designer.
