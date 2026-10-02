# Slop candidates

Read this when classifying candidates in step 3. Each entry is a prompt to look for evidence, not a verdict.

## Code

- Duplicates a responsibility that is already maintained elsewhere.
- Obscures control flow with indirection, compressed cleverness, or hidden state.
- Adds an abstraction, option, callback, or config surface with no present caller.
- Keeps dead artifacts: unused functions, flags, imports, assets, or config.
- Comments that restate the code, narrate an obvious workflow, add decorative separators, or leave a vague TODO with no owner or reason.
- Optimizes without a measured need.
- Wraps errors in defensive fallbacks that hide the real failure.

Keep comments and docs that explain business rules, security, compatibility, or non-obvious implementation intent.

## Prose

- Buries the point under setup.
- Repeats itself across paragraphs or sections.
- Uses generic transitions, summaries, or uplifting conclusions.
- Makes a claim the source doesn't support.
- Leaks a placeholder or template text.
- Uses vague language where the reader needs a specific fact, number, name, or step.

For sentence-level AI tells, hand off to `avoid-ai-writing:avoid-ai-writing` (if installed).

## Web and visual

- Ignores the existing design system, tokens, or component library.
- Hides the product task behind generic decoration (hero gradients, stock illustrations, filler cards).
- Adds effects, animations, or controls with no interaction purpose.
- Fails or omits a state the product needs (loading, empty, error, disabled, recovery).
- Breaks at narrow widths, under text zoom, or by keyboard.

## Traps that look like slop but usually aren't

- Repetition required by a format, a spec, or a legal or safety notice.
- Verbose code that mirrors an external protocol or generated schema.
- A compatibility shim with live callers.
- An accessibility attribute that looks redundant but covers a real assistive-tech gap.
- A measured optimization that reads oddly.
- Brand or voice choices the owner made on purpose.
