# Dialogue Manager

Addon v4.1.0 (nathanhoad/godot_dialogue_manager, MIT) checked against Godot 4.7, 2026-10-17, from the v4.1.0 docs and source. GDScript with an official C# wrapper. Releases are labelled "for Godot 4.7"; the upgrade guide gives 4.6 as the minimum. v3.10.5 is the last 3.x release.

## Contents

- Is this project on 3.x or 4.x?
- `.dialogue` syntax
- State: where dialogue reads and writes
- Running dialogue from code
- Nodes
- Translations
- C# notes
- Checklist

## Is this project on 3.x or 4.x?

Read `addons/dialogue_manager/plugin.cfg` `version=`. Then:

| 3.x | 4.x |
|---|---|
| "Titles" `~ name` | "Cues" `~ name` (same marker, renamed everywhere: API args, signals, docs) |
| `- Text [if cond]` | `- Text [if cond /]` (response conditions are self-closing) |
| `set x = 1`, `do f()` | `$> x = 1`, `$> f()` (`set`/`do` still parse but are deprecated) |
| inline `[do f()]`, `[do! f()]` | inline `[$> f()]`, `[$>> f()]` (do not await) |
| `DialogueLine.translation_key` | `DialogueLine.static_id` |
| `passed_title` signal | `passed_cue` signal |
| Bespoke CSV exporter | Godot's own template generation (Project Settings → Localization); 4.1 adds a simple CSV exporter back |

Upgrading 3 to 4: commit first, replace the `addons/dialogue_manager/` folder, delete `.godot/`, restart the editor (sometimes twice), then fix response conditions and renamed members. Do not upgrade mid-production without a reason.

## `.dialogue` syntax

Lines are `Character: text` or bare `text`. RichTextLabel BBCode works, plus `[[a|b|c]]` (random pick), `[wait=N]`, `[wait="ui_accept"]`, `[wait]` (any action), `[speed=N]`, `[next=N]` or `[next=auto]`.

```
~ start
Nathan: [#happy] Hi! I'm Nathan. [ID:HI_IM_NATHAN]
Nathan: How many projects have you started and not finished?
- Just a couple
	Nathan: That's not so bad.
- A lot [if SomeGlobal.projects > 5 /]
	Nathan: Maybe finish one first.
- Ask again later [if SomeGlobal.can_leave() /] => leave
=> END

~ leave
Nathan: See you, {{player.display_name}}.
=> END
```

