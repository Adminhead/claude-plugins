# Scene editing and in-editor services

For addons that change the open scene programmatically or run a long-lived service inside the editor: an editor-side MCP or HTTP server, a job runner, a log collector, a build bridge. Checked against the Godot 4.7.2 class reference (`EditorUndoRedoManager`, `EditorInterface`, `EditorFileSystem`, `TCPServer`, `Logger`, `OS`, `EditorDebuggerPlugin`, `EditorSettings`), 2026-10-17.

## Contents

- Undoable scene edits
- Node ownership
- Saving, opening and running scenes
- Writing files under `res://`
- Running a server in the editor
- Capturing logs
- Threads and processes
- Talking to the running game
- Project and editor settings

## Undoable scene edits

`EditorInterface.get_editor_undo_redo()` returns the `EditorUndoRedoManager`. It keeps one history per open scene plus a global one, and picks the history from the objects the action touches; pass `custom_context` (the scene root) when that's ambiguous, such as an action that only calls methods.

Change a property:

```gdscript
var ur := EditorInterface.get_editor_undo_redo()
ur.create_action("Set %s.%s" % [node.name, property], UndoRedo.MERGE_DISABLE, scene_root)
ur.add_do_property(node, property, new_value)
ur.add_undo_property(node, property, node.get(property))
ur.commit_action()
```

Add a node:

```gdscript
func add_node(parent: Node, node: Node) -> void:
	var scene_root := EditorInterface.get_edited_scene_root()
	var ur := EditorInterface.get_editor_undo_redo()
	ur.create_action("Add %s" % node.name, UndoRedo.MERGE_DISABLE, scene_root)
	ur.add_do_method(parent, &"add_child", node, true)   # true = readable unique name
	ur.add_do_method(node, &"set_owner", scene_root)
	ur.add_do_reference(node)                           # history owns the node while it's undone
	ur.add_undo_method(parent, &"remove_child", node)
	ur.commit_action()
```

Delete a node: `add_do_method(parent, &"remove_child", node)`, then `add_undo_method(parent, &"add_child", node, true)`, `add_undo_method(parent, &"move_child", node, node.get_index())`, `add_undo_method(node, &"set_owner", scene_root)`, and `add_undo_reference(node)` so the removed node isn't freed while undo can still restore it. Reparenting and moving follow the same shape with `reparent`/`move_child`.

For continuous edits (a slider or drag), use `UndoRedo.MERGE_ENDS` so one gesture becomes one undo step. When the change has already been applied during the drag, `commit_action(false)` records it without re-applying.

Scene structure edits must happen on the main thread. If a request arrives from a socket or a thread, queue it and apply it from `_process` or with `call_deferred`.

## Node ownership

A node is saved with the scene only if its `owner` is the edited scene root.

- Nodes you build in code: set `owner` on the new node and on every descendant you also created.
- An instanced `PackedScene`: set `owner` on the instance root only. Its children keep the sub-scene as owner; setting them to the edited root inlines them as if Editable Children were on.
- Instancing so the editor treats it as a scene link: `packed.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)`.

## Saving, opening and running scenes

| Task | Call |
|---|---|
| Current scene root | `EditorInterface.get_edited_scene_root()` (null when no scene is open) |
| Open / reload / close | `open_scene_from_path(path)`, `reload_scene_from_path(path)`, `close_scene()` |
| Save | `save_scene()` (returns an `Error`), `save_scene_as(path)`, `save_all_scenes()` |
| Unsaved state | `mark_scene_as_unsaved()`; 4.7 `get_unsaved_scenes()` |
| Run | `play_main_scene()`, `play_current_scene()`, `play_custom_scene(path)` |
| Stop / state | `stop_playing_scene()`, `is_playing_scene()`, `get_playing_scene()` |

Playing saves modified scenes first (unless the user disabled that), which bypasses any checks your own save path does. Starting and stopping are asynchronous: wait a frame or poll `is_playing_scene()` before reporting the new state. `EditorPlugin._build()` runs before every Play; return false to cancel it (for example, when a generated file failed to build).

## Writing files under `res://`

- After writing or deleting files from tool code, tell the editor: `EditorInterface.get_resource_filesystem().update_file(path)` for one file, or `.scan()` for many. Wait for `EditorFileSystem.filesystem_changed` (and `resources_reimported` for imported assets) before loading what you wrote.
- New files get `.uid` sidecars from the editor; keep them with the file in version control.
- Scripts edited on disk while open in the Script editor: on 4.7 call `EditorInterface.get_script_editor().reload_open_files()`; on older versions the editor prompts on focus.
- Keep the addon's private runtime state under `res://.godot/<addon>/` (ignored by VCS) or `user://`, never in the addon folder, which people commit.

## Running a server in the editor

`EditorPlugin._process` runs on the editor's main loop, which makes it the simplest place to poll a non-blocking server:

