---
name: godot-addons
description: Godot addon APIs for Beehave and LimboAI behavior trees, Phantom Camera and Dialogue Manager v4. Use when a project has addons/beehave, addons/limboai, addons/phantom_camera or addons/dialogue_manager, or when choosing, installing or writing code and .dialogue files for one of them.
---

# Godot addons

Covers four widely used MIT addons for Godot 4. Each has its own reference; read only the one the task needs.

| Addon | Folder | Read | Use it for |
|---|---|---|---|
| Beehave | `addons/beehave/` | [references/beehave.md](references/beehave.md) | Behavior trees built from scene-tree nodes, pure GDScript |
| LimboAI | `addons/limboai/` | [references/limboai.md](references/limboai.md) | Behavior trees as resources plus a hierarchical state machine, C++ (GDExtension or engine module) |
| Phantom Camera | `addons/phantom_camera/` | [references/phantom-camera.md](references/phantom-camera.md) | Several camera "shots" switched by priority, with follow modes and tweened transitions |
| Dialogue Manager | `addons/dialogue_manager/` | [references/dialogue-manager.md](references/dialogue-manager.md) | Branching dialogue written as `.dialogue` script files |

Each reference starts with an "Addon vX checked against Godot 4.x" line. The versions and dates live there, not here.

## Workflow

1. **Detect.** List `addons/` and read the addon's `plugin.cfg` `version=`. Compare it with the reference's checked version. If the major or minor version differs, say so and check the addon's changelog before relying on an API detail. Dialogue Manager 3.x and 4.x use different syntax.
2. **Confirm it is enabled.** `project.godot` lists it under `[editor_plugins] enabled=PackedStringArray(...)`. If it is missing, enabling it is one line there or a tick in Project Settings → Plugins. Phantom Camera and Dialogue Manager register their autoloads on enable, so never add them by hand.
3. **Read the matching reference** and follow its checklist.
4. **Write GDScript first.** Each reference has a short C# note where the addon's C# story differs. General C# idioms belong to `godot-csharp`.
5. **Verify** by running the scene from the editor (or the editor MCP's run tools, if `godot-mcp-setup` was done) and watching the addon's own debugger tab: Beehave and LimboAI both ship one, and Dialogue Manager 4 has a state debugger panel.

## Choosing an addon

- **No addon yet, AI requested.** For fewer than about five states, use a plain state machine (see `godot`'s patterns reference). For a behavior tree in a GDScript-only project, use Beehave. Pick LimboAI when you also want a hierarchical state machine, the visual BT editor, or C# tasks (C# needs the LimboAI module build). Behavior-tree theory and when to use one at all are in `game-ai`.
- **Camera.** For one camera with a simple follow or shake, hand-roll it (`game-feel` covers the technique). Use Phantom Camera when a scene needs several shots that take over by priority, such as gameplay, a cutscene framing and a boss group shot.
- **Dialogue.** Use Dialogue Manager when writers should author branching dialogue as text with conditions, mutations and translation keys. Hand-rolled data, Ink or Yarn are in `game-genres`' dialogue reference.

## Installing an addon

- Prefer the Godot Asset Library from the editor, or the addon's GitHub release zip. Copy only the `addons/<name>/` folder into the project.
- Never run scripts from a downloaded archive. Copy files and let the editor import them.
- Commit `addons/<name>/` with its `.uid` sidecars. Pin the version you tested. Phantom Camera is pre-1.0, so its minor bumps can break the API.
- After a major upgrade (Dialogue Manager 3 to 4), close the editor, delete `.godot/`, and reopen so the import cache rebuilds.

## Gotchas

- Beehave keeps its own per-run state on the blackboard keyed by the actor's instance id. Do the same for leaf state, and reset it in `before_run`/`after_run`/`interrupt`, so restarts and interrupted runs start clean.
- LimboAI's GDExtension build cannot be used from C#. Only the module build ships the NuGet package.
- A Phantom Camera `PhantomCameraHost` must be a **child** of the real `Camera2D`/`Camera3D`. PCam nodes never render on their own.
- Dialogue Manager 4 renamed titles to **cues**, made response conditions self-closing (`[if cond /]`), and replaced `set`/`do` with `$>`. Code or docs written for 3.x will not parse cleanly.
- Dialogue Manager's C# events stay silent until C# code touches `DialogueManager.Instance` (the bridge is lazy).

Adapted from GodotPrompter (MIT, jame581/GodotPrompter), skills `beehave`, `limboai`, `phantom-camera` and `dialogue-manager`; see `NOTICE`.
