# Component states and behavior

Read this when specifying or reviewing a component's states, forms, tables, overlays, or feedback. A component is judged by its states and its behavior under real conditions (loading, empty, error, dense data), not by its resting look. Reuse the product's existing components and add a variant only for a materially different task or state.

## State matrix

Specify every state once per component and reuse the spec: default, hover (pointer only), active or pressed, keyboard focus, disabled, loading, error, and where relevant selected and read-only.

- Do not change font weight between states (regular to bold on hover or selected). It shifts the layout. Change color, background, or a border, or reserve space for the bold width.
- Keep the focus indicator visible with sufficient contrast. `outline` follows `border-radius` in current browsers, so a rounded control can use a normal outline with an offset.

## Buttons

- Rank by importance, not by meaning. One primary action per view, secondary actions outlined or low contrast, tertiary actions styled like links. Painting every button by its meaning (green save, red delete) destroys the hierarchy.
- A destructive action gets the strong red treatment only when destruction is the main action of that surface, such as the confirm button in a delete dialog.
- An async button shows a loading state and prevents a second submit.
- Label with a verb that names the outcome ("Create project"), not "Submit".

## Forms

- Every input has a visible label. Wrap fields in a real `<form>` so Enter submits.
- Use the right `type` and `autocomplete` values, and `inputmode` where it helps. Input text of at least 16 px keeps iOS Safari from zooming on focus.
- Validate at a sensible moment (on blur or submit for format errors, not on every keystroke), show the error next to the field with the fix, keep the user's input, and never clear the form on error.
- Controls that take effect immediately (switches, filters) need no Save button. Reserve Save for batched changes.

## Tables

- Left-align text and right-align numbers, so magnitudes line up. Align each header with its column.
- Use `font-variant-numeric: tabular-nums` on figures, IDs, and timestamps.
- Separate rows with light rules or padding instead of a heavy grid.
- Keep a sticky header on long tables, and pin the identifying column when the table scrolls sideways. Keep one density per view.
- Show which columns sort and the current sort. Keep row actions reachable by keyboard.

## Overlays

Use the lightest overlay that fits: a popover for a small choice, a sheet or drawer for a focused subtask, and a modal only for a decision that must block the flow. A modal that opens another modal is a flow problem.

- Focus moves in on open, Escape closes, and focus returns to the trigger on close. Prefer the native `<dialog>` or a headless library.
- Animate a popover from its trigger, not from the center.
- A disabled button is out of the tab order and tooltips on it are not announced. Explain the reason in nearby text, or keep the button enabled and validate on click.

## Feedback and states

- Give feedback where the action happened. A copy button shows a check on itself. Reserve toasts for background or cross-surface events. A toast must not carry the only copy of an error the user needs to act on.
- Empty state: say what the feature is and prompt the first action. Loading: use skeletons that match the final layout for content, and spinners only for short waits. Error: say what failed, why if known, and the next step, and keep the user's work.
- Do not animate high-frequency or keyboard-initiated actions. Speed matters more there.

## Review tells

Resting-only components, placeholder-as-label, buttons colored by meaning, centered or proportional numerals in tables, modal on modal, must-act errors in toasts, and layout shift on hover or selection.
