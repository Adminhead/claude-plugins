# DESIGN.md template

Read this before creating or revising a `DESIGN.md`.

## Rules

- Keep it evidence-backed and scoped to the surfaces it covers.
- Include only the sections that apply. Don't duplicate level-2 headings, and keep relevant local sections when revising.
- Don't prescribe component code, CSS declarations, routing, data fetching, or test commands. Those belong to implementation.
- When a standard changes, update its evidence and rationale too. Don't let the prose turn into a dump of raw values or inherited library defaults.
- If the repo uses the Google Labs format, add YAML frontmatter with exact `---` delimiters and a `name`. Add only the evidence-backed standard properties that apply (`version`, `description`, `omitted`, `colors`, `typography`, `rounded`, `spacing`, `components`). Token values are normative, and the prose explains how they apply. Use `{path.to.token}` references only for established tokens. See `design-md-tooling.md`.

## Template

```markdown
# Design: <product or surface>

## Scope and evidence
- Surfaces and users covered:
- Sources inspected:
- Established decisions / `UNCONFIRMED` assumptions:

## Foundations
- Color roles and contrast constraints:
- Typography roles and readability rules:
- Spacing, layout, shape, and elevation conventions:

## Patterns and states
- Product-specific objects and component variants:
- Default, hover, focus, active/selected, disabled, loading, empty, error,
  success, and recovery behavior as applicable:

## Responsive and accessible intent
- Content priorities, composition changes, and overflow rules:
- Keyboard, focus, labels, non-color cues, motion, and target-size criteria:

## Validation and ownership
- Rendered review scenarios and acceptance criteria:
- Design decisions versus implementation responsibilities:
- Open questions and decisions that require evidence:
```
