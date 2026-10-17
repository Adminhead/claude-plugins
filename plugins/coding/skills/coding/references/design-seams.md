# Seams, interfaces, and dependencies

Read this when a change adds a seam, injects a dependency, or defines an interface other code will call. For a private helper inside one module, `SKILL.md` step 3 is enough.

## What an interface includes

An interface is everything a caller must know to use the module correctly: the signature, plus invariants, ordering constraints, error modes, required configuration, and performance characteristics. Write these down where the caller will see them, because a signature alone hides the rules that cause misuse.

## Deep over shallow

A module is deep when a small interface hides a lot of behavior, and shallow when the interface is nearly as large as the implementation. Shallow modules add a hop without removing work for the caller.

- Apply the deletion test. Imagine deleting the module. If the complexity vanishes, it was a pass-through. If the complexity reappears in several callers, the module was earning its place.
- Shrink the interface before growing the implementation. Fewer methods and parameters mean fewer cases to test and fewer ways to call it wrong.
- Callers and tests cross the same seam. If a test must reach past the interface to check behavior, the module probably has the wrong shape.

## Seam placement

A seam is a place where behavior can change without editing the code at that place. One adapter means a hypothetical seam, and two means a real one, so add a port only when production and at least one other implementation (often a test double) actually differ. A single-adapter seam is just indirection.

Keep internal seams private to the module and its own tests. Exposing them through the interface to make a test easier widens the contract.

## Dependencies and what to inject

Classify each dependency to decide how the module reaches it and how tests substitute it.

| Category | Examples | Approach |
| --- | --- | --- |
| In-process | Pure computation, in-memory state | No seam. Call it directly and test through the module. |
| Local-substitutable | A database with a lightweight local stand-in, an in-memory filesystem | Use the stand-in in tests. The seam stays internal. |
| Remote but owned | Your own services across a network | Define a port, inject the transport as an adapter, and test with an in-memory adapter. |
| True external | Third-party APIs you don't control | Inject the client as a port and use a fake or recorded double in tests. |

Accept dependencies instead of constructing them inside the function, and return results instead of mutating arguments. Both make the behavior observable without patching internals.

## Public interfaces

For a new public interface, sketch two materially different shapes before choosing, for example one with a single entry point and one with several focused ones. Compare them on caller effort for the common case, how many invariants leak to callers, and where the seam sits. Do this yourself; delegate the second sketch to a subagent only when the shapes are large enough that drafting them in context would crowd out the task.
