# Test-first work

Read this when the user asks for test-driven development or red-green-refactor, or when a fix is easiest to drive from a failing test. Test-first is a technique to offer when it fits, not a rule for every change. It does not require a coverage target, a checkpoint commit per step, or a saved evidence file.

## A valid red

A failing test counts as red only when it fails for the intended reason.

- Run it and read the failure. A test that was written but never run is not red.
- Confirm the failure message names the missing or wrong behavior. A syntax error, a failed import, a missing fixture, or an unrelated regression is a broken test, not a red one, so fix the setup and run again.
- For a compiled language, a compile error on the not-yet-existing interface is a legitimate red when that is the behavior you are specifying.
- Change production code only after the red is real, and write only enough to turn it green.

## Work in vertical slices

Write one test, make it pass, then write the next, letting each cycle inform the following test. Writing every test first tests the imagined shape of the code, commits you to a structure before you understand it, and leaves tests that don't react to real behavior. One seam, one behavior, one minimal implementation per cycle.

Refactor after green with the tests still passing. Keep it out of the red-green step so a failure points at one change.

## Choose the seam first

A seam is the public boundary where behavior is observable. Decide where tests will cross it before writing the first one, and write that choice down. Confirm it with the user only when the interface itself is uncertain. Tests at that seam survive refactors, and a test that must change when only the implementation changed is reaching past the seam.

- **Verify through the interface.** Check a created record by reading it back through the public call, not by querying the table directly. A direct query couples the test to storage.
- **Design for injection.** Pass external dependencies in, so a test can substitute them at the boundary. Substitute only at real boundaries: things you don't own (third-party services, time, randomness) and your own services across a network. Don't mock in-process modules.
- **Expected values come from outside the code.** Use a known literal or a worked example, never a recomputation with the production algorithm, since that passes by construction.

For the shape of the interface and the seam itself, see `efficient-core:coding`, if installed (`references/design-seams.md`).
