# WCAG 2.2 Level A and AA success criteria

All 55 criteria a page must meet for WCAG 2.2 AA conformance (31 at Level A, 24 at Level AA). 4.1.1 Parsing was removed in 2.2 and is not listed. "New" marks criteria added in 2.2. The "Design" column says whether a design-level review can judge the criterion: **Yes** (visible in mockups or specs), **Partly** (needs states, specs or source), **Build** (only a rendered or assistive-technology check can confirm it).

Source: W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*, https://www.w3.org/TR/WCAG22/, and *What's New in WCAG 2.2*, https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/.

## 1 Perceivable

| SC | Name | Level | Design | Check |
|----|------|-------|--------|-------|
| 1.1.1 | Non-text Content | A | Partly | Every meaningful image, icon and control has a text alternative; decorative ones are marked decorative |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | A | Partly | Transcript, or audio/text alternative for silent video |
| 1.2.2 | Captions (Prerecorded) | A | Partly | Captions for prerecorded video with audio |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | A | Partly | Audio description or full text alternative |
| 1.2.4 | Captions (Live) | AA | Partly | Captions for live audio in synchronized media |
| 1.2.5 | Audio Description (Prerecorded) | AA | Partly | Audio description for prerecorded video |
| 1.3.1 | Info and Relationships | A | Partly | Headings, lists, tables, groups and labels are expressed in structure, not only visually |
| 1.3.2 | Meaningful Sequence | A | Partly | Reading order in code matches the visual meaning |
| 1.3.3 | Sensory Characteristics | A | Yes | Instructions don't rely only on shape, color, size, position or sound ("click the round button on the right") |
| 1.3.4 | Orientation | AA | Yes | Works in portrait and landscape unless one is essential |
| 1.3.5 | Identify Input Purpose | AA | Partly | Fields collecting user data declare their purpose (autocomplete tokens) |
| 1.4.1 | Use of Color | A | Yes | Color is not the only cue for status, errors, required fields or links in body text |
| 1.4.2 | Audio Control | A | Partly | Audio playing over 3 seconds can be paused, stopped or muted |
| 1.4.3 | Contrast (Minimum) | AA | Yes | Text 4.5:1; large text (18pt, or 14pt bold) 3:1 |
| 1.4.4 | Resize Text | AA | Partly | Text resizes to 200% without loss of content or function |
| 1.4.5 | Images of Text | AA | Yes | Real text instead of images of text, except logos and essential cases |
| 1.4.10 | Reflow | AA | Partly | No two-dimensional scrolling at 320 CSS px width (256 px height for horizontal content), except content that needs 2D layout such as maps and data tables |
| 1.4.11 | Non-text Contrast | AA | Yes | UI component boundaries, states, focus indicators and meaningful graphics 3:1 against adjacent colors |
| 1.4.12 | Text Spacing | AA | Build | No loss of content with line height 1.5, paragraph spacing 2x, letter spacing 0.12em, word spacing 0.16em |
| 1.4.13 | Content on Hover or Focus | AA | Partly | Tooltips and popovers are dismissible (Esc), hoverable and persistent |

## 2 Operable

