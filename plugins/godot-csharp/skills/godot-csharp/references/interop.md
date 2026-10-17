# C# and GDScript interop, collections and exports

Checked against the Godot 4.7 docs (cross-language scripting, C# API differences, C# exports).

## Calling GDScript from C#

C# is statically typed, so it reaches GDScript members by name through `GodotObject`. Use the GDScript (snake_case) names.

```csharp
GodotObject enemy = GetNode("Enemy");                 // a node with a GDScript attached
enemy.Call("take_damage", 25);                        // method
float hp = enemy.Get("health").AsSingle();            // property read
enemy.Set("is_stunned", true);                        // property write
enemy.Connect("died", Callable.From(OnEnemyDied));    // GDScript signal (see signals.md)
```

Pass only types GDScript knows: built-in Variant types and `GodotObject` subclasses.

## Calling C# from GDScript

GDScript sees C# members **under their C# names**, not converted to snake_case:

```gdscript
var stats := $Player            # Player.cs
print(stats.MaxHealth)          # property, PascalCase as declared in C#
stats.TakeDamage(10)            # method
stats.HealthChanged.connect(_on_health_changed)   # C# [Signal], also by its C# name
```

- A `[GlobalClass]` C# type is usable by name in GDScript and appears in the Create Node or New Resource dialog: `var data := WeaponData.new()`. Put it on a `Node` or `Resource` subclass.
- A C# class without `[GlobalClass]` can still be handled as an `Object` reference or loaded as a script: `load("res://Weapon.cs").new()`.
- Only `public` members are visible, and parameter and return types must be Variant-compatible.

## Variant marshalling

| Case | What happens | Do this |
| --- | --- | --- |
| GDScript passes `null` | C# receives a Variant of type `Nil` | Check `v.VariantType == Variant.Type.Nil` |
| C# returns `int[]` | GDScript receives a `PackedInt32Array` | Fine for numbers; return `Godot.Collections.Array<T>` when GDScript expects an `Array` |
| C# passes `List<T>` or a plain C# class | Not marshallable, so the call fails | Convert to `Godot.Collections.Array<T>`; wrap data in a `RefCounted` or `Resource` subclass |
| Reading a Variant | | `v.As<T>()` or `v.AsInt32()`, `v.AsSingle()`, `v.AsString()`, `v.AsGodotDictionary()` |

## Godot collections versus System collections

- `Godot.Collections.Array`, `Dictionary`, `Array<T>` and `Dictionary<TKey, TValue>` are Variant-backed. They can be exported, passed to engine APIs and shared with GDScript. Each access marshals, so they are slow in hot loops.
- `System.Collections.Generic.List<T>` and `Dictionary<K,V>` are fast but can't be exported or passed where the engine expects a Variant.
- Keep the C# types inside your logic and convert at the boundary: `new Godot.Collections.Array<int>(myList)`.

## Export attributes

```csharp
[Export] public int Lives { get; set; } = 3;
[Export(PropertyHint.Range, "0,100,1")] public int Percent { get; set; }
[Export(PropertyHint.Range, "0,1,0.01,or_greater")] public float Gain { get; set; } = 1f;
[Export(PropertyHint.File, "*.json")] public string DataPath { get; set; } = "";
[Export] public Godot.Collections.Array<PackedScene> Waves { get; set; } = new();
[Export] public Node2D Target { get; set; } = null!;       // node reference, survives renames
[Export] public Weapon Kind { get; set; }                  // a C# enum shows as a dropdown

[ExportGroup("Movement")]
[Export] public float Speed { get; set; } = 200f;
[ExportSubgroup("Air")]
[Export] public float AirControl { get; set; } = 0.4f;
[ExportCategory("Debug")]
[Export] public bool ShowGizmos { get; set; }
```

- Export properties (`{ get; set; }`) rather than fields so the C# style matches the engine API. Both work.
- An exported property's type must be a Variant-compatible type: primitives, Godot structs, `GodotObject` subclasses, Godot collections, or enums.
- Read Inspector values in `_Ready()`, not in field initializers. Initializers run before the scene's stored values are applied.

## A custom Resource

```csharp
using Godot;

[GlobalClass]
public partial class ItemData : Resource
{
    [Export] public string DisplayName { get; set; } = "Item";
    [Export] public int Value { get; set; }
    [Export] public Texture2D Icon { get; set; } = null!;
}
```

Load with `GD.Load<ItemData>("res://items/sword.tres")`. A loaded Resource is shared by everyone who loads it, so call `Duplicate()` (or `Duplicate(true)` for nested resources) before changing per-instance state.

## GDScript to C# lookup

| GDScript | C# |
| --- | --- |
| `extends Node` | `public partial class X : Node` |
| `signal hit(amount: int)` | `[Signal] public delegate void HitEventHandler(int amount);` |
| `@export var speed := 100.0` | `[Export] public float Speed { get; set; } = 100f;` |
| `match v:` | `switch` (with pattern matching) |
| `emit_signal("hit", 3)` / `hit.emit(3)` | `EmitSignal(SignalName.Hit, 3)` |
| `randf()` / `randi()` | `GD.Randf()` / `GD.Randi()` |
| `deg_to_rad(d)` | `Mathf.DegToRad(d)` |
| `call_deferred("f")` | `CallDeferred(MethodName.F)` or `Callable.From(F).CallDeferred()` |
| `get_tree().create_timer(1.0).timeout` | `ToSignal(GetTree().CreateTimer(1.0), SceneTreeTimer.SignalName.Timeout)` |
