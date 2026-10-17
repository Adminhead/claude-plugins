# Commands and scenario scripts

Read this when handing the user a test script: it holds the keys they need for each screen reader, three scenarios with the announcements to expect, and fixes for common failures. The process, the report, and the limits stay in [SKILL.md](../SKILL.md).

Wording differs between screen readers, browsers, and versions. Treat each "expect" line as the information that must come through (name, role, state, value), and record the speech actually heard. A different phrasing with the same information passes.

## Modes

| Mode | Behavior | Notes |
| --- | --- | --- |
| Browse (virtual cursor) | Arrow keys read the page. Single letters jump between elements | The default for reading |
| Focus (forms) | Keys go to the control, such as typing in a field | NVDA and JAWS switch on their own for form fields |
| Application | The page handles keys itself | Set by `role="application"`, which should be rare |

A widget that works only after the user switches modes by hand is a finding, because most users won't know to.

## VoiceOver (macOS, Safari)

`VO` is Control+Option, or Caps Lock when configured. Toggle VoiceOver with Command+F5.

| Task | Keys |
| --- | --- |
| Next / previous item | VO+Right / VO+Left |
| Activate | VO+Space |
| Read from here | VO+A |
| Stop speech | Control |
| Interact with a group / stop | VO+Shift+Down / VO+Shift+Up |
| Rotor (headings, links, landmarks, form controls) | VO+U, then Left/Right to change list, Up/Down to choose, Enter to go |
| Next heading / link / form control / table | VO+Command+H / L / J / T |
| Previous of a type | Add Shift, such as VO+Shift+Command+H |
| Single-key Quick Nav on or off | VO+Q |

## NVDA (Windows, Firefox or Chrome)

The default NVDA key is Insert, or Caps Lock when set. Start with Control+Alt+N, and exit with NVDA+Q then Enter.

| Task | Keys |
| --- | --- |
| Read all / stop speech | NVDA+Down (laptop layout NVDA+A) / Control |
| Next heading, any level | H. Levels 1 to 9 use the digit keys |
| Next landmark / form field | D / F |
| Next button / edit field / checkbox / combo box | B / E / X / C |
| Next link / list / table | K / L / T |
| Previous of a type | Add Shift |
| Elements list (links, headings, form fields, buttons, landmarks) | NVDA+F7 |
| Switch browse and focus mode | NVDA+Space |
| Table cells | Control+Alt+arrow keys |

## JAWS (Windows, Chrome)

Insert is the JAWS key by default. In browsers the virtual cursor is on by default.

| Task | Keys |
| --- | --- |
| Read all / stop speech | Insert+Down / Control |
| Next heading / table / list | H / T / L |
| Next region (landmark) / main region | R / Q |
| Next form field / button / edit box / checkbox | F / B / E / X |
| Link, heading, and form field lists | Insert+F7 / Insert+F6 / Insert+F5 |
| Enter / exit forms mode | Enter / Num Pad Plus |
| Table cells | Alt+Control+arrow keys |

## TalkBack (Android, Chrome)

Turn it on in Settings, Accessibility, TalkBack. Gestures for version 9.1 and up:

| Task | Gesture |
| --- | --- |
| Next / previous item | Swipe right / left |
| Read what is under the finger | Drag one finger |
| Activate | Double-tap |
| Long press | Double-tap and hold |
| Change the reading control (headings, links, controls) | Swipe up then down for the next one |
| Jump by the current reading control | Swipe down / up |
| Scroll | Two-finger swipe |
| TalkBack menu | Swipe down then right |

## Scenario: modal dialog

Markup under test: a trigger button, and a `role="dialog"` with `aria-modal="true"`, an accessible name from its heading, and an optional description.

| Step | Expect |
| --- | --- |
| Activate the trigger | Dialog name, the word "dialog", and the description if there is one. Focus is inside the dialog |
| Press Tab and Shift+Tab repeatedly | Focus cycles within the dialog and never reaches the page behind |
| Browse the background with the screen reader's own keys | The background is not readable while the dialog is open. If it is, record it as a failure for that environment |
| Press Escape | The dialog closes |
| After close | Focus is back on the trigger, which is announced by name |

The same checks apply to cancel and confirm. If the dialog removes its own trigger, record where focus lands.

## Scenario: live region

Markup under test: a status container that is in the DOM at page load and filled later, such as `role="status"`, or `role="alert"` for urgent messages.

| Step | Expect |
| --- | --- |
| Trigger the update (save, filter, add to cart) | The message is spoken once, without moving focus, after the action completes |
| Trigger an error | An urgent message interrupts at once. A polite status waits for current speech |
| Trigger the same update twice | It is announced both times |
| Read the region by navigation afterward | The text is still readable |

A region that is inserted into the page together with its text often stays silent. Create it empty first, then change its content.

## Scenario: tabs

Markup under test: `role="tablist"` containing `role="tab"` elements with `aria-selected` and `aria-controls`, and a `role="tabpanel"` for each.

| Step | Expect |
| --- | --- |
| Tab into the tab list | Selected tab name, "tab", "selected", and its position, such as "1 of 2" |
| Press Right and Left arrows | Focus moves to the next and previous tab, with the new name, role, and state. Home and End go to the first and last tab |
| Wrap around at either end | Focus continues from the opposite end |
| Press Tab from a tab | Focus moves into the panel content, not to the next tab |
| Browse the page | Hidden panels are not read |

Whether arrow keys also select the tab, or only move focus until Enter, is a design choice. Record which one the page does and check that it matches the state announced.

## Debugging tips

- Compare what was spoken with the accessibility tree before touching code. `playwright-cli snapshot` shows each element's role, name, and state as the browser computes them, and the browser's developer tools have an Accessibility pane for the same.
- Repeat the failing step from a freshly loaded page to rule out leftover focus or earlier messages.
- Try the same step in a second browser with the same screen reader. A difference points at browser support, not the markup.
- In browse mode, check each element with the reader's element list (NVDA+F7, Insert+F6/F7, VO+U) to see how headings, links, and landmarks are exposed.

## Common failures and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Icon button is read as "button" only | No accessible name | Add visible text, or `aria-label`, and hide the icon with `aria-hidden="true"` |
| Update appears but nothing is spoken | No live region, or the region was added together with its text | Use an existing `role="status"` or `role="alert"` container and change its text |
| Error is visible, not announced | Error text isn't tied to the field or announced | `aria-invalid="true"` and `aria-describedby` on the input, and move focus to the error summary or the first invalid field |
| Focus is lost after closing a dialog | No return target | Save the trigger before opening and call `focus()` on close |
| Focus escapes a modal | No containment, or the background is not inert | Use `<dialog>` with `showModal()`, or make the background `inert` |
| Tab or menu item has no state | Missing `aria-selected`, `aria-expanded`, or `aria-current` | Set it on the element that has focus, and update it on every change |
| Heading list is a jumble | Levels chosen for size | Pick levels for outline and style with CSS |