| SC | Name | Level | Design | Check |
|----|------|-------|--------|-------|
| 2.1.1 | Keyboard | A | Partly | All functionality works by keyboard |
| 2.1.2 | No Keyboard Trap | A | Partly | Focus can always move away (modals trap focus intentionally but close with Esc) |
| 2.1.4 | Character Key Shortcuts | A | Partly | Single-key shortcuts can be turned off, remapped, or apply only on focus |
| 2.2.1 | Timing Adjustable | A | Partly | Time limits can be turned off, adjusted or extended |
| 2.2.2 | Pause, Stop, Hide | A | Yes | Moving, blinking, scrolling or auto-updating content over 5 seconds can be paused, stopped or hidden |
| 2.3.1 | Three Flashes or Below Threshold | A | Partly | Nothing flashes more than three times per second |
| 2.4.1 | Bypass Blocks | A | Partly | Skip link or landmarks to bypass repeated blocks |
| 2.4.2 | Page Titled | A | Partly | Pages have descriptive titles |
| 2.4.3 | Focus Order | A | Yes | Focus order preserves meaning and operability |
| 2.4.4 | Link Purpose (In Context) | A | Yes | Link purpose is clear from its text or context ("Read more" alone fails when ambiguous) |
| 2.4.5 | Multiple Ways | AA | Yes | More than one way to find a page (search, sitemap, navigation), except steps in a process |
| 2.4.6 | Headings and Labels | AA | Yes | Headings and labels describe topic or purpose |
| 2.4.7 | Focus Visible | AA | Yes | A visible focus indicator on every keyboard-operable element |
| 2.4.11 | Focus Not Obscured (Minimum) — New | AA | Yes | A focused component is not entirely hidden by author content (sticky header or footer, banners, non-modal dialogs) |
| 2.5.1 | Pointer Gestures | A | Yes | Multipoint or path-based gestures have a single-pointer alternative |
| 2.5.2 | Pointer Cancellation | A | Build | Actions fire on up-event or can be aborted or undone |
| 2.5.3 | Label in Name | A | Partly | The accessible name contains the visible label text |
| 2.5.4 | Motion Actuation | A | Partly | Shake or tilt actions have a UI alternative and can be disabled |
| 2.5.7 | Dragging Movements — New | AA | Yes | Dragging has a single-pointer, non-drag alternative (buttons, menu, tap-to-place) unless essential |
| 2.5.8 | Target Size (Minimum) — New | AA | Yes | Targets at least 24x24 CSS px, or spaced so 24 px circles centered on undersized targets don't intersect another target or circle. Exceptions: equivalent control, inline in text, user-agent control, essential |

## 3 Understandable

| SC | Name | Level | Design | Check |
|----|------|-------|--------|-------|
| 3.1.1 | Language of Page | A | Build | Page language is declared |
| 3.1.2 | Language of Parts | AA | Build | Passages in another language are marked |
| 3.2.1 | On Focus | A | Partly | Focus alone doesn't change context |
| 3.2.2 | On Input | A | Partly | Changing a setting doesn't change context unexpectedly unless the user is told first |
| 3.2.3 | Consistent Navigation | AA | Yes | Repeated navigation keeps the same relative order |
| 3.2.4 | Consistent Identification | AA | Yes | Components with the same function are labeled consistently |
| 3.2.6 | Consistent Help — New | A | Yes | Help mechanisms repeated across pages appear in the same relative order |
| 3.3.1 | Error Identification | A | Yes | Errors are identified and described in text |
| 3.3.2 | Labels or Instructions | A | Yes | Inputs have labels or instructions (placeholder alone is not enough) |
| 3.3.3 | Error Suggestion | AA | Yes | Error messages suggest a correction when one is known |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | Yes | Legal, financial or data-changing submissions are reversible, checked, or confirmed |
| 3.3.7 | Redundant Entry — New | A | Yes | Information already entered in the same process is auto-populated or selectable, unless essential or for security |
| 3.3.8 | Accessible Authentication (Minimum) — New | AA | Partly | No cognitive function test to log in unless there's an alternative, a helping mechanism (password manager, paste), or object/personal-content recognition |

## 4 Robust

| SC | Name | Level | Design | Check |
|----|------|-------|--------|-------|
| 4.1.2 | Name, Role, Value | A | Partly | Custom components expose name, role, states and values to assistive technology |
| 4.1.3 | Status Messages | AA | Partly | Status messages (saved, results count, errors) are announced without receiving focus |

## Level AAA criteria added in 2.2 (not required for AA)

- 2.4.12 Focus Not Obscured (Enhanced): no part of the focused component is hidden.
- 2.4.13 Focus Appearance: the focus indicator is at least as large as a 2 CSS px thick perimeter of the unfocused component, with 3:1 contrast between the same pixels in focused and unfocused states.
- 3.3.9 Accessible Authentication (Enhanced): no object or personal-content recognition exception.

Recommend these when the user asks for more than AA, or as good practice for focus styling.
