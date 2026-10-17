---
name: godot-csharp
description: Writes and fixes C# in Godot 4 .NET projects: partial node classes, the PascalCase lifecycle, [Export], [Signal] events, GDScript interop, the .csproj and the build. Use for .cs or .csproj files beside project.godot, "port this GDScript to C#", GD0201 errors, or ObjectDisposedException after a signal.
license: Apache-2.0 AND MIT
---

# Godot C#

Written for Godot 4.x .NET, checked against 4.7. This skill covers the C# side of a Godot project. Scenes, nodes, resources and GDScript belong to the `godot` skill, tests to `godot-testing`, export presets to `godot-export`, and `[Rpc]` and netcode to `godot-multiplayer`.

Related plugins, if installed: `csharp` for general C# design, nullable and async rules; `msbuild` for build failures and `.csproj` properties; `dotnet-testing` for unit tests of plain C# logic that doesn't need the engine.

## Orient first

1. Read `config/features` in `project.godot`. The first entry is the engine version (`"4.7"`), and a .NET project also lists `"C#"`. Follow that version, not the newest one.
2. Read the root `.csproj`:
   - `Sdk="Godot.NET.Sdk/<version>"` must match the editor version (a 4.7.x editor wants a 4.7.x SDK). Never copy a pin such as `4.3.0` from an example.
   - `TargetFramework` sets the .NET version: `net8.0` is the minimum, and Android exports need `net9.0` or later (since 4.5). It also fixes the C# language version (net8.0 is C# 12). Don't raise the TFM, the SDK or `LangVersion` unless asked.
3. C# needs the .NET build of the Godot editor plus a .NET SDK (`dotnet --version`). The standard editor can't build or run C#.
4. **If the `godot-editor` MCP tools are available**, follow the project's `godot-mcp` skill for editor work:
   - `get_project_info` reports `dotnet`.
   - `create_dotnet_project` writes the root `.csproj` and `.sln` when there are none.
   - `build_dotnet` is the only check for C# errors. `create_script` returns no diagnostics for `.cs`, and `validate_script` handles `.gd` only. Give `extends` in its C# spelling (see the rules below).
   - After a build, wait a second before attaching the script with `update_property`.
5. Without the MCP, run `dotnet build` in the project root. The editor loads the Debug output from `.godot/mono/temp/bin/Debug`. For definitions and references use codebase-memory if the repo is indexed (`search_graph`, `get_code_snippet`), then the C# language server, then Grep.

## Rules that break the build or fail silently

- **`partial` on every class that derives from a Godot type**, intermediate base classes included. The source generators add the signal, export and RPC plumbing; without `partial` they report GD0001 and exports or signals don't register.
- **The class name matches the file name** (`Player.cs` holds `Player`). Namespaces are free.
- **Lifecycle overrides use PascalCase and `double` delta:** `_Ready()`, `_EnterTree()`, `_ExitTree()`, `_Process(double delta)`, `_PhysicsProcess(double delta)`, `_Input(InputEvent @event)`, `_UnhandledInput(InputEvent @event)`. Always write `override`, so a misspelt name fails to compile instead of never running.
- **Engine names are PascalCase, and getters and setters become properties:** `is_on_floor()` becomes `IsOnFloor()`, and `set_name("x")` becomes `Name = "x"`. Some class names change spelling: `Object` is `GodotObject`, `GPUParticles2D` is `GpuParticles2D`, `HTTPRequest` is `HttpRequest`, `JSON` is `Json`. Two-letter acronyms stay upper case (`UI`, `OS`). A wrong name surfaces as CS0246 from the build.
- **Structs are values.** `Vector2`, `Vector3`, `Color` and `Transform2D` are structs. Copy, change, assign back: `var v = Velocity; v.Y += g * (float)delta; Velocity = v;`.
- **Signal delegates end in `EventHandler`**, or the build fails with GD0201. Emit with `EmitSignal(SignalName.X, ...)`.
- **A custom `[Signal]` connected with `+=` is not disconnected when the receiver is freed.** The next emit throws `ObjectDisposedException`. Pair it with `-=` in `_ExitTree()`, or connect with `Connect(SignalName.X, Callable.From(Handler))`, which does auto-disconnect. A lambda that captures a variable has the same problem with either form. See [references/signals.md](references/signals.md).
- **Scene tree on the main thread only.** `Task.Run` is for pure C# work. An `await` in a node method resumes on the main thread because Godot installs a synchronization context, so don't add `ConfigureAwait(false)` before touching nodes. Hand results from other threads back with `CallDeferred`.
- **`async void` only for handlers the engine calls.** Everything else returns `Task`, so exceptions are not lost.
- **`#if TOOLS` only around editor-only classes** (an `EditorPlugin`, an inspector plugin). Wrapping a runtime `[Tool]` node removes it from exports and breaks every scene that uses it.

## A node script

```csharp
using Godot;

public partial class Player : CharacterBody2D
{
    [Signal] public delegate void HealthChangedEventHandler(int current, int max);

    [Export] public float Speed { get; set; } = 200f;
    [Export] public float JumpVelocity { get; set; } = -400f;
    [Export] public int MaxHealth { get; set; } = 100;

    private static readonly StringName JumpAction = "jump";   // no allocation per frame
    private float _gravity;
    private int _health;
    private AnimatedSprite2D _sprite = null!;

    public override void _Ready()
    {
        _health = MaxHealth;                                   // Inspector value, read after load
        _gravity = (float)ProjectSettings.GetSetting("physics/2d/default_gravity");
        _sprite = GetNode<AnimatedSprite2D>("%Sprite");
    }

    public override void _PhysicsProcess(double delta)
    {
        var v = Velocity;
        if (!IsOnFloor())
            v.Y += _gravity * (float)delta;
        if (Input.IsActionJustPressed(JumpAction) && IsOnFloor())
            v.Y = JumpVelocity;
        float dir = Input.GetAxis("move_left", "move_right");
        v.X = dir != 0 ? dir * Speed : Mathf.MoveToward(v.X, 0, Speed);
        Velocity = v;
        MoveAndSlide();
    }

    public void TakeDamage(int amount)
    {
        _health = Mathf.Max(_health - amount, 0);
        EmitSignal(SignalName.HealthChanged, _health, MaxHealth);
    }
}
```

