# Architecture review

Adapted from `improve-codebase-architecture` in github.com/mattpocock/skills (MIT License).

Run this only when the user asks for an architecture review or for refactor candidates. It surfaces architectural friction and proposes **deepening opportunities**: refactors that turn shallow modules into deep ones, for testability and AI-navigability.

Use the vocabulary in the `codebase-design` SKILL.md exactly (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, the interface is the test surface, one adapter is a hypothetical seam). Don't drift into "component", "service", "API" or "boundary". The project's `GLOSSARY.md` names the domain concepts that make good seams, and its ADRs record decisions this review should not re-litigate.

## 1. Scope before you scan

Deepening pays off by making future changes easier, so weight the parts of the codebase that change. Decide where to look first:

- If the user named a direction (a module, a subsystem, a pain point), take it.
- Otherwise walk back a good stretch of history (`git log --oneline --name-only`) and let the files that keep changing pull your attention. If changes are scattered, widen the net.

Read `GLOSSARY.md` (or `GLOSSARY-MAP.md`) and any ADRs in the area before exploring (`adr-writing`'s `new_adr.py --list` shows them, if installed).

## 2. Explore with the graph

Explore it yourself with the codebase-memory MCP tools; don't send a subagent on a file-by-file walk. Find the project with `list_projects`; if the repo isn't indexed, run `index_repository` on it first (or ask the user to). Then:

- `get_architecture` with `aspects: ["overview", "hotspots", "boundaries", "clusters", "cycles"]` (and `path` to narrow to the scoped directory) for packages, entry points, high fan-in and fan-out symbols, clusters that move together, and import cycles.
- `search_graph` to find candidates by shape: `min_degree` for symbols everything leans on, `max_degree: 1` with a `file_pattern` for thin pass-throughs, `name_pattern` (for example `.*(Handler|Manager|Helper|Util|Wrapper).*`) for likely shallow modules, `query` for a domain concept from the glossary.
- `trace_path` on a candidate (`direction: "outbound"` for what it calls, `"inbound"` for its callers, `depth` 2-4) to see how far a single concept spreads and where it leaks across seams.
- `get_code_snippet` to read the few symbols that matter, and `search_code` or grep for literals.

Check `check_index_coverage` for each file a candidate rests on; read uncovered lines directly. Without codebase-memory, read the scoped files directly and say the review is narrower.

Note where you feel friction rather than following fixed rules:

- Where does understanding one concept mean bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where were pure functions extracted for testability while the bugs hide in how they're called (no **locality**)?
- Where do tightly coupled modules leak across their seams?
- What is untested, or hard to test through its current interface?

Apply the **deletion test** to anything that looks shallow: would deleting it concentrate complexity, or only move it? "Concentrates" is the signal you want.

## 3. Present candidates as an HTML report

Write one self-contained HTML file outside the repo: `${TMPDIR:-/tmp}/architecture-review-<timestamp>.html`. Tell the user the absolute path and offer to open it (`xdg-open` on Linux, `open` on macOS). Follow `html-report.md` for the scaffold, diagram patterns and style.

Each candidate gets a card with:

- **Files**: the modules involved.
- **Problem**: why the current shape causes friction.
- **Solution**: what would change, in plain English.
- **Benefits**: in terms of locality and leverage, and how tests improve.
- **Before / after diagram**.
- **Recommendation strength**: `Strong`, `Worth exploring` or `Speculative`.

End with a **Top recommendation**: which candidate to tackle first and why. Name things with the glossary's domain words ("the Order intake module", not "the FooBarHandler" or "the Order service").

**ADR conflicts**: surface a candidate that contradicts an ADR only when the friction is real enough to reopen it, and mark it in the card ("contradicts ADR-0007, but worth reopening because ..."). Don't list every refactor an ADR forbids.

Don't propose interfaces yet. After writing the file, ask: "Which of these would you like to explore?"

## 4. Work through the chosen candidate

Once the user picks one, stress-test it with them question by question (the `planning` skill's stress-test, if installed): constraints, dependencies and their category (`deepening.md`), the shape of the deepened module, what sits behind the seam, which tests survive.

Keep the domain model current as decisions settle (the `domain-modeling` skill, if installed):

- **Naming the deepened module after a concept missing from `GLOSSARY.md`?** Add the term; create the file if needed.
- **Sharpening a fuzzy term?** Update `GLOSSARY.md` right there.
- **User rejects the candidate for a load-bearing reason?** Offer an ADR (`adr-writing`): "Want me to record this as an ADR so future reviews don't suggest it again?" Skip ephemeral reasons ("not now") and self-evident ones.
- **Want alternative interfaces?** Use `design-it-twice.md`.
