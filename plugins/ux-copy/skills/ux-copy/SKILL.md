---
name: ux-copy
description: "Writes and reviews product microcopy: button and CTA labels, error messages, empty states, confirmation dialogs, tooltips, loading and onboarding text. Use for \"what should this button say?\", \"write copy for\", \"review this error message\" or wording a dialog. Not for marketing page copy or long-form docs."
argument-hint: "<context or copy to review>"
---

# UX copy

Write or review the words inside a product interface.

Request: $ARGUMENTS

Adapted from Anthropic's design plugin (anthropics/knowledge-work-plugins, `design/skills/ux-copy`), Apache-2.0; see `NOTICE`.

## Scope

- Owns interface microcopy: labels, CTAs, errors, empty states, confirmations, tooltips, loading, success and onboarding text, notifications.
- Marketing and landing-page copy (headline, argument, section copy) goes to `ui-direction`. A whole-screen design critique goes to `design-critique`. Accessibility conformance goes to `accessibility-review`.
- When the user has a style guide, glossary or brand voice document, read it first and follow it over the defaults below.

## What to establish

- **Context**: which screen, flow or feature, and where the text sits.
- **User state**: what the user is trying to do and how they likely feel at that moment.
- **Tone**: formal, friendly, playful, reassuring. Infer from existing copy in the product when you can see it.
- **Constraints**: character limits, platform guidelines, localization.

Ask only for what would change the answer; otherwise state your assumption and write.

## Principles

1. **Clear**: say exactly what you mean. No jargon, no ambiguity.
2. **Concise**: the fewest words that carry the full meaning.
3. **Consistent**: the same term for the same thing everywhere. Reuse the product's existing terms.
4. **Useful**: every word helps the user reach their goal.
5. **Human**: write like a helpful person, not a system log.

## Copy patterns

### CTAs
- Start with a verb: "Start free trial", "Save changes", "Download report".
- Be specific: "Create account", not "Submit".
- The label names the outcome the click produces.

### Error messages
What happened + why + how to fix.
- "Payment declined. Your bank declined the card. Try a different card or contact your bank."
- Name the field and the fix in the message itself, not only by color or icon. Don't blame the user.

### Empty states
What this is + why it's empty + how to start.
- "No projects yet. Create your first project to start working with your team."

### Confirmation dialogs
- Name the action: "Delete 3 files?", not "Are you sure?".
- State the consequence: "This can't be undone."
- Label buttons with the action: "Delete files" / "Keep files", not "OK" / "Cancel".

### Tooltips
- Short, adds something the label doesn't already say. Never the only place essential information lives.

### Loading states
- Set expectations ("Importing 240 contacts..."), and say what happens if it takes long.

### Onboarding
- Progressive disclosure, one concept at a time, tied to the user's next action.

### Accessible wording
- Link and button text makes sense out of context ("Download the 2025 report", not "Click here").
- Visible labels stay visible; placeholder text is a hint, not a label.
- Icon-only buttons need an accessible name; propose it.

## Voice and tone by moment

- **Success**: warm, brief, not over the top.
- **Error**: calm, specific, helpful.
- **Warning**: clear about the risk and the action.
- **Neutral**: informative and concise.

## Output

```markdown
## UX Copy: [Context]

### Recommended copy
**[Element]**: [Copy]

### Alternatives
| Option | Copy | Tone | Best for |
|--------|------|------|----------|
| A | [Copy] | [Tone] | [When to use] |
| B | [Copy] | [Tone] | [When to use] |

### Rationale
[Why this works: user context, clarity, action]

### Localization notes
[Idioms to avoid, expected text expansion (German and Finnish often run 30%+ longer), plural and gender handling, cultural context]
```

For a review, quote each original string, give the revision, and say in one line why.