- **Cues and jumps.** `~ cue_name` (no spaces). `=> cue` jumps, `=> END` ends the flow, `=> END!` ends even inside jump-and-returns, `=>< cue` jumps and comes back when that branch reaches `END`. On a response line, the jump goes last, after any condition. `=> {{expr}}` jumps to a computed cue (not checked at compile time; use sparingly).
- **Responses** start with `- ` and nest by indentation. Failed-condition responses are still returned with `is_allowed = false`; the balloon decides whether to hide them (`DialogueResponsesMenu.hide_failed_responses`).
- **Conditions.** `if` / `elif` / `else` blocks with `and`, `or`, parentheses (short-circuit evaluated). `match x` with `when 1`, `when > 5`, `else`. `while cond` loops. Inline: `[if cond]text[/if]`, `[if n == 1]apple[else]apples[/if]`. Prefix a line with `\` to start dialogue with the word "if". Null-safe access: `some_node?.name`.
- **Mutations.** `$> SomeGlobal.has_met = true`, `$> SomeGlobal.animate("Nathan", "Wave")`, `$> SomeGlobal.some_signal.emit("arg")`. Mutations are awaited by default. Built-ins: `$> wait(1.5)` and `$> debug(value)`. `self` in dialogue is the running `DialogueResource`.
- **Random lines.** `%` for equal weight, `%3` for weight 3; a blank line separates groups; `%` alone on a line followed by an indented block makes the block one option. Conditions go after the `%`: `% [if cond] => some_cue`.
- **Variables.** `{{expr}}` in text or in the character name. Define `_to_dialogue_string()` on an object to control how it prints.
- **Tags.** `[#happy, #mood=calm]`; read with `line.tags` and `line.get_tag_value("mood")`.
- **Concurrent lines.** `| Coco: At the same time!` after a line; read from `line.concurrent_lines` (the example balloon ignores them).
- **Imports.** `import "res://snippets.dialogue" as snippets` then `=>< snippets/banter`. 4.1 accepts `uid://` paths here.
- **Shortcuts.** `using SomeGlobal` at the top of a file lets the file write `some_property` instead of `SomeGlobal.some_property`; the project-wide version is the State Autoload Shortcuts setting.

## State: where dialogue reads and writes

The runtime holds no game state. It looks up names, in order of preference:

1. **Autoloads.**
2. **`DialogueStateContext` nodes.** Add one to a scene, set `alias` (for example `player`) and `target`; while that scene is in the tree, dialogue can use `player.health` and call `player` methods. Prefer this to passing state by hand.
3. **`extra_game_states`.** An array of nodes, objects or dictionaries passed to `show_dialogue_balloon` or `get_next_dialogue_line`. Pass **instances** (`GameState.new()`), never the class. Most brittle option.
4. The current scene (from `DialogueManager.get_current_scene`, overridable with your own `Callable`).

`locals.foo` is a convention of the example balloon (per-conversation temporaries), not a core feature. A custom balloon must provide it itself if dialogue uses it.

A missing property or method raises an assertion in debug builds; the Dialogue tab in the Debugger panel shows which contexts and autoloads were visible and the line history.

## Running dialogue from code

```gdscript
@export var dialogue: DialogueResource

func talk() -> void:
	# Opens the balloon set in Project Settings → Dialogue Manager → Balloon Path,
	# or the example balloon when none is set. Returns the balloon node.
	DialogueManager.show_dialogue_balloon(dialogue, "start")

func walk_manually() -> void:
	var line: DialogueLine = await DialogueManager.get_next_dialogue_line(dialogue, "start")
	while line != null:
		print("%s: %s" % [line.character, line.text])
		var next_id := line.next_id
		if not line.responses.is_empty():
			next_id = line.responses[0].next_id  # replace with the player's choice
		line = await dialogue.get_next_dialogue_line(next_id)
```

- `get_next_dialogue_line(resource, cue := "", extra_game_states := [], mutation_behaviour := DMConstants.MutationBehaviour.Wait)` must be awaited and returns `null` at the end. The enum lives on `DMConstants` (`Wait`, `DoNotWait`, `Skip`); the example balloon supports only `Wait`. A resource also has its own `get_next_dialogue_line(cue)`.
- Other calls: `show_dialogue_balloon_scene(scene_or_path, resource, cue, states)`, `show_example_dialogue_balloon(...)`, `create_resource_from_text(text)` (fails on syntax errors), `static_id_to_line_id(resource, static_id)`, `reseed_randomizer(seed)` for reproducible random lines.
- `DialogueLine`: `id`, `next_id`, `character`, `text`, `tags`, `static_id`, `responses` (each with `id`, `next_id`, `text`, `is_allowed`, `condition_as_text`, `tags`, `static_id`), `concurrent_lines`. `to_serialized()` and `DialogueLine.new_from_serialized(s, states)` save and restore a line (persisted resources only, not ones built from text).
- Signals on `DialogueManager`: `dialogue_started(resource)`, `passed_cue(cue)`, `got_dialogue(line)`, `mutated(mutation)` (not for plain assignments), `waiting_for_input()`, `waited_for_input()`, `dialogue_ended(resource)`.

For a custom balloon, run Project → Tools → "Create copy of example dialogue balloon...", restyle the copy (mostly its `Balloon` panel theme), and point Balloon Path at it rather than calling `show_dialogue_balloon_scene` everywhere. A balloon placed in a scene can also take a resource and cue in the Inspector and start with "auto start" or `start()`.

## Nodes

- `Actionable2D` / `Actionable3D` (`Area2D`/`Area3D`): set `dialogue_resource` and `dialogue_cue`, call `action()`; signals `actioned` and `dialogue_ended` (also fires when another actionable runs the same resource). `Actionable2D.get_nearest_actionable_to(position)` picks the closest one for an "interact" key.
- `DialogueMarker2D` / `DialogueMarker3D`: mark a character's speech point; `DialogueMarker2D.find_for_character(name)` and `get_position_in_viewport()` place speech-bubble balloons.
- `DialogueStateContext`: see State above.
- `DialogueLabel` (RichTextLabel): `type_out()`, `skip_typing()`, `seconds_per_step`, `pause_at_characters`; signals `started_typing`, `spoke(letter, index, speed)`, `skipped_typing`, `finished_typing`. It handles `[wait]`, `[speed]` and inline mutations.
- `DialogueResponsesMenu`: `responses`, `hide_failed_responses`, `next_action`; signal `response_selected(response)`.

## Translations

- Text goes through `tr()` once the project has loaded translations. Add `[ID:SOME_KEY]` to lines and responses that need stable keys (voice-over, CSV); the editor can generate static IDs for a file.
- `.dialogue` files are added to Project Settings → Localization → Template Generation automatically; export a POT or CSV from there. The setting **Use Static IDs as Translation Keys** decides whether the static ID is the msgid (usual for CSV) or context (usual for gettext).
- A `##` comment line before a dialogue line becomes a `#. TRANSLATORS:` note in the POT.
- BBCode and runtime tags such as `[next=auto]` are part of the text and must stay in translations.
- The 3.x `DialogueManager.translation_source` property no longer exists in 4.x source; the v4 Translations doc still mentions it.

Locale switching and RTL belong to the project's localization setup, not to this addon.

## C# notes

- `using DialogueManagerRuntime;` then `DialogueManager.ShowDialogueBalloon(resource, "start")` or `await DialogueManager.GetNextDialogueLine(resource, "start")`; members are PascalCase.
- Properties that dialogue reads or writes need `[Export]`. Async mutations return `Task` or `Task<Variant>`.
- C# events (`DialogueStarted`, `PassedCue`, `GotDialogue`, `Mutated`, `DialogueEnded`) are wired lazily on first access to `DialogueManager.Instance`. If dialogue is started from GDScript only, touch `DialogueManager.Instance` once from C# or the handlers never fire.
- `DialogueResponsesMenu.response_selected` is a Godot signal; connect it with `Connect("response_selected", Callable.From(...))`.
- Native C# node versions exist but are not in the Create Node dialog; attach the `.cs` scripts by hand.

## Checklist

- [ ] Version read from `plugin.cfg`; syntax matches it (cues, `[if ... /]`, `$>`)
- [ ] State exposed through autoloads or `DialogueStateContext`, not ad hoc `extra_game_states`
- [ ] Every `get_next_dialogue_line` is awaited and the loop ends on `null`
- [ ] Response lines put the condition before the jump
- [ ] Custom balloon set through Balloon Path; it filters `is_allowed == false` responses if they should be hidden
- [ ] `[ID:...]` on lines that need stable translation or voice keys
- [ ] C# handlers are wired (touch `Instance`) when GDScript starts the dialogue
