# Behavior trees

Contents: the contract, node types, memory versus reactive composites, `Reset()`, decorators, the blackboard, a guard tree, cadence and cost, debugging.

Pseudocode is language-neutral. Engine bindings (beehave, LimboAI, Unreal BT assets) have their own skills; the concepts here apply to all of them.

## The contract

Every node's `tick(bb, dt)` returns `SUCCESS`, `FAILURE` or `RUNNING` (needs more ticks). Control flows down from the root; status flows up. The tree's shape is the priority logic: earlier children are higher priority.

Every node also has `reset()`, called when a parent abandons it before it finished. Forgetting `reset()` is the most common BT bug (see below).

## Node types

| Kind | Node | Behavior |
| --- | --- | --- |
| Composite | Sequence | Tick children in order; return the first non-SUCCESS. Logical AND. |
| Composite | Selector (fallback) | Tick children in order; return the first non-FAILURE. Logical OR. |
| Composite | Parallel | Tick all children; resolve by policy (succeed on one or all, fail on one or all). |
| Decorator | Inverter | Swap SUCCESS and FAILURE; pass RUNNING through. |
| Decorator | ForceSuccess | Turn FAILURE into SUCCESS so an optional step doesn't fail its sequence. |
| Decorator | Repeat(n) | Re-run the child n times (or forever), resetting it between runs. |
| Decorator | Cooldown(s) / Timeout(s) | Gate the child to once per interval, or fail it after a time limit. |
| Leaf | Condition | Read the blackboard, return SUCCESS or FAILURE the same tick. No side effects, never RUNNING. |
| Leaf | Action | Do work; return RUNNING until done, then SUCCESS or FAILURE. |

## Memory versus reactive composites

A **memory** composite remembers which child returned RUNNING and resumes there next tick:

```text
Sequence.tick(bb, dt):
    while current < children.size:
        s = children[current].tick(bb, dt)
        if s == RUNNING: return RUNNING            # resume here next tick
        if s == FAILURE: current = 0; return FAILURE
        current += 1
    current = 0; return SUCCESS

Selector.tick: the mirror image - advance on FAILURE, return on SUCCESS or RUNNING.
```

Memory composites are cheap but never re-check earlier children, so a higher-priority branch can't interrupt. A **reactive** composite re-ticks from child 0 every tick and aborts the branch that was running when an earlier child takes over:

```text
ReactiveSelector.tick(bb, dt):
    for i in 0 .. children.size - 1:
        s = children[i].tick(bb, dt)
        if s == FAILURE: continue
        if running != none and running != i: children[running].reset()   # abort the old branch
        running = i if s == RUNNING else none
        return s
    running = none; return FAILURE
```

Use a reactive selector at the root of combat AI. **Trap:** a memory Sequence under a reactive selector resumes at its RUNNING action and skips its own guard condition, so "CanSeePlayer, MoveTo, Attack" keeps chasing after sight is lost. Put guard conditions in a reactive sequence, or as a decorator that re-checks every tick (the "conditional abort" in most BT tools).

Parallel: count child results each tick and apply the policy, for example "attack while strafing" succeeds when the attack succeeds and fails if either fails. Reset the still-running children when it resolves.

## Reset

When a branch is abandoned, `reset()` must walk it: composites clear their resume index and reset children; a `Wait` clears its elapsed time; an action releases what it holds (cover reservation, attack token, animation lock). Symptom of a missing reset: a timed action "finishes instantly" when its branch is re-entered, or a cover point stays reserved forever.

## Decorators worth having

```text
Cooldown(seconds).tick:
    if now < ready_at: return FAILURE
    s = child.tick(bb, dt)
    if s == SUCCESS: ready_at = now + seconds
    return s
```

`now` comes from a clock the tree owns (accumulate the decision dt) so cooldowns pause with the game.

## The blackboard

Per-agent shared memory. Conditions read it, actions and perception write it, no node holds a reference to another node. That is what lets one `MoveTo(key)` action serve chase, patrol and flee.

- Typical keys: `target`, `target_pos`, `last_seen_pos`, `last_seen_time`, `home`, `path`, `alert_level`.
- Hot agents: use a plain struct of typed fields instead of a string-keyed dictionary (no hashing, no boxing). Keep the dictionary form for designer-authored or serialized trees.
- Share read-only config (curves, tuning tables) across agents; only the blackboard and node runtime state are per agent.

## Guard tree

```text
ReactiveSelector
├── Sequence (reactive)          # combat: highest priority
│   ├── Condition: CanSeeTarget
│   ├── Selector
│   │   ├── Condition: InAttackRange
│   │   └── Action: MoveTo(target_pos)
│   └── Cooldown(0.8): Action: Attack
├── Sequence                     # investigate the last-known position
│   ├── Condition: HasLastSeen (and not expired)
│   └── Action: MoveTo(last_seen_pos), then Wait(2), then Clear(last_seen_pos)
└── Action: Patrol(route)        # fallback, always RUNNING
```

## Cadence and cost

- Build the tree once at spawn. Rebuilding it per tick loses RUNNING state and allocates.
- Keep `tick` allocation-free: no new objects, closures or iterator allocations per tick.
- Tick at 5 to 15 Hz from an accumulator, not every frame. Stagger agents into buckets so one bucket thinks per frame, and scale each agent's dt by the bucket count.
- Slow or freeze distant and off-screen agents (AI level of detail).
- The tree walk is rarely the cost; leaves are (raycasts, path queries). Cache perception on the blackboard.
- Keep trees shallow and wide; factor repeated subtrees into named builder functions.

## Debugging

- Highlight the active path and the RUNNING leaf above the agent.
- Log only when the active branch changes.
- When a behavior "never happens", check in order: the guard condition's blackboard key is written, the branch sits above a fallback that always succeeds, the action returns RUNNING while working.
