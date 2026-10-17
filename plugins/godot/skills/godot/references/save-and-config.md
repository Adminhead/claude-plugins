# Saves and settings

Godot-side persistence: picking a format, `user://`, settings with ConfigFile, crash-safe JSON saves, the saveable group, schema migration and item registries. What to save, slots and autosave policy in the abstract are in `game-architecture`.

Contents: Pick the format; Paths; Settings with ConfigFile; Crash-safe JSON saves; Saveable group; Versions and migration; Items and registries.

## Pick the format

| Data | Format | Why |
| --- | --- | --- |
| Settings (audio, video, bindings) | `ConfigFile` (`user://settings.cfg`) | INI-style, typed values, easy defaults |
| Game saves | JSON via `FileAccess` (`user://save_<slot>.json`) | Readable, diffable, migratable |
| Large or binary saves | `FileAccess.store_var(value)` / `get_var()` (objects off by default) | Compact, keeps Godot types |
| Designer data shipped with the game | `.tres` / `.res` Resources in `res://` | Editor support |

- Never `load()` a `.tres`/`.res` from `user://`, a download or a mod folder for save data. Loading a Resource can instantiate scripts and run code. Saves are user-writable, so use JSON, ConfigFile or `get_var()` with `allow_objects = false`.
- When recommending a format, name the one rejected and why ("JSON, not a Resource, because the player can edit the save").

## Paths

- `user://` is the only writable place in an export; `res://` is read-only once exported.
- Default `user://` locations: Windows `%APPDATA%\Godot\app_userdata\<project>\`, macOS `~/Library/Application Support/Godot/app_userdata/<project>/`, Linux `~/.local/share/godot/app_userdata/<project>/`.
- `application/config/use_custom_user_dir = true` (with `custom_user_dir_name`) drops the `Godot/app_userdata` part, for example `%APPDATA%\<name>\`. Set it before release; changing it later strands existing saves.
- `OS.get_user_data_dir()` prints the real path; `ProjectSettings.globalize_path("user://")` converts.
- Create subfolders with `DirAccess.make_dir_recursive_absolute("user://saves")` before writing.

## Settings with ConfigFile

```gdscript
const PATH := "user://settings.cfg"
var cfg := ConfigFile.new()

func load_settings() -> void:
	if cfg.load(PATH) != OK:      # missing or corrupt: fall back to defaults
		cfg.set_value("audio", "master_db", 0.0)
		cfg.set_value("display", "fullscreen", false)
	apply_settings()

func set_setting(section: String, key: String, value: Variant) -> void:
	cfg.set_value(section, key, value)
	cfg.save(PATH)
```

- Always pass a default to `get_value(section, key, default)` so new keys work with old files.
- Input rebinding: store each action's events (`InputMap.action_get_events`) in the ConfigFile and re-apply them at startup (see `references/input-map.md`).

## Crash-safe JSON saves

```gdscript
func save_json(path: String, data: Dictionary) -> Error:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_error("save failed: %s" % error_string(FileAccess.get_open_error()))
		return FileAccess.get_open_error()
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	if FileAccess.file_exists(path):           # keep the last good save
		DirAccess.remove_absolute(path + ".bak")
		DirAccess.rename_absolute(path, path + ".bak")
	return DirAccess.rename_absolute(tmp, path)

func load_json(path: String) -> Dictionary:
	for p in [path, path + ".bak"]:
		if not FileAccess.file_exists(p): continue
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
		if parsed is Dictionary: return parsed
		push_warning("unreadable save %s, trying backup" % p)
	return {}
```

- Never write over the live save in place; a crash mid-write leaves a truncated file.
- Check every `FileAccess.open` result for `null` and report `FileAccess.get_open_error()`.
- JSON numbers come back as `float`. Cast on load: `hp = int(d["hp"])`. Uncast values break `is int` checks, `match` on ints and int dictionary keys.
- JSON has no `Vector2`, `Color` or `StringName`. Either store `{"x": .., "y": ..}` by hand, or 4.4+: `JSON.from_native(value)` before `stringify` and `JSON.to_native(parsed)` after parsing. Leave `full_objects` / `allow_objects` false for saves.
- `JSON.parse_string` returns `null` on error and does not say where; use a `JSON` instance and `json.parse(text)` plus `get_error_line()` / `get_error_message()` while debugging.
- `FileAccess.open_encrypted_with_pass` deters casual editing only; the key ships in the game.

## Saveable group

- Each persistent node joins a group and owns its own state:

```gdscript
# on a chest, door, NPC...
@export var save_id := ""            # stable, set in the Inspector; never the node path
func _ready() -> void: add_to_group(&"saveable")
func save_state() -> Dictionary: return {"open": is_open}
func load_state(d: Dictionary) -> void: is_open = d.get("open", false)
```

- The save manager builds `{"version": N, "nodes": {save_id: node.save_state()}}` from `get_tree().get_nodes_in_group(&"saveable")`, and on load calls `load_state(nodes.get(save_id, {}))` after the level scene is in the tree.
- Save data, not nodes: positions as numbers, an RNG seed instead of a generated level, item ids instead of Resource references.
- Spawned objects (dropped loot, enemies) need a scene id plus state so the loader can re-instantiate them; a fixed `save_id` only works for authored nodes.

## Versions and migration

```gdscript
const SAVE_VERSION := 3
func migrate(d: Dictionary) -> Dictionary:
	var v: int = int(d.get("version", 0))
	if v > SAVE_VERSION:
		push_error("save from a newer build"); return {}
	if v < 1: d["inventory"] = []; v = 1
	if v < 2: d["skills"] = []; v = 2
	if v < 3: d["stamina"] = 100; v = 3
	d["version"] = v
	return d
```

- Stamp `version` from the first release. Migrate one step at a time; never delete a step. Use `d.get(key, default)` inside steps.
- Test: save, quit, relaunch, load; and load a save written by the previous build.

## Items and registries

- Save inventories as `[{"id": "potion", "qty": 3}]`, never as Resource paths or object references. Item Resources carry a stable `id` field.
- Build the id-to-Resource registry from an exported `Array[ItemData]` on an autoload, or a preload list. To scan a folder use 4.4+ `ResourceLoader.list_directory("res://items")`, which lists the original names in exports. A `DirAccess` scan for `*.tres` breaks in exported builds, where files appear as `.remap` or converted binaries.
- Autosave on safe boundaries (checkpoint, level change) to its own file so it never overwrites a manual slot.
