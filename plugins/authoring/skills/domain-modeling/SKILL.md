---
name: domain-modeling
description: Build and sharpen a project's domain model in conversation by challenging terms, resolving fuzzy language, testing edge cases, and writing a GLOSSARY.md as terms settle. Use when discussing codebase terminology, naming a concept, resolving overloaded words like "account" or "order", or creating or editing a GLOSSARY.md. Not for recording an architecture decision (authoring:adr-writing) or mapping an unfamiliar repo (authoring:map-codebase).
---

# Domain Modeling

Change the project's model deliberately, and write each result down the moment it settles. Reading `GLOSSARY.md` for vocabulary needs no skill. Use this one when the model itself is being decided or corrected.

## Where the files live

- A single-context repo keeps one `GLOSSARY.md` at the root.
- A multi-context repo keeps a `GLOSSARY-MAP.md` at the root that lists each context, where its glossary lives, and how the contexts relate, plus one `GLOSSARY.md` per context. Read the map first, and ask which context a topic belongs to when it is unclear.
- Create a glossary when the first term is resolved, not before. Read `references/glossary-format.md` before writing or editing one.
- ADRs follow `authoring:adr-writing` (if installed), including its location rules for `docs/adr/`.

## During the session

1. **Challenge terms against the glossary.** When the person's word conflicts with a definition, say so at once: "The glossary defines cancellation as X, but you seem to mean Y. Which is it?"
2. **Sharpen fuzzy language.** When a term is vague or overloaded, propose one canonical word and name the distinction: "Do you mean the Customer or the User?"
3. **Stress-test with scenarios.** Invent concrete edge cases that probe the boundary between two concepts (a partial refund, a customer who changes organizations) and ask the person to settle each.
4. **Cross-reference the code.** When the person states how something works, check the code. Surface any contradiction: "The code cancels whole Orders, but you described partial cancellation. Which is right?"
5. **Update the glossary inline.** Write each resolved term immediately, so the glossary never lags the conversation. A term is done when the person has confirmed the definition and its `_Avoid_` words.
6. **Offer an ADR sparingly.** Propose one only when the choice is hard to reverse, would surprise a future reader, and was a real trade-off. If any of the three is missing, record nothing beyond the glossary.

## What stays out of the glossary

The glossary defines language and nothing else. Keep out implementation detail, specs, scratch notes, and decisions about how something is built. General programming concepts (timeouts, error types) do not belong, even when the project uses them heavily.

## Done when

- Every term raised in the session is defined, merged into an existing term, or deliberately left out.
- Each code contradiction found is either fixed in the model or listed for the owner.
- The glossary diff has been shown to the person.
