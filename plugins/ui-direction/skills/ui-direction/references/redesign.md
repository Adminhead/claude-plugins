# Redesign of an existing page

The order of work for reshaping a page that already exists. Adapted from taste-skill's
`redesign-skill` (https://github.com/Leonxlnx/taste-skill, MIT, Copyright (c) 2026 Leonxlnx): its
scan, diagnose and fix order and its working rules only. Its style advice (specific fonts, glass,
grain, tinted shadows, gradients) is not carried over; the direction comes from SKILL.md.

If the product's visual system stays and only a part changes, this is not a redesign: follow the
system (the `web-design` skill when installed). Use this file when the visual identity is being
replaced or the page "looks generic" and the owner wants a new look.

## 1. Scan

- Read the codebase: framework, styling method (Tailwind and its version, CSS modules, vanilla CSS,
  styled-components), where tokens live, which components are shared.
- List what is real and must survive: the content, the brand assets (logo, colours, fonts the owner
  wants to keep), every working behaviour (forms, links, routes, analytics hooks).
- Have the ui-critic agent measure the current page (or run its lint and inspect yourself) and keep
  the report as the "before".

## 2. Diagnose

- Go through `tells.md` and the critic's findings. List every generic pattern, weak point and missing
  state: hover, focus, active, disabled, loading, empty and error.
- Check the omissions generated pages share: no skip link, dead `#` links, no current-page marker in
  the navigation, missing meta tags and favicon, no form validation, lorem ipsum, invented proof.
- Write the reading of the brief in one line and the subject inventory (SKILL.md step 1). For a new
  identity, continue from SKILL.md step 2 with the page's real content.

## 3. Fix

Work in this order; each step is reviewable on its own.

1. Tokens: palette and type from the plan or the draw, as CSS custom properties in the project's own
   styling system.
2. Type: faces, scale, measure and leading.
3. Hierarchy and layout: one dominant thing per screen, shared edges, section spacing, neighbouring
   sections that differ.
4. Components: replace stock patterns (icon card rows, three pricing towers, accordion walls) with
   compositions that fit the content.
5. States: hover, focus, active, loading, empty and error.
6. Imagery and motion, last.

## Rules

- Work with the existing stack. Do not migrate frameworks or styling libraries.
- Do not break existing functionality. Re-check every changed flow after each step.
- Check the dependency file before importing anything new; prefer no new dependency.
- Keep changes small and reviewable rather than one rewrite.
- Re-run the critic after each step that changes the look, and report the before and after counts.
