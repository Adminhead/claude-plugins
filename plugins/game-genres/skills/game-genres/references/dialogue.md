# Dialogue

Branching conversation for any genre: nodes hold lines, choices branch the flow, conditions gate options, variables remember what the player did. Used by `rpg.md` and `visual-novel.md`.

## Core systems (build in this order)

1. **Pick the authoring approach** (below).
2. **Variable store** separate from flow and from UI: booleans, numbers, strings.
3. **Runner:** a state machine that emits a line or a choice set, waits for input, advances.
4. **String table keyed by line id**, from day one.
5. **Bridge to game state:** expose quest stage, gold, flags and commands (play sound, give item) to the script.
6. **Validation pass** over every dialogue file in CI or at load in debug builds.

## Choose: Ink, Yarn Spinner or a custom runner

| | Ink (inkle) | Yarn Spinner (3.x) | Custom graph |
| --- | --- | --- | --- |
| Strength | prose-first, heavy branching, weave and gathers | node graph, explicit `<<commands>>` into game code | full control, no dependency |
| Unit | knot `=== name ===`, stitch `= name` | node with `title:`, body between `---` and `===` | node in JSON or engine resources |
| Choice | `*` once-only, `+` sticky | `-> Option text` with an indented body | `choices: [{ text, to, if, set }]` |
| Jump | `-> knot`, `-> END` | `<<jump Node>>` | `next` / `to` |
| Variables | `VAR gold = 0`, `~ gold = gold - 5`, `{gold}` | `<<declare $gold = 0>>`, `<<set $gold = $gold - 5>>`, `{$gold}` | flat dictionary |
| Gated choice | `* {gold >= 50} [Bribe]` | `-> Bribe <<if $gold >= 50>>` | `"if": "gold >= 50"` |
| Seen checks | free: a knot name is its visit count | `visited("Node")` | track seen node ids |
| Runtimes | compile `.ink` to JSON; official Unity, inkjs for web, community Godot | Unity first-class; Godot (C#) and others exist | yours |

Use a custom graph when the need is lines, choices and flags. Use Ink or Yarn when writers need real flow control. Never invent a scripting language.

Syntax traps:

- Ink: `*` choices vanish after one use; a menu the player can loop back to needs sticky `+` choices. `[bracketed]` text shows in the choice but not in the printed result.
- Yarn: declare every variable (an undeclared one compiles with an inferred type and default, which hides typos). Variables keep their type. Unknown `<<commands>>` dispatch to handlers registered in game code.
- Both: tag lines with ids and extract them to string tables rather than translating the script in place.

## Custom runner

```text
graph = { start: id, vars: {...},
          nodes: { id: { speaker?, line: LINE_ID, choices?: [ { text: ID, to, if?, set? } ],
                         next?, end?, set? } } }      # exactly one of choices / next / end

goto(id):
    node = nodes[id]; current = node
    if node.end: ui.close(); return
    if node.line: ui.show_line(node.speaker, localize(node.line))
    if node.choices: ui.show_choices([c for c in node.choices if evaluate(c.if, vars)])
    elif node.next: ui.on_continue(-> apply(node.set); goto(node.next))

choose(c): apply(c.set); goto(c.to)        # state changes on the transition, so revisits don't re-apply
```

- Conditions and assignments go through a tiny evaluator that whitelists names, literals, arithmetic, comparison and boolean operators, and nothing else. Never pass dialogue text to the host language's `eval`.
- Apply all assignments in a `set` block against the old values, then commit, so `{a: b, b: a}` swaps correctly.
- `localize(key)` falls back to the default locale, then to a visible `<MISSING:key>` placeholder, never a crash.
- Validation: every `to` and `next` target exists; every node terminates (choices, next or end); every variable used is declared; flood from `start` and warn on orphan nodes.

## Feel targets

- Typewriter reveal; the first confirm press completes the line, the second advances.
- Speaker name and portrait change with each line; choices appear only after the line finishes.
- Choices show their consequence hint only where the design wants it ("[Lie]", "[Persuade 60%]").
- Never block input with a non-skippable reveal; let players replay the last line.

## Pitfalls

- Display strings hardcoded instead of line ids: localization becomes a rewrite.
- Narrative variables coupled to the UI: the same conversation can't run in a cutscene or a test. Persist them through the save system.
- Dead-end nodes with no terminator: the conversation silently stalls.
- `set` on a node the player can revisit: gold drained twice. Apply on the transition or guard with a seen flag.
- Mixing up Ink's `*` and `+` in a looping menu.

## Godot notes

Adapted from GodotPrompter `dialogue-system` (MIT). For a ready-made system, Dialogue Manager is covered in `godot-addons`; Dialogic lives at `dialogic-godot/dialogic`.

- **Typewriter:** set the `RichTextLabel` text once, then raise `visible_characters` from 0 on a `Timer` or `Tween` (it counts characters, so BBCode tags stay intact; slicing the string breaks them). `get_total_character_count()` is the end; `visible_characters = -1` shows everything.
- **Advance:** in `_unhandled_input`, on `ui_accept`: if the reveal is still running, stop it and set `visible_characters = -1`; otherwise advance to the next line.
- **Choices:** `queue_free()` the old choice buttons before adding new ones, and connect each button with `pressed.connect(manager.choose.bind(i))`.
- **Conditions with `Expression`:**

```gdscript
var expr := Expression.new()
if expr.parse(condition) != OK:
    push_error("bad condition '%s': %s" % [condition, expr.get_error_text()])
    return false
var result = expr.execute([], GameState)   # one fixed base instance
if expr.has_execute_failed():
    return false
return bool(result)
```

Pass one fixed base instance (a `GameState` autoload with methods such as `has_flag()`, `quest_stage()`) so conditions read `has_flag("met_queen")`. `Expression` can call any method reachable from the base instance, so only evaluate strings you authored. `execute()`'s `const_calls_only` flag restricts execution to const calls, but don't treat it as a sandbox: for modded or downloaded dialogue, use the whitelisted evaluator from the custom runner section.
