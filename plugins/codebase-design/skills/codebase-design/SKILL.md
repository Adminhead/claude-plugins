---
name: codebase-design
description: Shared vocabulary and method for designing deep modules. Use when designing or improving a module's interface, deciding where a seam goes, finding deepening opportunities, making code more testable or AI-navigable, or when the user asks for an architecture review or to improve the codebase architecture.
---

# Codebase Design

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use this language and these principles wherever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and testability for everyone.

Adapted from Matt Pocock's `codebase-design` and `improve-codebase-architecture` skills (github.com/mattpocock/skills), with two points from Addy Osmani's `api-and-interface-design` (github.com/addyosmani/agent-skills), both MIT License; see `LICENSE`.

Not for project vocabulary (`domain-modeling`, if installed), recording a decision (`adr-writing`), or HTTP API conventions (`api-rest-design`).

## Glossary

Use these terms exactly. Don't substitute "component", "service", "API" or "boundary"; consistent language is the point.

- **Module**: anything with an interface and an implementation, at any scale: a function, class, package, or a slice across tiers. _Avoid_: unit, component, service.
- **Interface**: everything a caller must know to use the module correctly: the type signature, plus invariants, ordering constraints, error modes, required configuration and performance characteristics. _Avoid_: API, signature (both name only the type-level surface).
- **Implementation**: the code inside a module. Distinct from **adapter**: a small adapter can have a large implementation (a Postgres repo), and a large adapter a small one (an in-memory fake). Say "adapter" when the seam is the topic.
- **Depth**: leverage at the interface, the behaviour a caller or test can exercise per unit of interface it has to learn. **Deep** means much behaviour behind a small interface; **shallow** means the interface is nearly as complex as the implementation.
- **Seam** (Michael Feathers): a place where behaviour can change without editing that place; the location where a module's interface lives. Where the seam goes is its own decision. _Avoid_: boundary (overloaded with DDD's bounded context).
- **Adapter**: a concrete thing that satisfies an interface at a seam. It names a role, not what's inside.
- **Leverage**: what callers get from depth. One implementation pays back across N call sites and M tests.
- **Locality**: what maintainers get from depth. Change, bugs, knowledge and verification concentrate in one place.

A module has one interface; depth is measured against it; the seam is where it lives; adapters sit at the seam; depth yields leverage and locality.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be built from small, swappable parts that aren't part of its interface. It may have **internal seams** for its own tests as well as the **external seam** at its interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. Wanting to test past the interface means the module is the wrong shape.
- **One adapter means a hypothetical seam; two adapters mean a real one.** Don't add a seam unless something actually varies across it.
- **Contract first.** Write the interface (types, invariants, error modes) before the implementation, and review it on its own. A contract that is hard to explain will be hard to use.
- **Hyrum's law.** With enough callers, every observable behaviour becomes part of the interface whether documented or not: error text, ordering, timing, quirks. Expose deliberately, keep implementation details unobservable, and plan how a behaviour would be retired before shipping it.

When shaping an interface, ask: can it have fewer entry points, simpler parameters, more hidden inside?

## Designing for testability

1. **Accept dependencies, don't create them.** `processOrder(order, paymentGateway)` is testable; a body that calls `new StripeGateway()` is not.
2. **Return results, don't produce side effects.** `calculateDiscount(cart): Discount` beats `applyDiscount(cart): void` that mutates the cart.
3. **Small surface.** Fewer entry points mean fewer tests; fewer parameters mean simpler setup.

## Rejected framings

- **Depth as implementation lines over interface lines** (Ousterhout): rewards padding. Depth here is leverage.
- **Interface as the `interface` keyword or a class's public methods**: too narrow. It includes every fact a caller must know.
- **"Boundary"**: say seam or interface.

## Going deeper

- **Deepening a cluster given its dependencies**: read `references/deepening.md` (dependency categories, seam discipline, replace-don't-layer testing).
- **Exploring alternative interfaces for one module**: read `references/design-it-twice.md` (parallel subagents design it several radically different ways, then compare).
- **Architecture review**: only when the user asks for one ("review the architecture", "find refactor candidates", "improve the codebase architecture"), follow `references/architecture-review.md`. It scopes by hot spots, explores with the codebase-memory MCP tools, writes an HTML report of deepening candidates (`references/html-report.md`), then works through the one the user picks. Don't start it unprompted; it is long and writes a file.
