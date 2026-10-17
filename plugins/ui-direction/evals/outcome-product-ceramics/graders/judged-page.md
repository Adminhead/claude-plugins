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

Brief: Launch page for Kiln, a ceramic pour-over coffee set (dripper, carafe and two cups) that is hand-glazed in small batches in Porto. It costs 84 euros and ships across the EU within a week. The glaze is mixed by hand so no two sets are identical. We have not shot product photos yet, so there are no images of the set. One page, with a way to buy (a button is enough). Static HTML/CSS/JS.
Expected: A product page that does not fake product photography: it either commits to type and colour, uses one shape from the object as a motif, or uses atmosphere photographs honestly, with the price and purchase action clear, and all house rules met.
