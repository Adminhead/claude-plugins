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

Brief: Website for Casa Mirante, a six-room guesthouse on the cliffs above Ericeira, Portugal. Rooms from 140 euros a night with breakfast included; ten minutes' walk to the surf at Ribeira d'Ilhas; open March to November. One page: what it is, the rooms, what's nearby, and how to book (email reservas@casamirante.pt). We have no photographs yet. Static HTML/CSS/JS.
Expected: A calm, photograph-led or type-led one-pager whose hero is one clear thing, with rooms and booking information easy to find, bundled coast photographs used as atmosphere and listed for replacement, and all house rules met.
