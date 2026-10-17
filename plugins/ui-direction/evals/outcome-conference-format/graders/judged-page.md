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

Brief: Landing page for Format, a two-day design conference in Rotterdam on 14 and 15 May 2027. Twelve speakers (invent plausible names and talk titles), 400 seats, tickets at 390 euros, venue: Maassilo. Sections: what it is, the line-up, the schedule in brief, tickets, and a short FAQ. No brand exists yet beyond the name. Static HTML/CSS/JS.
Expected: An event page with a strong typographic or colour idea, the line-up and schedule set as structured text without divider lines or index numbers, a ticket section that is not three cards, and all house rules met.
