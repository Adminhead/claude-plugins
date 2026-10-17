# Economy and loot

Sources and sinks, prices, and drop tables. Engine-neutral pseudocode.

## Contents

1. Economy procedure
2. Sources, sinks and converters
3. Prices and income
4. Loot and drop tables
5. Streak control: shuffle bags and pity
6. Checks before shipping
7. Sources

## 1. Economy procedure

1. **List every resource** (currencies, materials, XP, items, energy, time) and mark each as hard currency, soft currency, or consumable.
2. **Map flows.** For each resource, draw where it enters (faucets), where it leaves (sinks), and what turns it into something else (converters, traders). Adams and Dormans' internal-economy diagrams (sources, drains, converters, traders, pools) are a good notation; a plain table works too.
3. **Estimate rates per hour of play** at three stages (early, mid, late) and for three player types (casual, average, grinder).
4. **Simulate** the net balance over time (section 7 of `balancing.md` has a script template). The pool of each soft currency should rise and fall around a target, not climb forever.
5. **Set prices from income, not intuition** (section 3).
6. **Tune from playtest telemetry**: currency held over time, time between purchases, items never bought.

## 2. Sources, sinks and converters

| Kind | Examples | Watch for |
|---|---|---|
| Faucet (source) | Kill bounty, quest reward, loot, daily login, selling items | Farmable loops that pay faster than intended |
| Sink (drain) | Shop purchases, upgrades, repairs, crafting costs, fees, consumables | Sinks that feel like punishment (repair costs) |
| Converter | Crafting, refining, trading a material for gear | Arbitrage loops that create value from nothing |
| Pool | Wallet, inventory, stash | Unbounded accumulation (inflation) |

Rules:

- Every faucet needs a matching sink that players want to use, ideally one that buys new options (cosmetics, upgrades, convenience) rather than recovering losses.
- Recurring sinks (consumables, upgrade tiers) keep late-game currency meaningful; one-off sinks get exhausted.
- Close every buy-sell loop: selling for less than buying (typically 25% to 70% of the price) stops infinite money.
- Leaks or failures should cost something (a defence game where leaks cost lives and bounty), so failure is never the optimal play.

## 3. Prices and income

- Price in hours of play: `price = income_per_hour_at_stage * hours_the_item_should_take`. Recheck when income changes.
- Keep the player almost able to afford the next meaningful thing. Too rich and choices stop mattering; too poor and the game turns into grinding.
- Upgrade tiers usually follow a polynomial or exponential cost curve matched to the income curve; plot both together.
- Interest or banking mechanics reward saving but snowball; cap them.
- With real-money currency, keep soft and hard currencies separate, show prices in real money where the platform requires it, and check platform and regional rules on randomised paid items before adding them.

## 4. Loot and drop tables

A drop table is a list of entries with relative weights. Weights don't need to sum to 100.

```text
weighted_pick(rng, table):              # table: list of (entry, weight)
    total = sum(weight for entry, weight in table)
    roll = rng.uniform(0, total)
    upto = 0
    for entry, weight in table:
        upto += weight
        if roll < upto: return entry
    return table[-1].entry                # float-safety fallback

goblin = [("nothing", 60), ("gold_small", 25), ("healing_potion", 10), ("rare_scroll", 5)]
```

Design guidance:

- Keep "nothing" or common as the bulk of the weight so rares stay exciting.
- Nest tables: a roll on a rarity table picks a sub-table, which picks the item. Designers then tune rarity once, not per item.
- Scale by depth or level: add depth-gated entries, or multiply rare weights by a depth factor, instead of rewriting the table per level.
- Guarantee key drops (quest items, first-clear rewards) outside the random table.
- Put tables in data files, with an id per entry, so they can be tuned and logged.
- Probability of at least one rare in n tries is `1 - (1 - p)^n`. With p = 5%, a player needs about 45 tries for a 90% chance (`ln(0.1) / ln(0.95)` ≈ 45). Show that number in the review.

## 5. Streak control: shuffle bags and pity

Independent random rolls produce streaks. Where streaks hurt, use one of these, and keep them on the seeded RNG so drop sequences reproduce:

- **Shuffle bag (deck):** fill a bag with entries in proportion to their weights, shuffle, draw without replacement, refill when empty. Guarantees the exact rate over each bag.
- **Pity counter:** count rolls since the last rare; past a threshold, raise the rare's chance step by step or force it. Reset the counter on a rare.
- **Pseudo-random distribution:** start the chance low and raise it by a constant after each miss, resetting on a hit, so the average rate holds with fewer streaks.

Tell players about pity or guarantee rules where it matters for trust, and follow platform and regional disclosure rules for paid randomised items.

## 6. Checks before shipping

- [ ] Every resource has at least one desirable sink.
- [ ] No buy-sell or craft-sell loop creates value.
- [ ] Simulated currency held after 20 hours is within the planned band for each player type.
- [ ] The unlucky tail (p90 tries for each key drop) is acceptable.
- [ ] Prices, weights and rates live in data files with ids, and telemetry logs drops and purchases (see `game-playtest`'s telemetry reference).

## 7. Sources

- Ernest Adams and Joris Dormans, *Game Mechanics: Advanced Game Design*, New Riders, 2012 (internal economy, sources, drains, converters, traders, Machinations diagrams).
- Ian Schreiber and Brenda Romero, *Game Balance*, CRC Press, 2021 (economies, probability, pseudorandomness).
- Weighted-table, shuffle-bag, pity and tower-defence economy patterns adapted from awesome-gamedev-agent-skills `disciplines/procedural-gen`, `genres/roguelike` and `genres/tower-defense` (Apache-2.0); see the plugin NOTICE.
