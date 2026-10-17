# Save systems

Engine-neutral design. For Godot's file access, `user://` paths, ConfigFile and JSON helpers, see the `godot` skill if installed. Code is pseudocode.

## Contents

1. What to save
2. Format choice
3. Atomic writes and backups
4. Versioning and migration
5. Load-time validation
6. Slots, autosave and settings
7. Pitfalls
8. Test checklist

## 1. What to save

- **Store** authoritative state that can't be derived: choices, unlocked flags, inventory (`id` and quantity), positions, RNG seeds and the generator version.
- **Recompute** derived data on load: final stats from base values and modifiers, procedural maps from the seed, quest UI from quest flags. Saved derived data drifts when a formula changes in a patch, and bloats the file.
- Save data, not engine objects or node paths. Renaming a node then breaks every old save. Each savable object reports its own state under a stable ID, and a loader rebuilds objects from that data.
- Vectors and colours are saved as plain numbers (`{"x": 1.0, "y": 2.0}` or `[1.0, 2.0]`), not as an engine's string form.
- Keep an in-memory dictionary or struct as the canonical shape and serialize at the boundary. Migrations work on that shape, not on bytes.

## 2. Format choice

| Format | Use for | Watch out for |
| --- | --- | --- |
| JSON | most game saves | number types (below), size, trivially editable |
| Binary format you control | large state, fast load | needs its own versioning; hard to debug |
| Plain key-value or INI file | settings, key bindings | no nesting beyond sections |
| Engine-native resource or object serialization | authored content in the project only | **never for user-writable files**: loading can instantiate arbitrary types or run embedded scripts, so a shared or downloaded save becomes code execution |
| Cloud key-value store | cross-device saves | quotas, latency, conflict resolution |

When you choose, name the format you rejected and why ("JSON, not engine resources, because players share save files").

**JSON number pitfalls:**

- Many JSON parsers, including several engine ones, return every number as a float. Cast integers (counts, IDs, enum values) back explicitly on load, or `3` becomes `3.0` and breaks equality checks and dictionary keys.
- Integers above 2^53 lose precision as doubles. Store 64-bit IDs and large seeds as strings.
- NaN and Infinity aren't valid JSON. Some serializers write them anyway and others fail; validate before writing.
- Serialize with a locale-invariant writer. Some locales write `1,5` for one and a half.
- Dictionary keys become strings. Integer keys come back as strings on load.

## 3. Atomic writes and backups

```text
save_atomic(path, data):
    tmp = path + ".tmp"
    write(tmp, serialize(data)); flush(tmp); close(tmp)
    if exists(path): copy_or_rename(path, path + ".bak")
    rename(tmp, path)
```

- Writing in place means a crash or power loss mid-write leaves a truncated, unloadable save.
- Rename over an existing file is atomic on POSIX when both files are on the same volume. On Windows, replace-by-rename isn't guaranteed atomic, so the `.bak` copy is what guarantees recovery.
- On load, try the primary file, then `.bak`, and tell the player if both fail.
- Write saves off the main thread if they're large, but snapshot the state on the main thread first, so the save is consistent.
- An optional checksum over the payload detects truncation. It doesn't stop a determined player from editing the file, and doesn't need to.

## 4. Versioning and migration

```text
SAVE_VERSION = 4
MIGRATIONS = {1: m1_to_2, 2: m2_to_3, 3: m3_to_4}

load(raw):
    data = parse(raw)
    v = int(data.get("version", 1))
    if v > SAVE_VERSION: fail("save is from a newer version of the game")
    while v < SAVE_VERSION:
        data = MIGRATIONS[v](data); v += 1; data["version"] = v
    validate(data)
    return data
```

- One integer, bumped whenever the shape changes. Never guess at fields from a newer version.
- Each migration is a small pure function from one version to the next. Never write one function that converts anything to the latest version.
- Additive change: insert the default. Rename or restructure: transform in the migration; game code never reads both names. Removal: drop the field so later steps see a clean shape.
- Keep old migrations forever. Deleting one strands every save from that version.
- Keep a corpus of real saves from every shipped version, and test that they all load after each change.

## 5. Load-time validation

- Required keys are present, with the right types (after casting JSON numbers).
- Numbers are in sane ranges: no NaN, health at least 0, indices in bounds.
- IDs still exist in current content. An item removed in a patch is dropped or replaced with a log line, not a crash.
- References resolve: a quest ID points at a known quest, and a position is inside the level.
- On failure: log, try the backup, and if that fails too, tell the player plainly instead of loading a broken state.

## 6. Slots, autosave and settings

- Manual slots and autosaves go to separate files, so an autosave never overwrites a manual save.
- Autosave at safe points (checkpoints, level transitions, after a menu closes), never mid-combat or mid-cutscene, and throttle it (for example at most once a minute). Rotate a small ring (`autosave_0` to `autosave_2`) so one bad autosave doesn't destroy the only recent state.
- Keep a small metadata header per slot (version, timestamp, playtime, location, thumbnail path) that the slot menu can read without parsing the whole save.
- Settings and key bindings live in their own file, separate from progress. Deleting a save shouldn't reset controls, and a broken save shouldn't block the options menu.
- Save to the platform's per-user data directory (the engine's user path), never next to the executable, which is often read-only once installed.

## 7. Pitfalls

- No version field in the first release, so the first patch can't tell old saves apart.
- Serializing live objects, node paths or file paths instead of IDs.
- Trusting the file: saves get truncated, hand-edited and cloud-synced stale.
- Saving mid-action, which captures an inconsistent state (half-applied damage, an open door with no key spent).
- In multiplayer, treating a local save as authoritative for online state. A local save is player-controlled.
- Saving secrets (tokens, keys) in the save file.

## 8. Test checklist

- Save, quit fully, relaunch, load: the state matches what was inspected before saving.
- Kill the process during a save: the next launch loads the previous save or the backup.
- Load a save from every previous version in the corpus.
- Load a save with a removed item ID, a truncated file and a newer version number. Each fails gracefully.
- Change the OS locale to one with comma decimals, then save and load.
