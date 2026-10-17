# .tscn and .tres text format

How to read and safely hand-edit Godot 4 scene and resource files, `uid://` references and `.uid` sidecar files. Godot 4.x, checked against the 4.7 TSCN format docs.

## Contents

- Order of preference
- Anatomy of a .tscn
- Anatomy of a .tres
- What must stay in sync
- uid:// and .uid files
- Safe and unsafe edits
- Merge conflicts
- Verify
- Error to cause

## Order of preference

1. The editor MCP tools when `godot-editor` is connected (`add_node`, `update_property`, `save_scene`); or tell the user what to click.
2. A `@tool` script or `EditorScript` that uses the API (`add_child` with `owner`, `ResourceSaver.save()`). "Add a Timer to every enemy scene" is a script, not fifteen text patches.
3. Hand edits, for small and well-understood changes only.

Never hand-edit a scene the editor has open: it rewrites the file from memory on its next save. Close the scene or use the MCP tools.

## Anatomy of a .tscn

```
[gd_scene format=3 uid="uid://bx8n2k4mqvr1t"]

[ext_resource type="Script" uid="uid://c4cp0al3ljsjv" path="res://player/player.gd" id="1_qw3rt"]
[ext_resource type="PackedScene" uid="uid://dkf2n3b8m1x0q" path="res://fx/trail.tscn" id="2_hj8kl"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_a1b2c"]
size = Vector2(16, 24)

[node name="Player" type="CharacterBody2D" unique_id=1358867382 groups=["player"]]
script = ExtResource("1_qw3rt")

[node name="CollisionShape2D" type="CollisionShape2D" parent="." unique_id=1279975976]
shape = SubResource("RectangleShape2D_a1b2c")

[node name="Trail" parent="." unique_id=558852834 instance=ExtResource("2_hj8kl")]

[node name="Camera" type="Camera2D" parent="." unique_id=795715540 node_paths=PackedStringArray("target")]
target = NodePath("..")

[connection signal="body_entered" from="Hurtbox" to="." method="_on_hurtbox_body_entered"]
```

- Sections in order: file descriptor, `[ext_resource]`, `[sub_resource]`, `[node]`, `[connection]`. A child node must come after its parent.
- `format=3` is Godot 4. `format=2` is Godot 3: stop and confirm the engine version. 4.3+ may write a newer format number for files holding data in the newer storage (large base64 `PackedByteArray`s); that is still Godot 4, so leave it.
- 4.6+: `load_steps` is no longer written and is ignored if present (it was never used by the loader). Older files have `[gd_scene load_steps=4 format=3 ...]`; don't bother maintaining it.
- 4.6+: each node has a `unique_id=<int>` so the editor can track moves and renames. Upgrading a 4.5 scene produces large diffs; Project > Tools > Upgrade Project Files does it in one commit.
- Root node: no `parent`. Direct children: `parent="."`. Deeper: `parent="Body/Arm"` (path from the root).
- Instanced scene: `instance=ExtResource("id")` and no `type`. Overridden properties of an instanced child appear as `[node name="X" parent="Trail/..."]` blocks without `type`.
- Exported Node references are listed in `node_paths=PackedStringArray(...)` and stored as `NodePath(...)` relative to that node.
- Properties equal to their defaults are not written; any you add are dropped on the next save.
- `;` starts a comment, but the editor drops comments on save.

## Anatomy of a .tres

```
[gd_resource type="Resource" script_class="ItemData" format=3 uid="uid://b7k3x9q2m4n8p"]

[ext_resource type="Script" uid="uid://c1v8r5t3w6y2z" path="res://items/item_data.gd" id="1_abcde"]
[ext_resource type="Texture2D" uid="uid://dq4m7n2p9k1x3" path="res://items/sword.png" id="2_fghij"]

[resource]
script = ExtResource("1_abcde")
id = &"sword"
display_name = "Sword"
icon = ExtResource("2_fghij")
max_stack = 1
```

The `[resource]` section holds the main resource's properties; sub-resources come before it.

## What must stay in sync

