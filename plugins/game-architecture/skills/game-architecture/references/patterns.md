# Game architecture patterns

Engine-neutral pseudocode. For the Godot versions (node-based state machines, signals, autoload buses, resources), see the `godot` skill if installed.

## Contents

1. Fixed-step loop with interpolation
2. State machine shapes
3. Event bus
4. Object pool
5. Inventory
6. Abilities, effects and stat modifiers

## 1. Fixed-step loop with interpolation

Engines run this loop for you; knowing it explains their settings.

```text
FIXED_DT = 1 / 60; MAX_STEPS = 5; acc = 0
frame(render_dt):
    acc += min(render_dt, FIXED_DT * MAX_STEPS)   # clamp hitches and breakpoints
    steps = 0
    while acc >= FIXED_DT and steps < MAX_STEPS:
        prev = curr
        curr = simulate(curr, FIXED_DT)            # all gameplay uses the fixed dt
        acc -= FIXED_DT; steps += 1
    alpha = acc / FIXED_DT
    render(lerp(prev, curr, alpha))                # slerp rotations
```

- Zero, one or several steps per frame are all normal.
- Interpolation adds up to one step of latency and removes stutter. Prefer the engine's built-in interpolation, and reset it after teleports.
- Substeps (several smaller steps inside one fixed step) help very fast or stiff simulations, at CPU cost.

## 2. State machine shapes

**Object per state.** Each state has `enter`, `exit`, `update(dt)`, `physics_update(dt)` and `handle_input(event)`. The update methods return the next state's name, or nothing to stay. The machine owns the transition:

```text
machine.tick(dt):
    next = current.update(dt)
    if next: transition(next)

transition(name):
    if transitioning: queued = name; return      # no recursion from enter()
    transitioning = true
    current.exit(); current = states[name]; current.enter()
    transitioning = false
    if queued: n = queued; queued = null; transition(n)
```

**Hierarchical.** A state can own a child machine. The parent forwards update and input to the child only while it's active. On parent `enter`, the child enters its initial state; on parent `exit`, the child exits its current state first. A transition the child doesn't handle bubbles up to the parent (for example "took damage" leaves the whole grounded group). The common bug is a child machine that initialises itself and keeps handling input while its parent is inactive.

**Parallel.** Several machines tick side by side on the same entity: movement (idle, walk, run, jump, fall), combat (none, attack, block, dodge), and animation, which reads the other two and writes nothing back. Each field has exactly one owning machine.

**Data-driven.** States are data entries (name, animation, speed, allowed transitions) that designers edit. The runtime validates transitions against the allowed list. Behaviour still lives in code, keyed by state type.

Upgrade signals: enter or exit logic duplicated across branches; flags such as `is_attacking and not is_stunned` creeping into every state; transitions added "from anywhere" to many states (a sign a parent state is missing).

## 3. Event bus

- One global bus of typed events (`player_died(cause)`, `item_collected(id, qty)`) for systems that shouldn't know each other: UI, audio, achievements, analytics.
- Name events in the past tense, for facts that already happened. A bus carrying commands ("open_door") hides control flow.
- Don't route parent-to-child calls or replies through the bus. If the sender needs an answer, call the receiver directly.
- Listeners disconnect when they're freed or pooled. A freed listener that's still connected crashes or leaks, depending on the engine.
- Don't emit from inside a listener for the same event in a way that recurses. Defer the emit to the end of the frame if needed.
- Keep a debug switch that logs every emit with its arguments.

## 4. Object pool

```text
Pool(create, reset, cap):
    free = []
    prewarm(n): repeat n: free.push(deactivate(create()))   # at load, not mid-fight
    acquire():
        obj = free.pop() or (create() if live < cap else recycle_oldest())
        obj.generation += 1
        reset(obj); activate(obj)                             # reset on ACQUIRE
        return obj
    release(obj): deactivate(obj); disconnect_listeners(obj); free.push(obj)

handle = (obj, obj.generation)           # holders check generation before use
```

- Pre-warm at load to avoid first-use hitches.
- Decide the overflow policy: grow, refuse, or recycle the oldest.
- Deactivation stops processing, collision and drawing. Hiding alone leaves the object updating and colliding.
- Pool only what profiling shows is churned often. Pooling everything adds bugs for no gain.

