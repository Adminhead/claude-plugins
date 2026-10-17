---
name: ui-direction
description: Art direction and build process for new UI or a visual reshape, such as a landing page, marketing site, portfolio, product page or a new app screen with no design system. Grounds the design in the subject, deals a researched direction, plans tokens and checks the render. Use when a page should look designed, or looks generic, templated or AI-made.
---

# UI direction

Adapted from Anthropic's frontend-design skill (Apache-2.0) and taste-skill v2 by Leonxlnx (MIT); see the plugin's `NOTICE`.

Approach this as the design lead at a studio known for giving every client a distinct visual identity. This client has rejected proposals that felt cliché or templated and is paying for a point of view: make deliberate, opinionated choices about palette, typography and layout that are specific to this brief, and take aesthetic risk where it is justified. **The brief's own words always win**, including when it asks for a look this skill would otherwise avoid.

Scope: new UI or a replaced visual identity. To extend a product's existing design system or DESIGN.md, use `web-design`; for charts use `dataviz`; for claude.ai artifacts use `artifact-design`; for product microcopy alone use `ux-copy`; for a throwaway prototype, skip the procedure and keep only the defaults table.

Paths: `<skill>` below and in the references means `${CLAUDE_PLUGIN_ROOT}/skills/ui-direction`. Run scripts from the project root; their working files land in `.ui-direction/` there, which belongs in `.gitignore` (tell the user). `draw.mjs` needs Node 18+; `assets.mjs` needs network access and is optional.

## 1. Read the brief and ground it in the subject

