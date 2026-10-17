# Signals in C#

Checked against the Godot 4.7 C# signals page. The disconnection rules below are the ones the docs state.

## Declare and emit

```csharp
public partial class Player : CharacterBody2D
{
    [Signal] public delegate void HealthChangedEventHandler(int current, int max);  // signal "HealthChanged"
    [Signal] public delegate void DiedEventHandler();                               // signal "Died"

    public void Hurt(int hp, int max)
    {
        EmitSignal(SignalName.HealthChanged, hp, max);
        if (hp == 0)
            EmitSignal(SignalName.Died);
    }
}
```

- The delegate name must end in `EventHandler`, or the build fails with GD0201. The engine-facing name drops the suffix.
- The generator creates a C# `event` of the delegate type and a `SignalName.HealthChanged` constant.
- Parameters must be Variant-compatible: primitives, `string`, Godot structs (`Vector2`, `Color`), `GodotObject` subclasses, and Godot collections. To send a bundle of values, wrap it in a `RefCounted` or `Resource` subclass, not a plain C# class or struct.
- `EmitSignal` checks the argument count and types at run time, not at compile time.

## Connect

```csharp
public override void _EnterTree()
{
    _player.HealthChanged += OnHealthChanged;            // C# event syntax
    _player.Died += OnDied;
}

public override void _ExitTree()
{
    _player.HealthChanged -= OnHealthChanged;            // required for custom signals, see below
    _player.Died -= OnDied;
}

private void OnHealthChanged(int current, int max) { /* ... */ }
private void OnDied() { /* ... */ }
```

- Connect in `_Ready()`, which runs once, or in `_EnterTree()` for a node that leaves and re-enters the tree. Pair `_EnterTree` with `_ExitTree`. Never connect in a constructor or field initializer.
- To keep a lambda for disconnecting later, store it as the **generated delegate type**: `private Player.ItemCollectedEventHandler _onItem;` then `_player.ItemCollected += _onItem;`. An `Action<string>` field does not compile against the generated event.
- For a one-shot connection, use `Connect(SignalName.X, Callable.From(Handler), (uint)ConnectFlags.OneShot)`.
- Don't `+=` the same handler twice; the handler then runs twice per emit.

## When Godot disconnects for you

When any `GodotObject` is freed, Godot disconnects its connections, both as emitter and as receiver. There are two exceptions, both when **the receiver is freed while the emitter lives on**:

1. **A custom `[Signal]` connected with `+=`.** Built-in engine signals connected with `+=` to a method are cleaned up; your own signals are not.
2. **A lambda that captures a variable**, connected with `+=` or with `Connect`. Godot finds the owner through `Delegate.Target`, and a capturing lambda's target is a compiler-generated closure, not the node.

In both cases the next emit calls into a disposed object and throws `ObjectDisposedException`. The fixes:

- Disconnect with `-=` in `_ExitTree()` (or in `Dispose()`).
- Or connect a custom signal with `Connect`, which **is** disconnected automatically for a method handler: `Target.Connect(MyClass.SignalName.MySignal, Callable.From(OnMySignal));`.
- Guard `-=` with `IsInstanceValid(_player)` when the emitter may already be gone.

Freeing emitters before their receivers is always safe.

## Await a signal

```csharp
var args = await ToSignal(this, SignalName.HealthChanged);   // Variant[] of the arguments
int current = args[0].AsInt32();
```

`ToSignal` returns a `SignalAwaiter`, not a `Task`. To race it against a timeout, wrap it in an async method that returns a `Task`:

```csharp
private async Task<Variant[]> AsTask(GodotObject source, StringName signal) => await ToSignal(source, signal);

public async Task<bool> WaitForDeathAsync(double seconds)
{
    var died = AsTask(_player, Player.SignalName.Died);
    var timeout = AsTask(GetTree().CreateTimer(seconds), SceneTreeTimer.SignalName.Timeout);
    return await Task.WhenAny(died, timeout) == died;
}
```

A signal that has already fired won't fire again for a late `await`, so start awaiting before the action that triggers it.

## Signals declared in GDScript

There is no `SignalName` constant for a GDScript signal on the C# side. Use its snake_case name and a `Callable` whose parameter types match:

```csharp
_score = GetNode("/root/ScoreManager");                       // GDScript autoload
_score.Connect("score_changed", Callable.From<int>(OnScoreChanged));
```

Disconnect with the same name and a `Callable` to the same method in `_ExitTree()`.

## Static C# events

A `public static event Action<int> ScoreChanged;` on a static class is fine when every producer and consumer is C#. GDScript can't see it, the editor can't connect it, and `ToSignal` can't await it. Every subscriber must `-=` in `_ExitTree()`, or the static event keeps freed nodes alive and calls into them. Use `[Signal]` whenever GDScript or the editor is involved.