## 5. Inventory

Three decisions shape every inventory. Make them explicitly and say which you picked:

| Decision | Default | Why |
| --- | --- | --- |
| Item definitions | data files (assets) with a stable `id` | editable by designers, shared by reference, saved by `id` |
| Slot containers | plain runtime objects, not assets | slots are runtime state; making them assets invites saving stale item copies |
| `add_item(item, qty)` returns | the leftover count | partial adds are the common case (stack caps, full bag); a boolean forces the caller to re-query |

If the game needs a weight-based bag, a grid with shaped items or an unlimited list, say so before building; the fixed slot array is the wrong skeleton for all three. Genre-specific inventories (crafting, grid shapes) are covered in `game-genres`.

Rules:

- **Two passes to add:** fill existing stacks of the same item first, then empty slots. A single pass scatters one item across slots and reports the bag full while space remains.
- **One change event per operation**, after both passes, not one per slot touched. The UI re-renders once.
- Clear a slot's item when its quantity reaches 0, or the slot never counts as empty again.
- Stacking rules live in data (`max_stack = 1` for equipment and key items), not in branches inside `add_item`.
- Compare items by `id`. Comparing object references breaks as soon as anything duplicates an item at runtime.
- **Save** a list of `{id, qty}` (plus per-instance data such as durability). Load through a registry that maps `id` to definition.
- **Build the registry from an explicit list** (an exported array, a manifest file or a generated index), not by scanning the source folder at runtime. Exported builds often rename, pack or convert asset files, so a directory scan that works in the editor finds nothing in the shipped game.
- An `id` missing from the registry on load (removed in a patch) is dropped or substituted with a log line, never a crash.
- Equipment is a second container keyed by slot type (an enum, not a string). Compute totals from equipped items when asked, rather than caching them.

## 6. Abilities, effects and stat modifiers

Core rule: data in definition files, runtime state in a component on the entity, communication through events.

- **Ability definitions are stateless** (name, cost, cooldown, cast time, required and blocked tags) and shared by every caster. Cooldown timers and charges live in the caster's ability component, keyed by ability `id`.
- **Activation sequence:** check tags, cost and cooldown, then enter a casting state for `cast_time`. Commit at the end of the cast: spend the cost, start the cooldown and apply the effect. An interrupt (stun, moving if the ability requires standing still) cancels the cast with no cost. Decide whether cost is paid at start or at commit, and do it in one place. A `cast_time` field that nothing enforces is a common bug.
- The component emits `activated`, `failed(reason)`, `cooldown_started` and `cooldown_finished`. The HUD listens and never polls.

**Effects (buffs and debuffs)** have a duration (zero or less means instant), an optional tick interval, and `on_apply`, `on_tick` and `on_expire` hooks. An effect holder on the target advances them and removes expired ones after the loop, never while iterating.

Track each active effect by `(effect id, source)` with an explicit stacking policy:

| Policy | Re-applying the same effect |
| --- | --- |
| refresh | resets the duration, keeps one instance |
| stack | adds a stack up to `max_stacks`; duration shared or per stack |
| independent | a separate instance per source |
| replace if stronger | keeps the higher magnitude |

Keying by the definition object alone makes a second application silently reset the first, whatever the design intended.

**Stat modifiers** are keyed by source, so removing a buff removes exactly its modifiers. Compute a stat in a fixed order:

1. `base + sum(ADD)`
2. times `(1 + value)` for each MULTIPLY (so +20% and +10% give 1.32; the order inside this pass doesn't matter). If the design wants additive percentages instead, sum them first: `(1 + 0.2 + 0.1)`. Pick one rule and document it.
3. OVERRIDE, if any, replaces the result (the highest value wins, or the most recent; pick one).
4. Clamp to the stat's minimum and maximum.

Recompute when modifiers change and cache the result. Don't save computed stats; save base values and active effects, then recompute on load.

**Gameplay tags** (`status.stunned`, `immune.fire`) gate abilities through required and blocked tag lists, and effects through an immunity tag. Count tags rather than storing them as a set: two stuns from two sources set the count to 2, and one expiring must not clear the other.