## Idioms

| Need | C# |
| --- | --- |
| `@onready var x = $Path` | Field set in `_Ready()`: `GetNode<T>("Path")` or `GetNode<T>("%Unique")`. An `[Export]` node reference survives renames. |
| `preload` / `load` | `GD.Load<PackedScene>("res://x.tscn")`, kept in a field; then `Instantiate<T>()` |
| `await obj.signal` | `await ToSignal(obj, ClassName.SignalName.X)`; a timer: `await ToSignal(GetTree().CreateTimer(0.5), SceneTreeTimer.SignalName.Timeout)` |
| `class_name` | `[GlobalClass]` on a `Node` or `Resource` subclass |
| `@tool` | `[Tool]`. It needs a build before the editor runs it. |
| `print` / `push_error` | `GD.Print`, `GD.PushError`, `GD.PushWarning` (`Console` output may not reach the Output panel) |
| `is_instance_valid(o)` | `GodotObject.IsInstanceValid(o)`. A freed object throws `ObjectDisposedException`. |
| `queue_free()` | `QueueFree()`; prefer it to `Free()`, as in GDScript |
| Variant to a C# type | `v.As<T>()`, `v.AsInt32()`, `v.AsSingle()`, `v.AsGodotDictionary()` |

For calls between C# and GDScript, `Godot.Collections` versus `System.Collections`, export attributes and Variant marshalling, read [references/interop.md](references/interop.md).

## Performance

- C# wins on tight loops (pathfinding, procedural generation, simulation). Calls into engine APIs cost the same from either language.
- Allocation in `_Process` and `_PhysicsProcess` causes GC hitches. Cache `StringName`s and `NodePath`s as `static readonly` fields, use the generated `SignalName`, `MethodName` and `PropertyName` constants instead of strings, and avoid LINQ, closures and new arrays per frame.
- `Godot.Collections.Array` and `Dictionary` marshal on every access. Use `List<T>` and `Dictionary<K,V>` inside C# code and convert at the engine boundary.

## Platforms and versions

- **C# can't export to the web in Godot 4.** Android and iOS are experimental, and an iOS export needs a macOS host. Exports bundle the .NET runtime, so players don't install .NET.
- Project file, NuGet, IDE setup and export notes: [references/project-and-build.md](references/project-and-build.md).
- **4.7 C# breaking changes** (from the 4.6 to 4.7 migration guide):
  - `Animation.Length` is now `double`, so `float len = anim.Length;` no longer compiles (GH-116394).
  - `Control.AccessibilityLive` is typed `AccessibilityServer.AccessibilityLiveMode`, not the `DisplayServer` enum (GH-116839).
  - `RichTextLabel.ImageUpdateMask.WidthInPercent` became `WidthUnit`. The `AddImage`/`UpdateImage` parameters `widthInPercent`/`heightInPercent` became `widthUnit`/`heightUnit` of type `RichTextLabel.ImageUnit` (GH-112617).
  - The `EditorSceneFormatImporter` `Import*` constants moved into the `ImportFlags` enum (GH-115788).
  - `AudioEffectSpectrumAnalyzer.TapBackPos` was removed (GH-114355).
  - `OptimizedTranslation.Generate()` returns `bool`, so rebuild any binary that calls it (GH-119563).

  Rebuild against the new SDK and fix what the build reports. The `godot` skill's version notes hold the per-version list.

## Tests

- Engine-free logic (damage formulas, inventory rules) goes into plain C# classes that a normal xUnit, NUnit or MSTest project can test. Use `dotnet-testing` if installed.
- Code that needs nodes or the scene tree is tested inside Godot with gdUnit4's C# support. Use the `godot-testing` skill.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Script attached but `_Ready` never runs | Missing `override` and a misspelt name, or a stale build | Add `override`; rebuild |
| Exported property missing from the Inspector | Class not `partial`, a field type that isn't a Variant type, or no build since the change | Make it `partial`, use a Godot type, rebuild |
| `ObjectDisposedException` on emit | `+=` on a custom signal, or a capturing lambda, from a freed receiver | `-=` in `_ExitTree()`, or `Connect` with `Callable.From` |
| Handler fires twice | `+=` ran twice, often in `_EnterTree` of a node re-added to the tree | Pair every connect with a disconnect |
| `GetNode` returns null after a refactor | Path changed | `%Unique` names or `[Export]` node references |
| GDScript can't find a C# member | Wrong case | GDScript uses the C# name as written: `node.MaxHealth`, `node.TakeDamage(1)` |
| Build fails with an unknown engine type | GDScript spelling of a renamed class | Use the C# spelling (`GodotObject`, `GpuParticles2D`, `HttpRequest`) |

Adapted from awesome-gamedev-agent-skills `godot-csharp` (Apache-2.0) and GodotPrompter `csharp-godot` and `csharp-signals` (MIT). See NOTICE.
