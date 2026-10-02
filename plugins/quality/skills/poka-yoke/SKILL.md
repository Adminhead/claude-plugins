---
name: poka-yoke
description: Design or audit code so a mistake cannot be expressed, rather than documenting it. Ranks every hazard on a ladder (control, warning, detection, and docs-only), applies contact, fixed-value, and motion-step lenses, and states what the new design makes impossible. After an incident it separates the defect, the mistake, and the hazard, then sweeps for other instances. Use when designing an interface, schema, or state machine to be hard to misuse, auditing for footguns, or closing a recurring bug class. Not for finding bugs already on the page (`quality:second-opinion`), language idiom (`efficient:typescript`, `efficient:python`), or schema constraints alone (`efficient:database-design`).
---

# Poka-yoke

A mistake is not the problem worth solving. The problem is letting a mistake become a defect. The remedy is a device that makes the wrong action impossible or immediately visible, not a reminder to be careful.

A comment, docstring, wiki page, review checklist, or "don't do X" line in an instructions file is not a device. It is training, and training decays as the file grows and the team changes. A check that fails the build does not decay. If a proposed fix depends on someone remembering something, keep looking for the device behind it.

## The two axes

**Axis 1: what happens when the mistake occurs.** Say which rung the code sits on today and which rung your fix reaches.

| Rung | Name | Meaning |
| --- | --- | --- |
| 1 | Control | The wrong action cannot be performed: a type error, a database constraint, a missing permission |
| 2 | Warning | It is possible but announces itself as it happens: a lint error, a runtime assertion, a confirmation that cannot be skipped |
| 3 | Detection | It happens and you find out afterward: tests, logs, monitoring, review |
| 0 | Docs only | Telling people to be careful |

Detection is sometimes all that exists. A plan that stops there should say it limits cost, not likelihood, so the likelihood gets its own item.

**Axis 2: how the device notices.** Three lenses find hazards.

- **Contact.** Can the wrong thing fit? Two adjacent parameters of the same type, a string that should be one of four values, money as a float.
- **Fixed-value.** Can an incomplete set pass? A switch with no exhaustiveness check, a missing config key that silently means "off", an enum handled in three of five places.
- **Motion-step.** Can the order be wrong, or a step skipped? A two-phase write with no transaction, a retry with no idempotency key, a resource acquired on one path and released on another.

Catch the mistake where it is made. A check three layers below the input has already let the bad value travel, and the stack trace points at the wrong module. Put validation at the boundary the value crosses.

[hazard-catalog.md](references/hazard-catalog.md) lists the recurring shapes by lens, each with its signal and device. Read it when you need vocabulary or when scanning code for hazards.

## Designing something new

A device is free before the code has callers and a migration afterward. Work from the call site, because a signature that reads well alone often reads badly where it is used.

```python
# the mistake is expressible: nothing stops refunding an unpaid order
def refund(order: dict) -> Refund: ...

# the mistake has no spelling
def refund(order: PaidOrder) -> Refund: ...
```

Apply these moves in roughly this order.

1. **Make invalid states unrepresentable.** Replace a bag of optional fields with a discriminated union of the legal variants.
2. **Parse at the boundary.** Turn unstructured input into a type that carries the proof, once, instead of re-checking a string in nine places.
3. **Give distinct concepts distinct types.** Branded types, newtypes, or keyword-only parameters stop transposed arguments.
4. **Encode the order.** Let each step return the type the next step requires, so the wrong order does not compile.
5. **Make the destructive path narrower than the safe one.** Require the scope of a delete, and let defaults mean "nothing", not "everything".

Close by naming what the design now makes impossible, and what you left possible on purpose and why. A design with unstated limits gets trusted past them.

Language mechanics (branded types, typestate, exhaustiveness helpers) belong to the language skills: `efficient:typescript`, `efficient:python`, `efficient:golang`, `efficient:rust`, and `efficient:database-design` for constraints.

## Auditing existing code

You are not hunting bugs, which are mistakes that already happened. You are hunting mistakes that are available: easy, silent, and correct-looking.

1. Scope the audit: a diff, a module, or the whole tree. For a whole tree, start at the boundaries (request handlers, jobs, migrations, config loading, payment and permission code), because that is where blast radius is highest.
2. Search with `rg` for the signals in the hazard catalog, then read the surrounding code. Text search finds shapes. Only reading finds the ones that matter.
3. For each hazard, record the location as `path:line` with a symbol, the available mistake, its consequence, the device that exists today, the device that would close it, and the rung that device reaches.
4. Rank by blast radius times ease of the mistake. An unchecked value reaching a write, delete, payment, or auth decision outranks one that can only crash cleanly.

Report three findings that matter in preference to eleven padded ones. Make no edits until the user picks items.

## After an incident

Keep three things apart, because the fix belongs to the third.

- **Defect.** What the user experienced.
- **Mistake.** The specific wrong action someone took.
- **Hazard.** The property of the system that made the mistake available.

Fixing the mistake fixes one case. Fixing the hazard fixes the class. Then sweep: search the repo for the same shape, and report the second and third instances. That is the difference between a patch and a lesson.

Attribute the cause to the system. "Someone made a mistake" sounds complete, predicts nothing, and ends the investigation early.

## Pitfalls

- **Accepting docs as the fix.** "Add validation", "be careful here", and "document the invariant" each have a real device behind them. Name it.
- **Confusing unbypassable with unbypassed.** A pre-commit hook skips with `--no-verify` and needs CI behind it to be a gate. Say which one you propose.
- **Over-fitting to one incident.** Every device needs maintenance. Check that the shape is common enough to earn it.
- **Calling monitoring prevention.** It lowers cost, not likelihood.
- **Optional safety.** An optional idempotency key, an opt-in confirmation, or a flag that must be passed to be safe is docs-only wearing a costume. Make safe the default or make the argument required.
