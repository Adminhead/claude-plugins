# Balancing

How to model and tune numbers: curves, stat and damage formulas, difficulty, and wave or encounter scaling. Engine-neutral pseudocode. Every number here is a starting point to test, not a law.

## Contents

1. Balance procedure
2. Curve families
3. Progression and leveling
4. Stats, modifiers and damage
5. Cost curves and dominant options
6. Difficulty and encounter scaling
7. Simulation template
8. Sources

## 1. Balance procedure

1. **State the target in player terms.** "A first-time player reaches level 10 in about 2 hours", "a boss fight lasts 60 to 90 s", "a lane holds if the player spent 80% of income well".
2. **Pick the model.** Write the formula or curve that should hit the target, with every constant named.
3. **Simulate.** Run the model across the whole game and across player profiles (weak, average, strong). Plot it. Look at the worst 10% of runs, not the mean.
4. **Move numbers to data.** One table per system, read by the game, editable without a code change.
5. **Playtest and compare.** Log the same quantities in play (time to level, fight length, deaths per encounter) and compare against the model. Change one knob at a time and record each change in the decision log.

Done when the model, the data and the playtest measurements agree within the tolerance you set in step 1.

## 2. Curve families

| Family | Form | Feel | Use for |
|---|---|---|---|
| Linear | `a + b*n` | Steady, predictable | Small ranges, costs in short games |
| Polynomial | `a * n^k` (k about 1.5 to 2.5) | Fast early, slower late, stays readable | XP curves, most cost curves |
| Exponential | `a * r^n` (r about 1.1 to 1.5) | Runs away; numbers explode | Idle games, wave HP with a matching income curve, anything with a prestige reset |
| Logarithmic or diminishing | `a * log(1 + n)` or `x / (x + K)` | Big early gains, flattening | Stat soft caps, armour mitigation, upgrade returns |
| S-curve (logistic) | `L / (1 + e^(-k(n - n0)))` | Slow start, ramp, plateau | Skill-based unlock pacing, adoption-like progress |

Rules: pair curves that must stay in balance (enemy HP against player DPS, prices against income) and plot them together; cap or reset any exponential.

## 3. Progression and leveling

```text
xp_to_next(level):
    linear:      base * level
    quadratic:   base * level^2            # classic RPG shape
    exponential: base * growth^level       # growth 1.2 to 1.5; needs a level cap
```

- Keep early levels fast (minutes each) and stretch later ones; telegraph the next unlock so the player is pulled forward.
- Check time-to-level, not XP-to-level: divide by the expected XP per minute at that stage. If XP income also grows, the felt pace is the ratio of the two curves.
- Grant new options (abilities, verbs) at milestones, not only bigger numbers.

## 4. Stats, modifiers and damage

Keep base attributes as the only stored truth, derive combat stats each time, and keep modifiers in their own list so buffs and gear are reversible.

```text
derive(base, modifiers):
    s = base
    s += sum(flat modifiers)
    s *= 1 + sum(additive percent modifiers)      # +10% and +20% make +30%
    s *= product(multiplicative modifiers)        # use sparingly; they compound
    return clamp(s, min, max)
# Equip pushes a modifier; unequip removes the same one. Never edit the base for a buff.
```

Damage formula families; pick one and stay consistent:

```text
# Subtractive: simple and tactical at small numbers; high defence can make hits trivial
damage = max(1, attack - defence)

# Ratio (diminishing mitigation): scales smoothly to large numbers
mitigation = defence / (defence + K)        # K about 100; at defence = K, half damage
damage = attack * (1 - mitigation)

# Then: variance (about +/-10%), crit multiplier (about 1.5x to 2x), type multiplier (0.5 / 1 / 2)
```

Check time-to-kill (TTK) tables across matchups: rows are attacker builds, columns are targets, cells are seconds or hits to kill. Outliers in that table are the balance bugs.

## 5. Cost curves and dominant options

- Give every option a cost and a benefit on the same scale (gold, time, risk). Plot benefit against cost; options well above the line are dominant and options well below are traps.
- Use intransitive relationships (rock, paper, scissors) or situational strengths so no single option wins everywhere.
- Diminishing returns on stacking one stat stop single-stat builds.
- When many options exist, test with a script that searches for the best build under the model; if one build wins by a wide margin, the model has a dominant strategy.

## 6. Difficulty and encounter scaling

- Target a band, not a point: early encounters should be beaten on the first or second try by most first-time players; later ones may take several. Use playtest death and retry counts, not designer runs.
- Pacing: alternate pressure (hard, breather, spike), never a monotonic ramp.
- Wave or encounter scaling: geometric HP growth of about 1.1 to 1.2 per wave against a roughly linear income curve forces upgrades. If HP grows slower than player DPS, the game trivialises; faster, it walls.
- "Can this hold?" check for defence games: `damage_dealt = dps * (1 - armour) * time_in_range`; the sum across covering towers must reach each enemy's HP, allowing for how many enemies share the range at once.
- Mix enemy types so one build can't answer everything (fast, armoured, flying, swarm, boss).
- Telegraph spikes one encounter ahead so the counter feels fair.
- Offer difficulty options and assists rather than a single tuned curve (see `game-ui`'s accessibility reference).

## 7. Simulation template

A short script beats a spreadsheet once there is randomness or more than two interacting curves. Seed it, run many trials, and print percentiles.

```python
import random, statistics

def simulate_run(rng, params):
    """Return the measured quantity for one simulated play-through, e.g. minutes to reach level 10."""
    level, xp, minutes = 1, 0, 0
    while level < 10:
        minutes += 1
        xp += rng.gauss(params["xp_per_min"] * level ** 0.5, 5)
        while xp >= params["base"] * level ** 2:
            xp -= params["base"] * level ** 2
            level += 1
    return minutes

rng = random.Random(1234)
results = sorted(simulate_run(rng, {"xp_per_min": 40, "base": 100}) for _ in range(10_000))
p = lambda q: results[int(q * (len(results) - 1))]
print(f"median {statistics.median(results)}  p10 {p(0.10)}  p90 {p(0.90)}")
```

Compare the printed percentiles against the target from step 1, adjust one constant, and rerun.

## 8. Sources

- Ian Schreiber and Brenda Romero, *Game Balance*, CRC Press, 2021 (curves, cost curves, transitive and intransitive mechanics, progression).
- Ian Schreiber, "Game Balance Concepts" online course, 2010 (gamebalanceconcepts.wordpress.com).
- Ernest Adams and Joris Dormans, *Game Mechanics: Advanced Game Design*, New Riders, 2012 (feedback loops, dynamic balance).
- Sid Meier, "Interesting Decisions", GDC 2012.
- Stat, damage, leveling and tower-defence scaling patterns adapted from awesome-gamedev-agent-skills `genres/rpg` and `genres/tower-defense` (Apache-2.0); see the plugin NOTICE.
