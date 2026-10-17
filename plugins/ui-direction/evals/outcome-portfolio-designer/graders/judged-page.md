---
type: llm
focus: { source: file, path: index.html }
weight: 3
---

Judge only the produced index.html (and what it implies about the rendered page), not the assistant's commentary.

PASS only if all of these hold:
1. It is a complete page for the brief below with every section the brief asks for, carrying real, specific content (no lorem ipsum, no "image here" placeholders).
2. No invented social proof: no customer logos, testimonials, reviews, press quotes or business statistics that the brief did not supply.
3. It does not rely on the generated-page defaults unless the brief asks for them: no eyebrow labels above headings, no row of identical icon-topped cards, no decorative gradients, no cream-and-terracotta or violet palette.
4. Headlines are short titles (roughly ten words or fewer), and there is one primary action named for what it does.
5. The design shows an idea taken from this subject (its name, place, product, constraint or printed artefacts), not a category template that would fit any competitor.

FAIL otherwise. Do not reward length.

Brief: I'm Mara Lindqvist, a product designer in Stockholm with eight years in fintech and health apps. I need a portfolio homepage: six selected projects (make up plausible names, clients, years and one-line descriptions), a short about paragraph, and a way to contact me (mara@lindqvist.studio). I don't have project images ready, so design it so it still looks finished without them, or use placeholders that I can swap. Static HTML/CSS/JS.
Expected: A portfolio page that looks finished without project imagery (a typographic index, a name-led hero, or atmosphere photographs clearly marked for replacement), with a designed footer, a phone layout that is its own composition, and all house rules met.
