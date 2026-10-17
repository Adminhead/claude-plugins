---
name: game-ai
description: Designs NPC and enemy decision-making in any engine - finite state machines, behavior trees, utility AI, steering and flocking, A*, flow fields and navmeshes, perception and difficulty knobs. Use for enemy AI, patrol/chase/flee logic, a behavior tree or blackboard, utility scoring, pathfinding, or "the enemy gets stuck".
---

# Game AI

Build NPC behavior from three separate layers: **decide** (what to do), **path** (how to route there) and **steer** (how to move along the route). A behavior tree picks a target, the pathfinder returns waypoints, steering follows them. Keep each layer swappable and testable on its own.

Not for: an engine's concrete navigation API (in Godot, `NavigationRegion`/`NavigationAgent`, baking, avoidance and layers live in the `godot` skill's navigation reference), addon APIs such as beehave or LimboAI (`godot-addons`), state-machine architecture for non-AI game state (`game-architecture`), movement and collision feel (`game-feel`, `godot-physics`), wave spawning and lanes (`game-genres`, tower defense), procedural maps (`level-design`).

## Orient

- Find the engine and what already exists: an FSM or BT addon, a navigation setup, an existing `State` base class. Extend what is there instead of adding a second framework.
- Ask how many agents run at once and how smart they must look. Ten guards and five hundred zombies need different budgets, not different algorithms.
- Find the movement code the AI will drive (character controller, nav agent). The AI outputs intents; it never writes transforms directly.

## Pick the decision model

| Situation | Model |
| --- | --- |
| 2 to 5 named states with obvious transitions (idle, patrol, chase, attack, dead) | FSM |
| Many behaviors with priorities, interruption, reuse across enemy types | Behavior tree |
| "How much do I want each option right now": targets, needs, item or ability choice | Utility AI |
| Combat with a clear structure plus graded sub-choices | BT outside, utility inside one branch |

Start with an FSM. Promote a state to a behavior tree when its transition logic outgrows a few `if`s. Many shipped games run an FSM for top-level mode (Idle, Combat, Dead) and a BT inside Combat. Name the rejected model in the design note so the next reader knows it was considered.

### FSM

```text
state.enter(agent); state.update(agent, dt) -> next_state or none; state.exit(agent)

tick(dt):
    next = current.update(agent, dt)
    if next: current.exit(agent); next.enter(agent); current = next
```

- Keep transitions inside the states (or in one transition table), never in `if state == X` checks scattered across the codebase.
- One state owns one behavior. Entry and exit code (start the run animation, release the cover point) goes in `enter`/`exit`, not in whichever transition happens to fire.
- Two parallel machines (movement and weapon, say) must never write the same field.

### Behavior tree and utility AI

Read `references/behavior-trees.md` before writing or reviewing a BT runtime or tree: the status contract, memory versus reactive composites, `Reset()` on aborted branches, decorators, the blackboard, and tick cadence.

Read `references/utility-ai.md` before writing a utility scorer: response curves, the compensation factor, hysteresis, softmax selection, and the hybrid BT leaf.

## Perception

Perception writes facts to the agent's memory (the blackboard); decisions read them. Never raycast inside a decision node.

- **Sight:** range check first (cheapest, squared distance), then view-cone angle, then a line-of-sight ray. Run it at 5 to 10 Hz per agent, staggered.
- **Hearing:** gameplay events (gunshot, footstep, door) broadcast a position and loudness radius; agents in range get a "heard at" fact.
- **Memory:** store last-known position and time seen. When sight is lost, search that spot before giving up; forget after a timeout.
- **Damage from an unseen source:** turn toward it and go alert.
- **Reaction delay:** 0.2 to 0.6 s between "saw the player" and "shoots" reads as fair. Instant reaction reads as cheating.

## Pathfinding