Find out what is real: the subject, the audience, the one thing the page must get someone to do, the stack, any existing brand (colours, fonts, logo), and what imagery truly exists (own photographs, a real interface, an image tool, or nothing). If the brief is vague, **decide and state your reading in one line** (one concrete subject, its audience, the page's job) instead of asking. Ask only when a missing fact blocks the work, such as no product name.

Then inventory the subject in your notes: eight to twelve things that belong to this client and to no competitor. Its name and what it means; its street, neighbourhood and what that place looks like; the numbers in the brief; the constraint it lives with; its materials and colours; its rituals and hours; the printed things of its world (a ticket, a label, a timetable). The subject's industry, materials and vernacular are where distinctive choices come from. Build with the brief's real content throughout.

## 2. Write the argument (public pages)

Before any design, list the page as claims with their proof, one line per section (`references/copy.md` §1). The claims decide which sections exist and in what order; delete any section without a claim. This is how the stock hero, logos, three features, testimonial, pricing, CTA sequence is avoided.

## 3. Choose the direction

**Public pages** (landing, marketing, portfolio, event, product launch): deal directions from the library instead of inventing one, because a model asked to invent a look picks the category default.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/ui-direction/scripts/draw.mjs" --sector <sector> --brief "<one line>" \
  --sections <roles in argument order> [--tone <tone>] [--have <assets>] [--keep palette,type] --options 3
```

Choose the option whose way of composing can carry something only this client has, not the most familiar, then deal the full sheet: same arguments plus `--direction <id>`, without `--options`. `--list sectors|roles|tones` prints the vocabularies; `--have` lists only assets that exist (`photography`, `product-photo`, `product-ui`, `illustration`, `video`). Adopt the sheet instead of blending it with your usual layout. Redraw a slot (`--redraw hero|type|palette|photos|section:<role>`) only for a stated reason, such as a brand constraint, a missing asset or content the blueprint cannot hold (`--alternatives <role>`), and record it. `--show` reprints the sheet.

Then find the idea. Write this sentence before building:

> On this page, **[something that belongs to the subject]** becomes **[the device the direction calls for]**.

Fill the first blank from the inventory. **Competitor test:** put the nearest competitor in the sentence; if it still works, the idea belongs to the category. Then name **one live thing** the visitor can do, built on real content (pick a wood and see the chair in it; set the loan and read the real monthly figure), usable with a thumb, with a plain fallback without script.

**App screens and anything without a draw:** write a compact token plan instead.
- Colour: the core palette as 4–6 named hex values.
- Type: the typefaces and their roles.
- Layout: a one-sentence concept and an ASCII wireframe; say whether content is left, centre or justified.
- Principles: what makes this screen this product's.

## 4. Review the plan against the defaults

For calibration, AI-generated design right now clusters around some traits:
1. a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757 — Anthropic's own Claude-interaction accent, so on a user's brief it reads as a tell);
2. a near-black background with a single bright acid-green or vermilion accent;
3. a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns;
4. the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration;
5. template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots ('A · B · C'); labels built as 'WORD — fragment' with a spaced em dash; tinted near-black (#0B0B0B, #111) standing in for black; a monospace face for small data labels; a '→' appended to link and button text.

All are legitimate for some briefs, but they are defaults rather than choices. Where the brief pins down a direction, follow it exactly; where it leaves an axis free, don't spend that freedom on one of these. If any part of the plan or sheet reads like what you would produce for any similar page, revise it and say what you changed and why. `references/tells.md` has the dated registry.

## 5. Write the words

Write the page as a copy deck before markup (`references/copy.md`). Every headline fits in two lines at every width (about 32 characters is safe at a confident size). One supporting sentence, one primary action named for what it does, as a real button on the first screen. The first screen answers the visitor's first question in large type. Write the full content of every section the brief asks for; sample details (dish names, room rates) are fine where the brief leaves gaps and go in the report, but proof is never invented: no customers, quotes, logos or statistics.

Words make the design easier to understand and use. Name things by what users understand, not how the system is built. Active voice; a CTA says exactly what happens ("Save changes", not "Submit"), and an action keeps its name through the flow. Errors say what went wrong and how to fix it without apologising; an empty screen invites an action. Sentence case, plain verbs, no filler.

## 6. Build

Build with motion switched off in your head first; a page that needs animation to look finished is not finished.

1. **Tokens** as CSS custom properties; everything downstream references them. `<skill>/assets/base.css` (and `base.js` for reveals) is an optional neutral foundation. Watch selector specificity: a type selector like `.section` and an element selector like `.cta` easily cancel each other's padding.
2. **The hero** exactly as planned, at desktop and phone width. Big thing big, small things small.
3. **Each section** from its blueprint with this project's content. Neighbours must not share a layout, and the idea reaches pricing, FAQ and footer too.
4. **Imagery**, in this order: the project's own; generated, if an image tool exists; real pictures of the subject's world from open collections; drawn in code from the subject; the sheet's photographs as atmosphere only; type and colour alone. Search open collections (CC0, public domain and CC BY by default; share-alike only with `--license sa`) with `node "${CLAUDE_PLUGIN_ROOT}/skills/ui-direction/scripts/assets.mjs" "<query from the inventory>"`, then `--get <ref>` to download with its credit and `--credits` for the footer line. A found picture is never presented as the client's own product, room or team. Unless the brief is type-led, four or more real pictures usually beat drawings alone. Details in `references/imagery.md`; if the network is blocked, draw instead and say so.
5. **The live thing**, in the section where it proves the claim.
6. **Fullness**: each desktop screen holds one dominant thing and its content; one deliberate rest per page at most. Running text in full ink at 16px or more.
7. **Quality floor**, without announcing it: responsive to 390px, visible keyboard focus, real links and buttons, alt text, reduced motion respected, contrast 4.5:1 for text.
8. **Motion last and sparingly**: one orchestrated moment (a page-load sequence or one reveal) lands better than scattered effects; fade-and-slide-up on every section and hover lifts on every card read as generated. Motion that answers an action is welcome. `references/motion.md` has tokens and recipes.

Spend boldness in one place and keep everything around it quiet. Before leaving the house, look in the mirror and remove one accessory.

## 7. Gate and look

Delegate to the **ui-critic** agent with the target (URL or HTML path), the mode (`new page`), the source folder, and any rules the brief explicitly asks for as allowances. It renders at 1440, 768 and 390, runs lint and inspect, critiques the screenshots, and returns at most three ranked fixes. Fix them and call it again: three rounds at most. Fix every FAIL unless the brief asked for that thing; treat each WARN as wrong unless you can defend it in one sentence.

If the agent is not installed or no Chrome is available, take screenshots at the three widths with `playwright-cli` or Claude in Chrome, read `references/critique.md` and critique them yourself. Judge only the pictures: if a problem shows in a screenshot it is real.

## 8. Report

Briefly: your reading of the brief; the direction (name, seed, redraws with reasons) or the token plan; the idea sentence and live thing; the critic's last counts and what still falls short; every found picture with its credit (`--credits`); stand-in photographs and drawings; sample content to replace. Don't claim a check you did not run.

## Defaults

These hold unless the brief says otherwise. The critic measures most of them.

| Default | Instead |
| --- | --- |
| Headlines two lines or fewer at every width | Cut words, then widen the measure, size last |
| A large statement is a `<p>`/`<blockquote>` at 36px or less, about 25 words | Larger than that it is a headline |
| No eyebrow label or pill badge above headings | Put the information in the heading or first sentence |
| No gradients, glows, or shadows on resting elements | Flat colour, tone steps; shadows only on what floats |
| No icon-topped rows of identical cards, no glass panels | A composed section; a plain navigation bar |
| Two typefaces at most, often one, chosen for this brief | Not the families you would reach for on any project |
| One ground, one ink, one accent on the action | Running text in full ink, not soft grey |
| Monospace labels, 01/02/03 numbering, hairline rules: only when the content calls for them | Tabular figures; a real `<ol>` for real sequences; space and tone |

Removing ornament leaves space. Fill it with scale, full content, a picture made for this subject, or a field of flat colour, never with another ornament.

## Special cases

- **Existing brand:** `--keep palette,type`, map the brand onto the roles, take composition from the draw. If the brand needs a device the defaults avoid, keep it, pass that rule as an allowance to the critic, and say so.
- **Redesign:** read `references/redesign.md` (scan, diagnose, fix) and keep the page's real content and working behaviour.
- **A component or one section:** skip the draw unless there is no direction to follow; match the surroundings and still have it critiqued.
- **No checkout or form backend:** the primary button goes to the real destination, or a `mailto:` with a written subject, or `#checkout` noted in the report. Never fake a payment form.

## Files

| File | Read it when |
| --- | --- |
| `references/copy.md` | Writing the argument and the copy deck; the two-line arithmetic |
| `references/type.md` | Setting type: scales, tracking, measure, loading fonts |
| `references/colour.md` | Applying the palette: roles, proportions, tone steps, dark pages, contrast |
| `references/layout.md` | Grid, margins, rhythm, section variety, navigation, footer, the phone layout |
| `references/imagery.md` | Finding, crediting, cropping and drawing pictures; video |
| `references/motion.md` | The motion pass: budget, tokens, recipes, reduced motion |
| `references/critique.md` | Critiquing screenshots yourself when ui-critic is unavailable |
| `references/tells.md` | The dated registry of generated-page tells |
| `references/research-digest.md` | Citing a number from the 247-site study |
| `references/redesign.md` | Reshaping an existing page |
| `library/` | Data `draw.mjs` reads; use the script, don't read it whole |