- Ids are strings: ext_resource ids look like `"1_qw3rt"`, sub_resource ids like `"RectangleShape2D_a1b2c"`. Every `ExtResource("x")` and `SubResource("y")` must match a declared block, and each id must be unique in the file.
- When adding an `[ext_resource]` by hand, give it `type`, `path` and a new unique `id`, and omit `uid=`; the editor fills the uid in on its next save.
- Renaming a node: update every descendant's `parent=`, every `[connection]` `from=`/`to=`, and every `NodePath(...)` that points at it, in one pass. Also update `%Name` and `$Path` references in scripts.
- Copying a node block within or between scenes: drop its `unique_id=` (or give none) so two nodes never share one.
- A `[connection]` must name a signal that exists on the `from` node and a method that exists on the `to` node's script.
- Moving a file: every `path=` that names it must change, unless the reference resolves by `uid=` (the editor prefers the uid and repairs the path on save). Safer: move it in the editor's FileSystem dock, which updates references.

## uid:// and .uid files

- `uid://...` is a file's stable identity. Scenes and resources store it in their header; imported assets store it in their `.import` file; 4.4+: scripts, shaders and other files with no header or `.import` file get a `<file>.uid` sidecar (`player.gd.uid`) holding the uid.
- Never invent, copy or edit a uid. Two files sharing one corrupt the uid cache in `.godot/`. To repair a bad uid, delete the `uid="..."` attribute (or the `.uid` file) and let the editor regenerate it on the next scan.
- Commit `.uid` files beside their files. Move and rename them together; when duplicating a script outside the editor, don't copy its `.uid` file.
- A new script created outside the editor gets its `.uid` file on the next editor scan or `--import`; commit it then.
- Code can load by uid (`load("uid://...")`); `ResourceUID.uid_to_path()` converts.
- "Unrecognized UID" warnings after a checkout usually mean a stale `.godot/` cache: run `godot --headless --path . --import`, or delete `.godot/` (it is regenerated).

## Safe and unsafe edits

Reasonably safe by hand:

- Change a property value on an existing node or resource.
- Rename a node plus every reference, in one pass.
- Add a `[connection]` for an existing signal and method.
- Delete a leaf node nothing references (and any sub_resource only it used).
- Add an `[ext_resource]` or `[sub_resource]` following the rules above.

Use the editor or a script instead:

- Anything that would create or change a `uid`.
- Reparenting subtrees, changing a node's type, or editing instanced-scene overrides.
- Imported or baked data (meshes, navigation, lightmaps, animation tracks with large arrays).
- Generating many nodes: write a `@tool` script or `EditorScript`.

## Merge conflicts

Don't merge `.tscn`/`.tres` hunks by hand: interleaved hunks scramble `parent=` paths and ids. Take one side whole (`git checkout --ours` or `--theirs`), then redo the other side's change in the editor or with the MCP tools. A `.gitattributes` line `*.tscn merge=binary` (or `-merge`) stops git from interleaving.

## Verify

After any hand edit, load the project headless and read stderr:

```bash
godot --headless --path . --quit 2>&1 | grep -E "ERROR|Parse Error|Failed" || echo "no load errors"
```

With the editor MCP: `open_scene` the file, `get_scene_tree`, then `run_headless` with that scene and read `diagnostics`.

## Error to cause

| Error | Usual cause |
| --- | --- |
| `Cannot open file 'res://...'` / `Failed loading resource` | An `ext_resource` path names a moved or deleted file |
| `Unrecognized UID` / `Resource file not found: uid://...` | Hand-edited uid, or a stale `.godot/` cache: reimport |
| `Parse Error: ... Expected ...` with a line number | Broken section header, unbalanced quotes or brackets |
| `Node not found: "X"` at runtime | A `parent=`, `NodePath` or `$Path` survived a rename |
| Node lost its script or texture | Its `ExtResource("id")` points at an id that no longer exists |
| Every node became a child of the root | Scrambled merge: revert and redo |
| `Signal 'x' is already connected` on load | Duplicate `[connection]` line, or code connecting an editor connection again |
