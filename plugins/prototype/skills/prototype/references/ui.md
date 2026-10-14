# UI prototype

Several radically different UI variants on one route, switchable from a floating bar. The user flips between them in the browser, picks one or combines parts, and the rest are thrown away. Use it for "what should this page look like" and "show me options for this layout". If the question is about logic or state, use `logic.md` instead.

For aesthetic direction on the variants, `frontend-design:frontend-design` (if installed) helps, and the project's existing component library and styling system still govern the code.

## Where to put the variants

Variants are easier to judge next to the rest of the app (real header, real data, real density) than alone on an empty route, where every option looks fine.

- **Preferred: an existing page.** Render the variants on the page's current route, selected by a `?variant=` search parameter. Keep the data fetching, params, and auth above the switch so only the rendered subtree changes. A new section or card that would naturally live inside an existing page still counts, so mount the variants inside that host page.
- **Last resort: a new page.** Use a throwaway route only when there is truly no host. Follow the project's routing convention, put `prototype` in the path or file name, and use the same `?variant=` parameter. First check that the thing couldn't be embedded in an existing page.

## Process

1. **State the question and pick the count.** Default to three variants and cap at five, since more stops being radically different and becomes noise. Write the plan in one line at the top of the prototype (for example, "three variants of the settings page on the existing `/settings` route, switched by `?variant=`").

2. **Draft structurally different variants.** Each gets the page's purpose, the data it can use, the project's component library, and a clear exported name (`VariantA`, `VariantB`). Variants must differ in layout, information hierarchy, or primary action, not just color or copy. Three tweaked card grids are not a prototype. If two drafts come out alike, redo one with an explicit constraint such as "no card grid".

3. **Wire a switcher.** Read the variant from the search parameter (default `A`), render the matching component, and render one shared switcher component. Keep all existing data fetching above the switch.

4. **Build the floating switcher.** A small fixed bar at the bottom center with a previous arrow, a label showing the current key and name, and a next arrow, both wrapping around.
   - Clicking updates the URL parameter through the framework's router, so the variant is shareable and survives a reload.
   - Left and right arrow keys also cycle, except when an input, textarea, or editable element has focus.
   - Make it look distinct from the page, such as a high-contrast pill, so it isn't mistaken for the design under review.
   - Hide it outside development, using the framework's dev flag (for example `import.meta.env.DEV` in Vite, or `process.env.NODE_ENV !== 'production'`), so a stray merge can't ship it to users.

5. **Hand it over.** Give the URL and the `?variant=` keys. Feedback often comes as "the header from B with the sidebar from C", and that mix is the design the user actually wants. If `playwright-cli:playwright-cli` is installed, use it to confirm each variant renders without console errors before handing over.

6. **Clean up.** When a variant wins, record which and why. Fold it into the existing page, or promote it to a real route if it was a new page, then remove the other variants and the switcher from main.

## Avoid

- Variants that differ only in color or copy.
- Sharing too much between variants. A shared header is fine, and a shared layout defeats the point because each variant should be free to discard the layout.
- Wiring variants to real mutations. Read-only is fine, and a variant that must write should point at a stub, because the question is how it looks.
- Promoting variant code straight to production. It was written without tests or error handling, so rewrite it as you fold it in.
