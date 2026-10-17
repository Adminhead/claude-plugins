# Writing for agents

Read this before drafting or pruning any document an agent consumes: a skill, a CLAUDE.md, or a doc reached through a pointer. The packaging differs, but the levers are the same.

## Context pointers

A context pointer is any line in context that names material outside it and says when to reach it. A skill description is one, and so is a CLAUDE.md line that names a doc. The wording, not the target, decides when and how reliably Claude follows it. If a must-have target sits behind a weak pointer, sharpen the wording first and inline the material only when that fails.

A pointer states what the material is and lists the branches that should trigger it.

- Put the leading word first, since that is where triggering happens.
- Give one trigger per branch. Synonyms for one branch are one branch written twice.
- Cut identity the body already carries.

Always-loaded pointers cost tokens every turn, so prune them harder than body text.

## Two loads

Every document spends one of two budgets. Context load is the cost of always-loaded text on the window. Cognitive load is the cost on the person, who has to remember which documents exist and when to use them. Text behind a pointer escapes context load for the price of the pointer line. Text with no pointer rides on the person's memory, which is acceptable only when a human judgment belongs there.

## Where each piece sits

Documents mix steps (ordered actions) and reference (rules and facts consulted on demand). Rank each piece by how immediately Claude needs it:

1. In-file steps, the primary tier.
2. In-file reference, consulted on demand. A flat list of review rules is fine here.
3. Disclosed reference in a separate file, reached through a pointer.

Inline what every branch needs and push behind a pointer what only some branches reach. Reference buried among steps makes Claude's attention to those steps a coin flip. Keep a concept's definition, rules, and caveats under one heading so reading one part brings the rest.

## Steps and completion criteria

End every step with a criterion that tells Claude it is done. A vague bound ("understanding reached") invites premature completion, because the visible later steps pull attention forward. Sharpen the bound first. Only if it stays fuzzy and you observe rushing, split the sequence across a real context boundary such as a subagent hand-off, since splitting inside one context leaves the later steps visible.

Demand matters as much as clarity. "Every modified model accounted for" forces more digging than "produce a change list". The strongest criteria are checkable and exhaustive.

## Leading words

A leading word is a compact concept the model already knows (a tight loop, a tracer bullet, a red test). Repeat it as a token and it recruits what the model already holds, replacing a sentence that gestures at the idea. Prefer an existing word over a coined one, since a coined word needs a definition. A word too weak to beat the default (such as "be thorough") changes nothing, so use a stronger one or delete it.

## Emphasis, reasons, and framing

- Write plain imperatives and add the reason when it is not obvious, since Claude generalizes from a reason to cases you did not list. Newer models follow instructions closely, so capitals and boosters such as MUST or CRITICAL tend to cause over-application.
- State the target behavior ("write one-line comments") before the prohibition. Naming the forbidden behavior alone makes it more available.
- Keep explicit never-rules for costly or irreversible errors, and pair each with the positive action to take instead.

## Pruning

- Keep each meaning in one place. Duplication costs tokens and inflates the meaning's prominence.
- The environment is a source of truth too. Scripts in `package.json`, config files, directory layout, and `--help` output do not need restating. Cache only what Claude cannot find by looking: unwritten conventions, the reason behind a choice, the trap no config reveals.
- Check each line for relevance. A line goes stale by never bearing on the task or by describing behavior that changed. Without pruning, a document turns into sediment, because adding feels safe and removing feels risky.
- Hunt no-ops sentence by sentence. An instruction the model already obeys pays load to say nothing. The test is relative to the model, so settle disagreements by running the document, and delete the whole sentence when it fails.

## Invocation

- A model-invoked skill keeps a description loaded permanently in exchange for discoverability. Pick it when Claude must reach the skill on its own or another skill must reach it.
- A user-invoked skill (`disable-model-invocation: true`) costs no context but spends the person's memory. Use it for workflows that only ever start by hand, and write its description for a human as a one-line summary.
- When hand-invoked skills multiply past what you can remember, add one router skill that names the others and when to use each. It can only hint, because nothing but the person can start a user-invoked skill.
- Reference that two user-invoked skills both need lives in a plain file outside the skill system, since neither can load the other.
