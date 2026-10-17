---
name: screen-reader-testing
description: "Plans, runs with the user, and reports manual screen-reader and keyboard tests of a built web journey (NVDA, JAWS, VoiceOver, Orca, TalkBack): names, roles, states, form errors, live announcements, dialogs and focus return. Use for assistive-technology validation or diagnosing what a screen reader actually announces."
---

# Screen Reader Testing

Not for WCAG audits of designs (`accessibility-review`) or automated axe checks (the smoke QA reference in `playwright-cli`).

Get manual evidence of how an implemented interaction behaves with a real screen reader and keyboard. This skill tests the rendered experience. It does not choose visual design, prescribe generic accessibility fixes, or certify legal conformance.

Each combination of screen reader, browser, OS, version, and settings is its own environment. A result is evidence only for the environment that produced it.

## Who does what

Claude cannot hear speech output, so a person has to operate the screen reader. Claude's job is to:

1. Write a short, exact test script (the scenarios and steps below) for the user to run. Read [commands and scenarios](references/commands-and-scenarios.md) for each screen reader's keys, expected announcements for a modal, a live region, and tabs, and common fixes.
2. Record what the user reports, in the report template.
3. Diagnose failures afterward. Inspect the accessibility tree through the `playwright-cli` skill (if installed) or the claude-in-chrome skill, then read the DOM and source.

The accessibility tree, emulators, and automated audits are diagnostic aids. **They are never screen-reader evidence.** If no human-operated screen-reader session is available, say so and mark every scenario blocked.

## Workflow

1. **Define the smallest testable journey.** State the start URL or app state, the user goal, the required interactions, the expected outcome as the user perceives it, and any setup data. Select only the scenarios that exercise the changed or suspected behavior. Include failure and recovery only when the journey exposes them.

2. **Record the environment.** Capture the OS, browser and version, screen reader and version, input method, relevant mode or settings (browse vs. focus mode, verbosity), zoom, and build or URL. Use the requested environment. If none was requested, use one that is actually available and label it as your choice.

3. **Set a repeatable start state.** Reload or reset so no stale focus, prior validation messages, or cached transient UI can alter what gets announced. Note whether the test starts at page load, after direct navigation, or in an already-open state. If auth, test data, a device, or the requested screen reader is unavailable, stop and report the missing prerequisite.

4. **Test reading and control discovery.** Navigate both with Tab and with the screen reader's own navigation (headings, landmarks, form controls, virtual cursor). For each relevant element, record what is actually announced, not what the markup intends. Check that:
   - the name identifies the element's purpose
   - the role matches how it operates
   - the state or value comes through: expanded, selected, checked, unavailable, required, invalid, busy, current, or value, as the interaction uses them

5. **Exercise forms as a full recovery path.**
   - Reach each field the way a user would. Verify its label, instructions, required status, current value, and choices.
   - Submit a safe invalid input. Check that the error names the field and the problem, that the invalid state is exposed, that focus moves in a useful and predictable way, and that the entered values and a path to correction remain.
   - Correct the input and resubmit when the journey includes success.
   - Never infer that an error was announced just because it is visible.

6. **Trigger dynamic changes deliberately.** Perform the load, save, filter, or validation. Record the triggering control's state before and after, what was spoken, when it was spoken relative to the action, and whether it was disruptive or missing. Separate announcements the user needs from content they can find by reading. Before reporting a missing announcement, name the task it blocks.

7. **Test temporary contexts and composite widgets.** For dialogs, menus, popovers, disclosures, tabs, and comboboxes that appear in the journey, record:
   - what is announced on opening, and where focus lands
   - keyboard operation (activate, navigate, dismiss) and any mode switching needed
   - the name, role, and changing state while open
   - whether focus stays contained, and whether the background is inert when it should be
   - where focus goes after close, cancel, selection, or error

   Don't extrapolate one widget's result to unrelated widgets.

8. **Separate observation from diagnosis.** Record the exact steps, the actual speech (a faithful short transcription), the focus location, and the visible result. Repeat an unexpected result once from a clean state. Only then inspect the accessibility tree, DOM, or code to form a falsifiable explanation. If installed, hand fixes to `web-development`, or to `react` for React component faults, and leave hierarchy and interaction-intent decisions to `web-design`.

9. **Report bounded results.** Mark each scenario pass, fail, blocked, or inconclusive for the recorded environment. Name the untested environments and scenarios. Never claim cross-browser, cross-screen-reader, legal, or conformance coverage from one run. Strip test-account data and other sensitive content from transcripts.

## Report template

```markdown
## Manual screen-reader test

**Environment:** OS/version; browser/version; screen reader/version; input method; relevant settings; build/URL
**Start state:**

| Scenario | Steps | Expected user-observable result | Observed speech/focus/result | Status |
| --- | --- | --- | --- | --- |
| | | | | pass / fail / blocked / inconclusive |

**Failures or inconclusive results:**
- Reproduction:
- Expected:
- Actual:
- Evidence and suspected boundary, if any:

**Limits:** Untested environments, unavailable prerequisites, and scenarios intentionally excluded.
```
