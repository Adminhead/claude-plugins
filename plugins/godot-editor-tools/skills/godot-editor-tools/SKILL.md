---
name: godot-editor-tools
description: Godot 4 editor plugins and addons. Use when writing or fixing an EditorPlugin, plugin.cfg, @tool script, inspector plugin, EditorDock, 3D gizmo, tool menu, undoable scene edits or an addon that runs a server inside the editor, or when a project has addons/*/plugin.cfg.
---

# Godot editor tools

An editor plugin is an addon folder `addons/<name>/` with a `plugin.cfg` and a `@tool` script extending `EditorPlugin`. It runs inside the editor process, so a bug in it can freeze or crash the editor; build it in small steps and keep every registration reversible. Examples are GDScript; C#-specific rules are marked.

## Layout and plugin.cfg

```
addons/my_tool/
  plugin.cfg
  plugin.gd          # extends EditorPlugin
  my_dock.tscn
  inspector_plugin.gd
  icons/
```

```ini
[plugin]

name="My Tool"
description="One line shown in Project Settings → Plugins."
author="Your Name"
version="0.1.0"
script="plugin.gd"
```

Those five keys are the whole format. `script` is relative to the plugin folder. Enabling writes `res://addons/my_tool/plugin.cfg` into `project.godot` under `[editor_plugins] enabled=PackedStringArray(...)`; editing that list by hand (preserving other entries) is how to enable a plugin without the UI.

## Rules

1. **Every script the editor runs must be `@tool`.** That includes helpers the plugin preloads; a non-tool GDScript used from the editor acts like an empty file. A script that extends a `@tool` script needs `@tool` itself. Static variables of non-tool scripts read as `null` from tool code (static methods, constants and enums work).
2. **`@tool` scripts ship in exports and run in the game too.** Only editor classes (`EditorPlugin`, `EditorInterface`, `EditorInspectorPlugin`, ...) are absent from exports. Guard editor-only logic in runtime node scripts with `Engine.is_editor_hint()`, and keep the plugin's own scripts out of runtime scenes.
3. **C#:** wrap only editor-only classes (the `EditorPlugin`, inspector and gizmo plugins) in `#if TOOLS ... #endif`. Never wrap a runtime `[Tool]` node class; that strips it from exports and breaks every scene that uses it.
4. **`_enter_tree` and `_exit_tree` are mirror images.** Everything added (custom types, docks, inspector, gizmo, import and export plugins, tool menu items, `Engine.register_singleton` entries, loggers, servers, threads) is removed and freed in `_exit_tree`, in reverse order. A plugin that leaks registrations duplicates them on the next enable.
5. **One-time project changes go in `_enable_plugin` / `_disable_plugin`.** These run only when the user toggles the plugin: add or remove autoloads with `add_autoload_singleton`/`remove_autoload_singleton`, or default project settings.
6. **Edit the open scene through undo/redo.** Use `EditorInterface.get_editor_undo_redo()` (`EditorUndoRedoManager`), one action per user-visible change, and set `owner` to `EditorInterface.get_edited_scene_root()` on new nodes or they won't be saved. Direct property writes from tool code can't be undone. Recipes: [references/scene-editing-and-services.md](references/scene-editing-and-services.md).
7. **Never block the main thread.** Poll sockets and processes from `_process`, or run work on `WorkerThreadPool`/`Thread` and hand results back with `call_deferred`. Join threads in `_exit_tree`.
8. **Stay relocatable.** Preload sibling files by relative path (`preload("http_server.gd")`) and find the plugin folder with `(get_script() as Script).resource_path.get_base_dir()`, so the addon works if someone moves or renames its folder.

## EditorPlugin surface

| Want | Use | Read |
|---|---|---|
| A dock or bottom panel | `add_dock(EditorDock)` / `remove_dock` (Godot 4.6+; `add_control_to_dock` and `add_control_to_bottom_panel` are deprecated) | [references/docks-and-ui.md](references/docks-and-ui.md) |
| A Project → Tools menu entry | `add_tool_menu_item(name, callable)` / `remove_tool_menu_item(name)` | docks-and-ui.md |
| A full main-screen editor (like 2D/3D/Script) | `_has_main_screen`, `_make_visible`, `_get_plugin_name`, `_get_plugin_icon` | docks-and-ui.md |
| Custom Inspector widgets | `add_inspector_plugin(EditorInspectorPlugin)` with `EditorProperty` | [references/inspector-plugins.md](references/inspector-plugins.md) |
| 3D handles and overlays | `add_node_3d_gizmo_plugin(EditorNode3DGizmoPlugin)` | [references/gizmos.md](references/gizmos.md) |
| 2D viewport tools | `_handles(object)`, `_edit(object)`, `_forward_canvas_gui_input`, `_forward_canvas_draw_over_viewport`, `update_overlays()` | gizmos.md |
| Act when the user presses Play | `_build()` returning false cancels the run | scene-editing-and-services.md |
| A new node type in Create Node | Prefer `class_name` plus `@icon("res://addons/my_tool/icons/x.svg")` in the node script; `add_custom_type` is the older way | |
| Importers, exporters, translation parsers | `add_import_plugin`, `add_export_plugin`, `add_translation_parser_plugin` | |
| A server, logger or job runner inside the editor | `TCPServer` polled in `_process`, `OS.add_logger` (4.5+) | scene-editing-and-services.md |

Godot 4.7 additions worth knowing: `EditorInterface.get_unsaved_scenes()`; `ScriptEditor.get_unsaved_files()`, `save_all_scripts()`, `reload_open_files()`, `close_file(path)`; static `EditorInspector.create_default_inspector(filter_line_edit)`; `EditorContextMenuPlugin.CONTEXT_SLOT_INSPECTOR_PROPERTY`; `EditorNode3DGizmoPlugin._can_commit_handle_on_click()`.

## Workflow

1. Create `addons/<name>/plugin.cfg` and `plugin.gd` (`@tool`, `extends EditorPlugin`, empty `_enter_tree`/`_exit_tree`), enable it, and confirm it loads with no errors in the Output.
2. Add one feature at a time, with its removal in `_exit_tree` written in the same edit.
3. After each change, disable and re-enable the plugin and check the Output for errors and duplicated docks or menu items. New class registrations and dock changes need this cycle; saving a script alone isn't enough.
4. Test headless where possible: `godot --headless --editor --path <project>` loads enabled plugins. Run `godot --headless --import --path <project>` once first on a fresh checkout so resources are imported. Recipes in [references/testing-plugins.md](references/testing-plugins.md).
5. Before release: bump `version` in `plugin.cfg`, commit `.uid` sidecars, and test a fresh copy of the folder in an empty project.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| A helper behaves like an empty script in the editor (methods missing, values null) | That helper lacks `@tool` | Add `@tool` to every script the plugin uses |
| Duplicate docks or menu entries after re-enable | `_exit_tree` missed a removal | Mirror every add; null the reference after freeing |
| Scene edits vanish on save | New nodes have no `owner` | Set `owner = EditorInterface.get_edited_scene_root()` (also for children) |
| Ctrl+Z doesn't undo the tool's change | Direct writes instead of undo/redo | Wrap in `EditorUndoRedoManager` actions |
| Editor freezes while the tool works | Blocking I/O or `OS.execute` on the main thread | Poll from `_process` or use a thread; for processes use `OS.create_process` or `OS.execute_with_pipe` and poll |
| C#: `Could not find type "MyPlugin"` | The C# project didn't build | Build (MSBuild panel shows errors), then re-enable |
| Runtime scene breaks only in exports (C#) | A runtime `[Tool]` class wrapped in `#if TOOLS` | Unwrap it; wrap only editor-only classes |

Adapted from GodotPrompter (MIT, jame581/GodotPrompter), skill `addon-development`; see `NOTICE`.
