---
name: game-prototype
description: "Timeboxed game prototyping: a greybox mechanic spike or vertical slice that answers one question with keep or kill criteria, and game-jam planning (scope to the clock, hour schedule, cut list, submit early). Use when prototyping a mechanic, greyboxing, or planning a jam or 48-hour build."
---

# Game prototype

A game prototype exists to produce a decision (keep, kill or retune), not a product. Two modes share one discipline: **spike** (no deadline beyond a timebox, answers "is this fun?") and **jam** (a fixed external deadline and a submission). Pick the mode first; if the user names a jam, a weekend or a submission, it is jam mode.

Adapted from awesome-gamedev-agent-skills `prototype-fast` and `game-jam` (Apache-2.0, Copyright 2026 Abhishek Barali and contributors); see LICENSE and NOTICE.

Not for web UI or state-model prototypes (`prototype`), the production build of a validated mechanic (the engine skill, such as `godot`), design documents and balancing (`game-design`), juice and camera feel (`game-feel`), structured playtest sessions (`game-playtest`), or uploading a build (`game-publish`). Use each one if installed.

## Spike mode

1. **Write the one question.** One binary-ish question per prototype ("Is grappling while falling satisfying to control?"). Two questions means two prototypes.
2. **Decide throwaway or keep before writing code.** Default to throwaway: hard-coded values, one file is fine, deleted afterwards. "Keep" only means folders and names that can grow; it is still rough.
3. **Set a hard timebox:** 30 to 90 minutes for a mechanic, one sitting for a vertical slice. Stop when it ends, finished or not.
4. **Greybox everything except the core verb.** Boxes, capsules and circles for art; built-in font; one debug sound or none. Menus, saves, inventory and settings are stubs or absent.
5. **Instrument for the question.** Put the numbers you are judging on screen (speed, jump height, timing window, distance). Expose tuning values as constants or debug sliders at the top of the file.
6. **Playtest at once.** Play it, then give it to one other person without explaining the controls and watch where they stall.
7. **Call it against the written criteria** (below). Record the verdict and the tuned numbers.

Fill this brief in at the top of the prototype file before coding:

```text
QUESTION:   the one thing this must prove
CORE VERB:  the action the player repeats
THROWAWAY:  yes (hard-code, delete after) | no (minimal structure)
TIMEBOX:    e.g. 60 min, stop when it ends
KEEP IF:    observable signal (see below)
KILL IF:    observable signal (see below)
```

Keep, kill or retune, judged with placeholder art:

- **Keep** when a fresh player does the core verb on purpose within about 30 seconds, unprompted, and someone replays the loop without being asked.
- **Kill** when the verb only feels good after you explain it, making it fun needs systems far beyond the prototype, or you catch yourself adding art or levels to avoid admitting the verb is flat.
- **Retune** when one variable is clearly off (too slow, window too tight). Change that one value, retest, and narrow the question if it still fails.

Containment: build the spike outside the shipping code (`prototypes/<idea>/`, a separate project, or a throwaway branch) and never import it from the main game. A keep authorizes a **rewrite** in the real project, carrying over the tuned numbers and the lesson, not the code.

## Jam mode

1. **Read the rules before the theme drops:** length, theme reveal time, deadline with timezone, team size, whether pre-made assets, engines and templates are allowed, and whether rating other entries is required.
2. **Prep the boring parts in advance** where the rules allow: an empty project that exports, input and title or end screen stubs, an export run once end to end, and licensed font and SFX sources.
3. **Theme to one sentence.** Ten ideas in 15 minutes, then commit to one that fits "You [verb] to [goal] while [constraint]." If it needs a second sentence it is too big.
4. **Scope to the clock** with the budget table below: one core mechanic and one hook. Everything else is a stretch goal.
5. **Vertical slice first:** a 30-second start, play, win or lose, restart loop running early. A complete tiny loop beats half of a big one.
6. **Reserve the last 20 % for shipping:** export, test the build from a clean path, screenshots, the page text.
7. **Submit early, then update.** Upload a working build hours before the deadline; most jam pages allow swapping the file until close. On itch.io, attach the game to the jam's submission form; uploading to your own page does not enter it.

| | 48-hour jam | 72-hour jam | 1-week jam |
| --- | --- | --- | --- |
| Core mechanics | 1, playable by hour 6 | 1 or 2 | 2 or 3 interacting |
| Content | 1 level or one generated space | 3 to 5 levels | 8 to 12 plus progression |
| Art | placeholder, one palette | one cohesive set | themed set plus UI |
| Audio | 3 to 5 SFX, 1 loop | SFX, 1 or 2 tracks | adaptive music |
| Ship buffer | last 8 to 10 hours | last 12 to 16 hours | last full day |

A 48-hour schedule to adapt:

```text
H0-2    ideate, lock the one-sentence concept, name win and lose
H2-8    core loop with primitives; playable, no art
H8-12   sleep
H12-24  one level or encounter, tune difficulty, add the hook
H24-30  sleep, one outside playtest, cut what isn't landing
H30-38  art and audio pass, juice (shake, hit-stop, tweens, particles)
H38-44  feature freeze: fix crashes and soft-locks only
H44-48  export, clean-path test, screenshots, page, submit by ~H46
```

Feature triage, asked in order for every idea: does the loop work without it (then it is a stretch goal); would a player notice it missing (if not, cut it); is it under 30 minutes of work (if not, defer past the ship buffer). Under deadline pressure the default answer is cut.

Pre-submit check, on an extracted copy:

- [ ] Runs from the extracted zip on a machine or path without the engine installed.
- [ ] Controls shown on screen or on the page.
- [ ] No soft-lock; restart works; no error spam in the log.
- [ ] Web build set to playable in browser on the host page.
- [ ] Page has a one-line pitch, controls, screenshots, credits and asset licenses.
- [ ] Submission attached to the jam, not only to your page.

## Gotchas

- **Polish hides a flat verb.** Juice multiplies fun that is already there; it cannot create it. Greybox until the verb is proven.
- **No written kill criterion means nothing ever gets killed.** Write it before you are attached.
- **The spike becomes the product.** Prototype code carries prototype assumptions; rewrite on keep.
- **Self-testing only.** You know the controls and the intent. One uncoached player beats an hour of self-play.
- **Untested export.** "Works in the editor" is not "works in the build"; missing assets and wrong working directories show up only in the export. Export once in hour one of a jam.
- **Unlicensed assets** can break jam rules and any later release. Use licensed sources and list them in the credits.
