# Component accessibility patterns

Read this when building or reviewing the markup of a custom control. Start from the native element, and add ARIA only for a gap it cannot fill. Use `design:accessibility-review` (if installed) for a full WCAG audit.

## Anti-patterns

| Bad | Why | Fix |
| --- | --- | --- |
| `tabIndex={2}` | A positive value overrides the natural tab order | Use `0` or `-1` and fix DOM order |
| `aria-hidden="true"` on a focusable element | Focus lands on something screen readers cannot see | Hide it with `inert` or remove it from the tree |
| `aria-label` on a `div` with no role | Names are not announced for generic elements | Use a native element or give it a role |
| `<div role="button" onClick>` without keys | Enter and Space do nothing | Use `<button type="button">` |
| Placeholder as the only label | It vanishes on input and has weak contrast | Add a `<label>` |
| `display: none` plus `aria-hidden` | Redundant, and it hides from everyone | Use one hiding mechanism |
| `role="alert"` on every error | Each one interrupts the reader | Use one live region or an error summary |

## Icon-only button

```tsx
<button type="button" aria-label="Delete item">
  <TrashIcon aria-hidden="true" />
</button>
```

## Disclosure

```tsx
const panelId = useId();
<button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
  Details
</button>
<div id={panelId} hidden={!open}>…</div>
```

## Field with an error

```tsx
const errorId = useId();
<label htmlFor={id}>Email</label>
<input id={id} type="email" aria-invalid={!!error}
  aria-describedby={error ? errorId : undefined} />
{error && <p id={errorId}>{error}</p>}
```

Move focus to the first invalid field or an error summary after a failed submit. Announce a status message that is not tied to focus through a polite live region that exists in the DOM before its text changes.

## Dialogs and menus

- Use the native `<dialog>` with `showModal()`, or a headless library that handles focus (Radix, React Aria, Base UI). Do not hand-roll a focus trap, a combobox, or a menu.
- Focus moves into the dialog on open, Escape closes it, and focus returns to the trigger on close.
- When you must build a custom widget, follow the matching pattern and keyboard table in the ARIA Authoring Practices Guide (<https://www.w3.org/WAI/ARIA/apg/patterns/>).