```gdscript
@tool
extends EditorPlugin

var _tcp := TCPServer.new()
var _peers: Array[StreamPeerTCP] = []

func _enter_tree() -> void:
	var err := _tcp.listen(6550, "127.0.0.1")   # loopback only
	if err != OK:
		push_error("my_addon: cannot listen (%s)" % error_string(err))

func _exit_tree() -> void:
	for peer in _peers:
		peer.disconnect_from_host()
	_peers.clear()
	_tcp.stop()

func _process(_delta: float) -> void:
	while _tcp.is_connection_available():
		_peers.append(_tcp.take_connection())
	for peer in _peers.duplicate():
		peer.poll()
		if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			_peers.erase(peer)
			continue
		var available := peer.get_available_bytes()
		if available > 0:
			var chunk := peer.get_data(available)   # [error, PackedByteArray]
			_handle(peer, chunk[1])
```

Practical points:

- **Latency depends on editor focus.** The editor runs in low-processor mode: about 144 Hz while focused (`interface/editor/timers/low_processor_mode_sleep_usec`, 6900) but about 10 Hz when its window is unfocused (`unfocused_low_processor_mode_sleep_usec`, 100000). An agent driving the editor from a terminal usually means unfocused, so each poll can wait up to 100 ms. Process every buffered request per `_process` call, not one, and keep timeouts generous. A dedicated thread avoids the wait but must hand scene work back to the main thread.
- **Bind to `127.0.0.1`,** require a random bearer token, and store it owner-only (`FileAccess.set_unix_permissions`) outside the committed tree. Anything that reaches the server can edit the project.
- **Bound everything:** header and body sizes, peer count, and per-request time. Don't trust a client to close.
- **Pick the port per project** and save it (`ProjectSettings.set_setting` + `ProjectSettings.save()`) so clients can find it; fall back through a range if the port is taken.
- `HTTPServer` doesn't exist in the engine; write the small HTTP subset you need over `StreamPeerTCP`, or use `WebSocketPeer` (`accept_stream` on a taken TCP peer) for a socket protocol.
- Stop the server and close peers in `_exit_tree`, or the port stays bound until the editor restarts.

## Capturing logs

Godot 4.5 added `Logger`: subclass it, override `_log_message(message, error)` and `_log_error(function, file, line, code, rationale, editor_notify, error_type, script_backtraces)`, and register it with `OS.add_logger(logger)`; remove it with `OS.remove_logger` in `_exit_tree`. Both callbacks can run on any thread, concurrently, so guard shared buffers with a `Mutex` and keep them bounded. Calling `print`/`push_error` inside a logger callback isn't supported (it would recurse).

The running game is a separate process; its output reaches the editor through the debugger, not your logger. Use the next section for game-side data.

## Threads and processes

- `Thread.new().start(callable)` and `thread.wait_to_finish()` in `_exit_tree`; or `WorkerThreadPool.add_task(callable)` with `wait_for_task_completion(id)`. Signal completion with `call_deferred`.
- Never call `OS.execute(..., blocking)` for anything slow on the main thread; the editor freezes. Use `OS.execute_with_pipe(path, args, false)` (non-blocking pipes), which returns `stdio`, `stderr` (`FileAccess` pipes) and `pid`, then poll the pipes from `_process` and check `OS.is_process_running(pid)`. `OS.create_process` starts a detached child without pipes.
- Track child PIDs and `OS.kill(pid)` them in `_exit_tree`.
- Pass arguments as an array, never through a shell string, so file names with spaces or quotes can't inject commands.

## Talking to the running game

An `EditorDebuggerPlugin` (registered with `add_debugger_plugin`, removed with `remove_debugger_plugin`) receives messages the game sends with `EngineDebugger.send_message("my_addon:event", [data])`. Implement `_has_capture(prefix)` to claim `"my_addon"` and `_capture(message, data, session_id)` to handle it; send back with `get_session(id).send_message(...)`. In the game, register a handler with `EngineDebugger.register_message_capture("my_addon", callable)`, guarded by `EngineDebugger.is_active()`. This works only while the game runs from the editor with the debugger attached.

## Project and editor settings

- Project-wide (committed): `ProjectSettings.set_setting(name, value)`, `add_property_info({...})` for type and hint, `set_initial_value(name, default)` so the default isn't written to `project.godot`, `set_as_basic(name, true)` to show it without Advanced Settings, then `ProjectSettings.save()`. Prefix names with the addon (`my_addon/server/port`).
- Per user (not committed): `EditorInterface.get_editor_settings()`, same pattern with `set_setting`, `add_property_info`, `set_initial_value`.
- Engine version for compatibility branches: `Engine.get_version_info()` (`major`, `minor`, `patch`), or `ClassDB.class_exists(&"EditorDock")` to test for a feature directly.
