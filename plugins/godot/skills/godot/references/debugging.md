# Debugging Godot projects

Finding and fixing runtime bugs: logging functions, breakpoints, the remote scene tree, signal inspection, headless checks, and a table of common errors with their causes. Performance problems are in `references/performance.md`; regression tests are in `godot-testing`.

## Method

Reproduce, isolate (smallest scene that still fails), form one hypothesis, trace it (prints or a breakpoint), fix, verify in the same repro, then add a regression test. Don't change two things at once.

## Checks without the editor UI

- `godot --headless --path . --quit`: loads the project and main scene once; parse and load errors print to stderr. Add `--verbose` for more.
- `godot --headless --path . --check-only --script res://path/file.gd`: parse-check one script. `--check-only` does nothing without `--script`.
- `godot --headless --path . --import` (implies `--editor --quit`) before the first headless run of a fresh checkout, so the `.godot/` import cache exists.
- When the godot-mcp editor addon is connected, its script validation and `run_headless` tools return the same diagnostics; follow the project's `godot-mcp` skill.

## Logging

| Function | Output | Use for |
| --- | --- | --- |
| `print(a, b)` | stdout, Output panel | Quick values |
| `print_rich("[color=yellow]...[/color]")` | BBCode-coloured in the Output panel | Tagged, categorised logs |
| `print_debug(...)` | Prints in every build; appends the calling frame (`At: res://x.gd:15:_process()`) when the debugger is attached | Prints that should say where they came from |
| `printerr(...)` | stderr | CI and terminal logs |
| `push_warning(...)` / `push_error(...)` | Debugger > Errors tab with a stack trace, plus stderr | Recoverable problems and invalid state; execution continues |
| `print_stack()` / `get_stack()` | Current GDScript call stack (debug builds with the debugger) | "Who called this?" |

- Gate chatty logs behind a flag (`if OS.is_debug_build()` or a debug autoload), not by deleting them before each commit.
- `assert(cond, msg)` only runs in debug builds and stops at the failure in the editor; don't rely on it for runtime validation, and avoid it in headless test paths, where it can hang the run.
- Long-running logs: `godot --log-file <path>` or the `debug/file_logging/*` project settings.

## Breakpoints and the debugger

- Click the script editor gutter to set a breakpoint, or write the `breakpoint` statement in GDScript. Execution pauses with the stack, locals and members in the Debugger panel; values can be edited live.
- **Remote scene tree:** while the game runs, switch the Scene dock to Remote to see the live tree; selecting a node shows its live properties in the Inspector, and edits apply immediately.
- `get_tree().root.print_tree_pretty()` or `node.print_tree_pretty()` dumps the tree to stdout; use it to confirm a node is where the code assumes.
- Debugger > Errors lists every `push_error`/engine error with a clickable stack; check it before guessing.
- Debugger > Monitors: a growing Object Count or Orphan Nodes count across scene reloads means leaked nodes (removed but not freed).
- Physics feels off at high frame rates or in slow motion: check `physics/common/physics_ticks_per_second` and `Engine.time_scale`, and that movement code runs in `_physics_process` with `delta`.

## Signals

- `node.is_connected(&"health_changed", _on_health_changed)` before connecting a second time, or use `CONNECT_ONE_SHOT` for single-fire connections.
- `node.get_signal_connection_list(&"health_changed")` returns dictionaries with `signal`, `callable` and `flags`; loop `get_signal_list()` to audit every signal on a node.
- Handler fires twice: connected in `_ready` of a node that re-enters the tree, plus once in the editor (the `.tscn` `[connection]` block). Check both.
- Handler never fires: wrong node instance, signal emitted before the receiver connected, or a misspelled string name. Prefer `obj.signal_name.connect(...)` over `connect("name", ...)` so typos fail at parse time.
- Wrong argument count shows as an error at emit time; the handler's parameters must match the signal's (use `.bind()` / `.unbind(n)` to adapt).
- A lambda that captures a node freed first logs "Lambda capture at index 0 was freed" on every emit; connect the target's own method instead, which is removed when the target is freed.

## Common errors

| Message (abridged) | Usual cause | Fix |
| --- | --- | --- |
| `Node not found: "X" (relative to ...)` | Wrong path, renamed node, or lookup before the node is in the tree | Use `@onready` or look up in `_ready`; `get_node_or_null` for optional nodes; `%UniqueName` for deep nodes |
| `Attempt to call function '...' in base 'null instance'` / `Invalid access ... on a null instance` | Freed node, unassigned `@export`, failed lookup | `is_instance_valid(x)`; check the Inspector wiring; guard after every `await` |
| `Can't change this state while flushing queries` | Changing physics state (shape `disabled`, `monitoring`, adding bodies) inside a physics callback like `body_entered` | `shape.set_deferred("disabled", true)`, `add_child.call_deferred(n)` |
| `Invalid call. Nonexistent function 'f' in base 'T'` | Wrong type, script not attached, or a typo | Static types so the parser catches it; check `class_name` and the attached script |
| `Signal 'x' is already connected to given callable` | Connecting twice | `is_connected()` check or connect once in `_ready` |
| `Stack overflow` (recursion) | A setter assigning its own property through `self.prop`, or a signal handler re-emitting the same signal | Assign the backing field inside the setter; guard re-entry with a flag |
| `Cyclic reference` / resource refuses to save | A Resource that contains itself, directly or through sub-resources | Break the cycle; store an id instead of the reference |
| `Cannot call method 'x' on a previously freed instance` | Code resumed after `await` once the node was freed, or a stored reference outlived its node | `is_instance_valid(node)` before use; disconnect or clear references in `_exit_tree` |
| `Parse Error: ... (on a .tscn)` / `Failed loading resource` | Broken hand edit, missing `ext_resource`, stale `uid://` | See `references/tscn-tres-format.md` |
| `Index p_index = n is out of bounds (size() = m)` | Array index past the end | Check `size()`; for `Array` use `array.get(i)` only after bounds checks |

## Coroutine traps

- A node freed while awaiting never resumes its own coroutine, so `is_instance_valid(self)` after `await` guards nothing; guard other objects you touch instead.
- Awaiting a signal that already fired waits forever; check state first, then await.
- `await` inside `_ready()` returns control early: the parent's `_ready()` runs before the rest of the child's.
