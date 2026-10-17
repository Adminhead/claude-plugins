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

Brief: Make a one-page website for Osteria Nove, a 38-seat Italian restaurant in Alfama, Lisbon. Handmade pasta, a short natural wine list, dinner only, Tuesday to Saturday from 19:00. Address: Rua dos Remédios 9. Reservations by phone (+351 21 000 0009) or email (mesa@osterianove.pt). The page needs the menu (invent a believable short one: antipasti, pasta, dolci, with prices in euros), hours, address and how to book. We have no photographs yet. Static HTML/CSS/JS.
Expected: A one-page restaurant site with a specific idea (for example the page as the menu itself), the menu set typographically without divider lines, practical information easy to find, bundled photographs used only as atmosphere and listed for replacement, and all house rules met.