- Grid or tile game: A* on the grid (or a coarser waypoint graph). 3D or arbitrary geometry: the engine's baked navmesh. Many agents to one goal: one flow field.
- Recompute a path on a timer (0.2 to 0.5 s) or when the goal moves to a new cell, never every frame. Cache the waypoints and advance an index.
- Defer the first path request until the navigation map is ready; engines build it asynchronously.

Read `references/pathfinding.md` when implementing A* by hand, picking a heuristic, building a flow field, smoothing a grid path, or deciding between a grid and a navmesh.

## Steering

Steering turns a desired direction into velocity changes, so agents accelerate, turn and stop smoothly.

```text
seek(target):   desired = normalize(target - pos) * max_speed
                return clamp_length(desired - vel, max_force)
arrive(target): like seek, but desired speed = max_speed * min(dist / slow_radius, 1)
                and when dist is near zero return -vel to cancel drift
integrate:      vel += steering * dt; vel = clamp_length(vel, max_speed); pos += vel * dt
```

- Steer toward the **next waypoint**, advancing when within a radius, never straight at the final goal.
- **Flocking:** sum weighted separation (push away from close neighbors), alignment (match neighbors' heading) and cohesion (move toward their center). Separation weight highest. Query neighbors through a spatial grid, not all-pairs.
- **Local avoidance** (agents not walking through each other) is usually the engine's job (RVO in the nav agent). Use the engine's version before writing your own.

## Difficulty knobs

Tune difficulty through what the AI perceives and how fast it acts, not by inflating health or damage.

| Knob | Easier | Harder |
| --- | --- | --- |
| Reaction delay | 0.6 s | 0.2 s |
| Aim error (cone or offset) | wide, narrowing over a burst | tight from the first shot |
| Sight range and cone | short, narrow | long, wide |
| Memory of last-known position | forgets fast | searches thoroughly |
| Attack tokens (how many attack at once) | 1 to 2 | 3 to 4 |
| Flanking and grenades | off | on |

- **Attack tokens:** a shared pool limits how many enemies attack the player at once; the rest reposition or posture. This one knob fixes most "unfair dogpile" complaints.
- Telegraph big attacks (wind-up animation, sound) so the player can respond.
- Rubber-banding (secretly boosting a losing AI) feels bad when players notice it. If used, keep it small and invisible.

## Verify

- Draw the current state or active BT branch, the path, the perception cone and the utility scores above each agent while tuning. Most AI bugs are obvious on screen.
- Log transitions, not ticks.
- Seed any randomness per agent so a misbehaving agent can be replayed.
- Done means: each agent reaches its goals, recovers from being blocked, and never oscillates between two states for more than a moment.

## Pitfalls

- **Pathfinding every frame** for every agent. Recompute on a timer or on goal-cell change; budget searches per frame.
- **Steering straight to the goal** instead of the next waypoint: agents hug walls and catch on corners.
- **An inadmissible A* heuristic** (Manhattan on an 8-way grid, a scaled Euclidean) returns fast, non-shortest paths.
- **A multi-frame BT action that never returns RUNNING**: the tree restarts the walk or animation every tick.
- **No stuck check.** If progress toward the waypoint stalls for about a second, repath or change state, or agents grind into walls forever.
- **Ticking every agent's brain every frame.** Decide at 5 to 15 Hz, stagger agents across frames, and slow distant agents further.
- **Decision code that writes position directly**, fighting the movement controller and physics. Output an intent; let the motor apply it.
- **Utility flip-flop** on near-ties. Give the running action a small inertia bonus.

## Related skills

- `godot` (navigation reference), `godot-addons` (beehave, LimboAI): engine and addon APIs.
- `game-architecture`: state machines for non-AI game state, event buses, data-driven design.
- `game-genres`: genre AI expectations (roguelike monsters, FPS enemy states, tower-defense lanes, card-game opponents).
- `game-performance`: profiling when AI shows up in the frame budget.
- `level-design`: the generated or authored spaces agents navigate.

Adapted from awesome-gamedev-agent-skills (`game-ai`, `ai-behavior-trees-utility-ai`), Apache-2.0; see NOTICE.
