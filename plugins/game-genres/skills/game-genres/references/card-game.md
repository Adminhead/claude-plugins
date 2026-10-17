# Card game

Core loop: draw, spend resources to play cards, effects resolve and change the board, end the turn (cleanup, discard), the opponent or next phase acts, repeat until a win condition. Depth comes from combinations; the engine's job is to resolve them unambiguously.

## Core systems (build in this order)

1. **Card data:** id, name, cost, type, rules text, an effect list (data, not code).
2. **Zones:** deck, hand, play or board, discard, exile. A card is in exactly one zone.
3. **Draw, shuffle and reshuffle.**
4. **Turn structure** as a phase machine.
5. **Resources** (mana, energy, actions) that gate plays per turn.
6. **Effect resolution** through a queue or stack, with targeting and triggers.
7. **Win and loss** (life total, deck-out, objective).
8. **UI:** hand layout, drag or tap to play, zone counts, targeting prompts.

## Data model

```text
card   = { id: "fireball", cost: 3, type: "spell", tags: ["fire"],
           effects: [ { op: "damage", amount: 6, target: "chosen_enemy" } ] }
zones  = { deck: [instance], hand: [...], board: [...], discard: [...], exile: [...] }
instance = { uid, card_id, modifiers: [...], owner }      # definitions are shared, instances are not
```

- A small vocabulary of effect ops (`damage`, `heal`, `draw`, `gain_resource`, `summon`, `buff`, `destroy`, `move_zone`) covers most games. Add an op only when several cards need it.
- Keywords (taunt, lifesteal, poison, shield) are implemented once, as a modifier or trigger, and tagged onto cards.
- Card definitions are read-only; runtime changes (buffs, cost reductions) live on the instance.

## Rules that keep it correct

```text
draw(n): repeat n times:
    if deck empty:
        if discard empty: on_deck_out(); return      # lose, or take fatigue damage
        deck += discard; discard = []; shuffle(deck, rng)
    hand.append(deck.pop())
```

- **Moving a card** is remove-from-zone then add-to-zone in one function. Assert no uid appears in two zones.
- **Shuffle** with Fisher-Yates and the seeded run RNG. "Sort by random" is biased.
- **Playing is atomic:** validate cost and legal targets first, then pay and commit. A cancelled play leaves every zone exactly as it was.
- **Resolution order:** choose a queue (FIFO, intuitive) or a stack (LIFO, how TCGs model responses: the last thing played resolves first) and document it. Triggers push onto the same structure.
- **Simultaneous triggers** resolve in a fixed order (active player first, then by timestamp) so outcomes are reproducible.
- **Targets** are re-validated at resolution; a target that died or left its zone makes the effect fizzle by a defined rule.
- **Phases:** fixed phases (start, draw, main, combat, end) give triggers clean timing windows. End of turn: discard to hand limit, clear temporary effects.

## Feel targets

- A played card animates from hand to its destination and its effect is visible before the next one starts; queue presentation behind resolution, never the reverse.
- Playable cards are highlighted; unaffordable ones are dimmed. Hovering shows full text and computed numbers (damage after buffs).
- Targeting shows valid targets and an arrow from card to target; right-click or Escape cancels.
- Deck and discard counts always visible; inspecting the discard pile is allowed.

## Balancing norms

| Knob | Norm |
| --- | --- |
| Starting hand / draw per turn | Slay the Spire-style deckbuilders: 5 cards per turn, 3 energy. TCGs: 7-card opening hand, 1 draw per turn. More draw means less variance. |
| Hand limit | discard down at end of turn, or cap draws, to stop hoarding |
| Deck size | smaller decks are more consistent; constructed formats set a minimum |
| Resource curve | cheap cards early, expensive payoffs later; a deck's cost distribution decides whether it can act early |
| Power budget | each point of cost buys a predictable amount of effect; rares may bend the rate, not break it |
| Answers | every threat archetype needs removal or a counter in the card pool |
| Deckbuilder growth | card removal is as valuable as card adds; thinning the deck is a core decision |

Deckbuilder versus constructed: a constructed deck is built before play from a collection; a deckbuilder's deck is the run's build, changed by drafting, buying and removing cards. In a roguelike deckbuilder, read `roguelike.md` too and keep run state apart from any meta collection.

Perceived fairness: true-random shuffles feel streaky. Some games bound streaks (for example, guarantee a resource card in the opening hand). Decide on purpose and account for it in balance math.

## Pitfalls

- A card in two zones at once: duplication and loss bugs.
- No reshuffle or undefined deck-out: draws fail silently or crash.
- One function per card: untestable and unmaintainable.
- Ambiguous trigger order: nondeterministic outcomes that players can't learn.
- Unseeded shuffle in a game with replays, undo or daily runs.
- Targeting state leaking after a cancelled play.
- Mutating card definitions instead of instances: a buff applies to every copy.
- Opponent AI that evaluates every permutation: score each playable card greedily (or with shallow lookahead) and pick the best (`game-ai`, utility AI).

## Engine pointers

- Cards as data resources and the hand UI (containers, drag and drop): `godot` (resources and UI references).
- Event bus for triggers and state machines for phases: `game-architecture`.
- Card movement juice: `game-feel`.
