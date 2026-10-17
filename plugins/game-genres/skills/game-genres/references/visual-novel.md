# Visual novel

Core loop: read a line, advance, make a choice at a branch, the story branches on choices and flags, read on, reach an ending. The "game" is the shape of the branching and whether choices feel consequential; everything else is presentation and reader conveniences. The script engine itself (Ink, Yarn Spinner or a custom runner) is in `dialogue.md`; this file is the VN layer on top.

## Core systems (build in this order)

1. **Branching script** in a dialogue runtime (`dialogue.md`).
2. **Text box:** speaker name, body, typewriter reveal, advance on click or key.
3. **Choices:** gated by flags, recorded when picked.
4. **Characters:** sprites with expressions and poses in position slots, show and hide transitions.
5. **Backgrounds and transitions:** dissolves, fades to black for scene or time changes.
6. **Save anywhere:** many slots, quick save and quick load.
7. **Reader conveniences:** backlog, skip, auto-advance, text speed, hide UI.
8. **Audio:** per-scene music, SFX, optional voice with replay from the backlog.

## Data model

- Script nodes: **line** (speaker, text id, expression, voice clip), **choice** (options with text id, condition, target, flags to set), **command** (show or hide character, background, music, set variable, jump), **label** (named entry point).
- Content (lines, choices, conditions) lives in the script; direction is lightweight commands in the script; rendering of those commands lives in engine code so writers never touch code.
- Story state: booleans for one-off decisions (`helped_npc`), counters for accumulated state (`affection_alice`), all in the dialogue runtime's variable store so they save cleanly.

Save-anywhere record:

```text
save = { version: 1,
         script_position: runtime.serialize_position(),   # knot or node plus line
         variables: { ...all flags and counters },
         seen_lines: [line ids],                           # for skip-read-only and completion %
         backlog: last 100 to 200 lines (optional),
         scene: { background, visible_characters with slot and expression, music },
         thumbnail, timestamp, chapter_name }
```

Ink and Yarn Spinner runtimes can both save and restore their state; use that rather than storing a line index into a file that writers will edit. Keep `version` and a migration path so saves survive script edits.

## Route structures

| Structure | Shape | Writing cost | Use |
| --- | --- | --- | --- |
| Linear (kinetic) | one path | low | story-first works |
| Branch and merge | branches rejoin | medium | most VNs: choices change the trip, not the destination |
| Routes | distinct paths per character or choice | high | dating sims, route-based stories |
| Flag-driven | lines and endings computed from accumulated state | medium | reactive stories, affection systems |

Branch-and-merge gives the feeling of choice at a fraction of the cost. Reserve full routes for the moments that matter (character endings). Every branch multiplies writing, art and QA.

## Feel targets

- Typewriter reveal at a configurable speed, with an instant option. The first advance completes the line; the second advances. Never trap the reader in an unskippable reveal.
- **Skip** fast-forwards seen lines only by default ("skip all" as an option) and stops at unseen text and at choices.
- **Auto-advance** waits a delay scaled to line length after the reveal, pauses at choices, and cancels on any input.
- **Backlog** scrolls recent lines with speaker names and replays voice.
- Expressions swap a portrait layer rather than reloading the sprite; characters sit in discrete slots (left, center, right).
- Choices that are locked by flags: decide whether to show them disabled (hinting at other routes) or hide them, and be consistent.
- Hide-UI toggle for viewing CGs; a gallery of unlocked CGs and endings rewards replays.

## Balancing norms

- Choices should have visible consequences within a scene or two (a changed line, a reaction), even when the plot merges.
- Track route completion and show it after the first ending; replays are where most VN playtime goes.
- Flags with thresholds (`affection >= 5`) need a debug view and a test that walks each ending's minimum path.
- Text box size and font must allow text expansion for localization (some languages run 30% longer or more).

## Pitfalls

- Checkpoint-only saves: VNs need save anywhere, restoring the exact line, flags and scene.
- Presentation logic baked into the script, or story logic in engine code.
- No skip, auto or backlog: these are baseline features, not extras.
- Skip that skips unread text.
- Choices that reconverge instantly with no reaction: they read as fake.
- Combinatorial branch explosion: prefer branch-and-merge with flagged variations.
- Inline text instead of line ids: localization becomes a rewrite.
- Text baked into images.

## Engine pointers

- Text box, choice menu, backlog UI; typewriter in Godot: `dialogue.md` (Godot notes) and `godot` (UI reference).
- Dialogue runtime: `dialogue.md`; in Godot, `godot-addons` (Dialogue Manager) is a ready-made option.
- Transitions and sprite tweens: `godot` (animation reference); music and voice: `game-audio`.
- Save slots and versioning: `game-architecture`.
