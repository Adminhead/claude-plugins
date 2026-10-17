# GDD templates

Copy the template that fits, fill every field, and mark guesses with `(guess)` so a playtest can test them. Keep the one-pager to one screen.

## Contents

1. One-page pitch
2. Living GDD outline
3. Core loop worksheet
4. Mechanic spec
5. Decision log
6. Scope cut list
7. Sources

## 1. One-page pitch

```markdown
# <Title>

**One line:** <genre> where the player <core verb> to <goal>, unlike <comparable> because <hook>.

**Player fantasy:** <who the player gets to be and how it feels, in one sentence>

**Pillars** (3 to 5; each must be able to reject a feature)
1. <experience statement>
2. ...

**Core loop:** <verb> -> <feedback> -> <reward> -> <growth> -> <harder challenge> -> <verb>

**Session:** <typical session length and what a session ends on>

**Audience and platform:** <who, where, input device>

**Comparables:** <2 or 3 games and what we take or avoid from each>

**Scope:** <team, time, content count: levels, enemies, items>

**Biggest risk:** <the question a prototype must answer first>
```

## 2. Living GDD outline

One page per system, added only when someone needs it. Each page starts with its owner and last-updated date.

1. Overview: the one-page pitch, kept current.
2. Pillars and design principles, with examples of features each one rejected.
3. Core loop, session loop, meta loop (section 3).
4. Systems: one mechanic spec per system (section 4).
5. Progression: what unlocks when, the power curve, the content gates (see `balancing.md`).
6. Economy: sources and sinks map and prices (see `economy.md`).
7. Content list: levels, enemies, items, with counts and status.
8. Controls and UI flow: input map and screen list (UI detail goes to the `game-ui` skill).
9. Audio and art direction: one paragraph each plus references.
10. Decision log (section 5) and open questions.

## 3. Core loop worksheet

For each loop, fill one row per step.

| Loop | Step | Player decision | Feedback the player sees | Output feeding the next step |
|---|---|---|---|---|
| Moment (seconds) | | | | |
| Session (minutes) | | | | |
| Meta (days) | | | | |

Checks:

- Every step has a decision or a clear reason to exist.
- Every step has visible feedback within about a second for moment loops.
- The session loop ends on a natural stopping point and a reason to return.
- The meta loop feeds new choices back into the moment loop (new verbs, not only bigger numbers).
- Using the MDA lens (Hunicke, LeBlanc and Zubek): name the aesthetic (the feeling) each loop targets, then check the mechanics produce the dynamics that create it.

## 4. Mechanic spec

```markdown
## <Mechanic name>

**Intent:** what the player is trying to do, and which pillar this serves.
**Inputs:** buttons or actions, including hold, tap and combo rules.
**Rules:** numbered, testable statements. "Dash moves 4 m over 0.15 s and grants invulnerability for its duration."
**States:** list and transitions (idle, active, cooldown, disabled), with what triggers each.
**Tunables:** table of name, starting value, unit, range, and what changing it does.
**Feedback:** visual, audio and haptic response for start, success, failure and cooldown ready.
**Failure and edge cases:** what happens when interrupted, at zero resources, against walls, in multiplayer.
**Interactions:** with each other system (stacking, priority, exploits found so far).
**Accessibility:** hold-to-toggle, timing windows, colour or sound cues (see `game-ui` accessibility reference).
**Open questions:** each with the playtest that will answer it.
```

Tunables table:

| Name | Start | Unit | Range | Effect of raising it |
|---|---|---|---|---|
| dash_distance | 4 | m | 2 to 6 | Easier escapes, harder precision |

## 5. Decision log

| Date | Decision | Why | Revisit if |
|---|---|---|---|
| | | | |

## 6. Scope cut list

| Feature | Pillar served | Cost (days) | Risk | Priority (must, should, could, won't) |
|---|---|---|---|---|

Cut from the bottom until the must list fits the schedule with about a quarter of the time spare for polish and bugs. A feature that serves no pillar is a "won't" unless it is required by the platform.

## 7. Sources

- Tracy Fullerton, *Game Design Workshop: A Playcentric Approach to Creating Innovative Games*, 4th ed., CRC Press, 2018 (formal elements, one-sheet and design documents).
- Jesse Schell, *The Art of Game Design: A Book of Lenses*, 3rd ed., CRC Press, 2019 (lenses as review questions).
- Robin Hunicke, Marc LeBlanc and Robert Zubek, "MDA: A Formal Approach to Game Design and Game Research", AAAI Workshop on Challenges in Game AI, 2004.
- Scott Rogers, *Level Up! The Guide to Great Video Game Design*, 2nd ed., Wiley, 2014 (one-sheet and ten-page documents).
