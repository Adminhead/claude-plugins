# Utility AI

Contents: the pipeline, response curves, considerations, combining scores, selection, the hybrid BT leaf, a needs example, cost.

Utility AI scores every candidate action from 0 to 1 and runs the best. Use it for graded trade-offs (which target, which ability, which need to satisfy). It is harder to debug than a tree, so pair it with an on-screen score display from day one.

## The pipeline

```text
for each action:
    for each consideration: fact -> normalize to 0..1 -> response curve -> 0..1
    score = weight * combine(consideration outputs)
select one action (argmax with hysteresis, or softmax for variety)
```

Golden rule: **every consideration returns 0..1.** A consideration returning 0..100 next to 0..1 ones dominates and makes the weights meaningless.

## Response curves

`t` is the fact normalized to 0..1 first: `t = clamp((x - a) / (b - a), 0, 1)` (with `a > b` for "lower is better", for example distance 20 m maps to 0 and 2 m maps to 1).

| Curve | Formula | Use for |
| --- | --- | --- |
| Linear | `clamp(m*t + c)` | proportional want |
| Quadratic | `t^2` (or `t^k`, k > 1) | only matters near the top (very tired) |
| Inverse quadratic | `1 - (1-t)^2` | rises fast, then flattens |
| Exponential | `(e^(k t) - 1) / (e^k - 1)` | sharp near the extreme |
| Logistic | `1 / (1 + e^(-k (t - mid)))` | soft threshold (flee below about 40% health) |
| Smoothstep | `t*t*(3 - 2t)` | eased default with flat ends |

Invert any curve with `1 - f(t)` (desire to heal rises as health falls). Clamp every output.

## Considerations

A consideration binds one fact reader to one curve, holds no per-tick state, and is built once and shared across agents.

```text
proximity = Consideration(fact = normalize(dist_to_player, 20, 2), curve = smoothstep)
my_health = Consideration(fact = health01,                        curve = logistic(k=8, mid=0.35))
```

## Combining

Multiplying considerations lets any single zero veto the action, which is usually right ("no ammo" vetoes "shoot"). Raw products sink as you add considerations, so apply the compensation factor (Dave Mark, *Behavioral Mathematics for Game AI*):

```text
product     = multiply all n consideration outputs
mod         = 1 - 1/n
compensated = product + (1 - product) * mod * product
score       = weight * clamp(compensated)
```

A weighted sum is simpler but no single factor can veto; use it only when that is the intent.

## Selection

- **Argmax with hysteresis:** add a small inertia bonus (0.05 to 0.1) to the currently running action so the agent commits instead of flip-flopping on near-ties.
- **Softmax:** pick with probability proportional to `exp(score / temperature)`. Low temperature (about 0.1 to 0.2) gives variety without dumb picks.
- **Weighted random over the top N:** drop everything below, say, 80% of the best score, then roll among the rest.
- Seed the random source per agent so a bad decision can be replayed.

## Hybrid: a BT leaf that picks by utility

The default for combat: the behavior tree decides engage versus disengage versus patrol; inside the engage branch, a utility leaf decides which attack or target.

```text
UtilitySelectorLeaf.tick(bb, dt):
    choice = evaluator.select_best(bb, inertia = 0.05)
    if choice != running: if running: running.behavior.reset(); running = choice
    return running.behavior.tick(bb, dt) if running else FAILURE

UtilitySelectorLeaf.reset(): if running: running.behavior.reset(); running = none
```

Keep the utility set small and local to the branch. Avoid the inverse (utility choosing between whole trees) unless top-level behavior really is graded; it thrashes and is hard to debug.

## Needs example (villager)

| Action | Weight | Considerations |
| --- | --- | --- |
| Eat | 1.2 | hunger (logistic, mid 0.5), has food (linear) |
| Sleep | 1.0 | fatigue (quadratic), is night (smoothstep) |
| Socialize | 0.8 | loneliness (linear), friends nearby (smoothstep) |
| Work | 0.7 | daytime (smoothstep), 1 - fatigue (linear) |

Tune by watching score bars over a simulated day: each action should win in the situations you expect, and no action should sit at 1.0 all the time (a sign of an un-normalized fact).

## Cost

- Cost is actions times considerations per decision. Put a cheap gate consideration first and stop scoring an action as soon as one factor hits 0.
- Re-score only when a relevant fact changed, or at the decision cadence (5 to 10 Hz), never per frame.
- Most utility bugs are a mis-shaped curve or an un-normalized fact; both show up immediately on a live score display.
