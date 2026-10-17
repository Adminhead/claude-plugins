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

Brief: Build a landing page for Ledgerly, an invoicing tool for freelance designers. What it does: you write an invoice in under a minute, the client pays by card or bank transfer, and it sends polite reminders by itself when an invoice is overdue. It costs 9 euros a month flat, with a 14-day free trial and no card needed. Include pricing and a short FAQ. There is no existing brand and no screenshots; the product name is all we have. Plain static HTML, CSS and JS in one folder.
Expected: A static landing page with a clear idea drawn from invoicing itself, headlines of two lines or fewer at 1440/768/390, no eyebrow labels, no monospace, no index numbering, no thin rules, no gradients or shadows, a non-default palette and type system, a pricing section that is not three cards, and no invented customers or statistics.
