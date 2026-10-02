# Progressive disclosure

Read this before moving content out of `SKILL.md`, adding a reference file, or deciding whether a long skill needs splitting.

## Triggering and disclosure are separate problems

Triggering is whether Claude loads the skill at all, and only the description drives it. Disclosure is what loads afterward. `SKILL.md` loads whole, a reference loads only when `SKILL.md` points Claude at it, and a script runs without entering context. Splitting files never fixes a routing failure, so send that problem to `references/descriptions.md`.

## Default to one file

A single `SKILL.md` has one load, no routing prose, no risk that Claude skips a needed reference, and one place to maintain. Split when the content passes one of these tests:

- Some invocations never need it, and you can name the user-visible signal that says so.
- Transcripts show Claude spending context on sections irrelevant to the task.
- It is large reference data consulted by key.

Length alone does not meet the bar. A long skill whose parts are used together stays whole. Claude Code's guidance is to stay under 500 lines. Treat that as a guide and ask whether each line earns its place on every load.

## Splits that work

| Axis | Shape | Typical content |
| --- | --- | --- |
| Variant branch | The request selects one path. `SKILL.md` holds the shared steps and the choice; each variant gets its own file | Cloud provider, database engine, framework, output format |
| Procedure vs data | `SKILL.md` keeps the verbs and decisions; the file holds lookups | Schemas, error tables, option matrices, example galleries |
| Depth tier | `SKILL.md` covers the common path; one file covers a distinct edge case behind a sharp trigger | A rare input shape, a legacy format |

Variant files that share most of their content should merge back, because the shared part belongs in `SKILL.md`. Lookup data under about 50 lines is usually cheaper inline.

## Splits that do not work

- **By topic when tasks span topics.** A testing skill split into unit, integration, and mocks forces two or three loads per task and fragments cross-topic advice.
- **To hit a line target.** With no branching condition, the files load together or never, and the added pointers make the total longer.
- **Rare but critical content.** Claude may skip a reference, so anything that must happen goes in `SKILL.md`. Rare plus critical often means the skill does two jobs and should be two skills.
- **Cosmetic files** such as Examples, Notes, or Tips. They have no load condition, so they are either always read or never read.

## Pointer hygiene

The pointer is the whole load contract.

- Name the signal that triggers the load: "when the repo uses MADR", not "for more detail".
- Use one sentence per pointer, and do not summarize the target in `SKILL.md`.
- Put the load condition in the filename (`go126-simd.md`, not `advanced.md`).
- Give any reference over about 300 lines a short contents list at the top.
- Merge two references that nearly always load together.
- Keep references one level below `SKILL.md`.

## Scripts before prose

Formatting, validation, schema generation, and other deterministic work belongs in `scripts/`, which costs no context to run and gives the same result every time. See `references/scripts.md`. Keep judgment and adaptation in the instructions.

## Decision checklist

1. Can Claude detect the load condition from the request or from the repo?
2. After adding pointer prose, does the split still save context?
3. Is the content lookup data (can move) or sequence (usually stays)?
4. Would a script do this better?
5. Across realistic runs, how often would the file load? Above about 80 percent, promote it into `SKILL.md`, because the pointer costs more than it saves.

If the answer to question 1 is unclear, do not split.

## Checking the architecture

Output evals ask whether the skill produced the right result. Architecture checks ask whether it loaded the right files at acceptable cost. Include one case per declared variant, one that should load no references, and a few off-topic prompts that should not trigger the skill. Record which references each run read. A file no realistic case reaches is dead, and a reference read in nearly every run belongs in `SKILL.md`.
