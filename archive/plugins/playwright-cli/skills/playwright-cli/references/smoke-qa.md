# Smoke QA

Read this when asked to check a deployed or local build in a browser before shipping: a page or journey smoke test, a responsive check, or an accessibility pass that ends in a verdict. Commands were run against the installed `playwright-cli`; confirm flags with `playwright-cli --help <command>`.

## Set the boundary

- Run read-only by default. A journey that purchases, deletes, mass-updates, or sends needs the user's explicit go-ahead and a staging or preview URL, never production.
- Use seeded test accounts. Read credentials through an approved path, as in [safety and cleanup](safety-cleanup.md), and keep them out of screenshots and the report.
- Use one named session for the whole pass, such as `-s=qa`, and close it at the end.
- Wait for readiness by checking the snapshot or a visible state, not a timer. Fixed sleeps hide slow pages and slow down fast ones.

## Phase 1: console and network smoke

```bash
playwright-cli -s=qa open https://staging.example.com/
playwright-cli -s=qa console error        # errors only
playwright-cli -s=qa console warning      # warnings and errors
playwright-cli -s=qa requests             # failed requests; successful static assets are hidden
playwright-cli -s=qa request 2            # headers, body, and response of request #2
```

- Treat console errors and 4xx/5xx responses as findings. Record known noise (analytics, third-party widgets) by name in the report instead of dropping it silently.
- `requests --filter "<regexp>"` narrows to an API path. `--static` includes successful images, fonts, and scripts.
- `console --clear` and `requests --clear` reset the lists, which is useful before a single interaction.
- Core Web Vitals (LCP, CLS, INP) need a lab or field measurement that `playwright-cli` doesn't provide. Say "not measured" and point to Lighthouse or real-user data. Don't estimate thresholds from a screenshot.

## Phase 2: interaction

1. Collect the navigation links, then visit each and check the URL, the page title, and the console.

   ```bash
   playwright-cli -s=qa eval "() => [...document.querySelectorAll('nav a[href]')].map(a => a.href)"
   playwright-cli -s=qa goto "<href>"
   ```

2. Submit each form with valid input and confirm the success state. Then submit invalid input, including empty required fields and a malformed value, and confirm that an error appears, names the field, and keeps the entered data. Verify from the fresh snapshot, because a zero exit code proves nothing about the page.
3. Walk the auth flow with test credentials: sign in, reach a protected page, sign out, and confirm the protected page no longer loads.
4. Walk the critical journeys (search, onboarding, checkout up to the final step). Stop before any mutating step unless it was authorized.

## Phase 3: visual at breakpoints

Capture each key page at three widths. These are starting points, so also add any width where the layout changes, and 320 px for reflow.

```bash
for w in 375 768 1440; do
  playwright-cli -s=qa resize "$w" 900
  playwright-cli -s=qa screenshot --filename="qa/home-$w.png" --full-page
  playwright-cli -s=qa eval "() => document.documentElement.scrollWidth > document.documentElement.clientWidth"
done
```

- A `true` from the overflow check means content is wider than the viewport. Find the element that causes it. Hiding the overflow with CSS hides the defect.
- Compare each capture against a committed baseline image with Read, and report differences in layout, missing elements, and overflow. If the repo has no baseline for that page and width, the result for that cell is **INCONCLUSIVE**, never a pass.
- Check dark mode when the app supports it: `playwright-cli -s=qa set-color-scheme dark`, capture again, then `clear-color-scheme`. `set-reduced-motion reduce` and `clear-reduced-motion` do the same for motion.

### Before/after pairs

When the task is to show the effect of a change, make the two captures comparable.

- Capture the before state first. If the change is already made, build the old revision in a separate `git worktree` (`git:worktree`) instead of reverting the working tree.
- Use the same width, height, URL, and screenshot target for both. For an element, pass the same ref or selector to `screenshot`. Avoid `--hires`, which captures device pixels and makes pairs differ by display.
- Take one capture per interactive state (hover, open menu, error, selected) for both sides, and move the pointer away before the "selected" capture. A single resting capture doesn't cover them.

## Phase 4: accessibility

Automated checks cover only part of WCAG, so a clean run is necessary and not sufficient. Don't report "accessible" from it.

1. **axe-core.** Inject the project's own copy, which is pinned by its lockfile, instead of loading a script from a CDN. Restrict the rules to the WCAG levels you are reporting against.

   ```bash
   playwright-cli -s=qa run-code "async page => {
     await page.addScriptTag({ path: './node_modules/axe-core/axe.min.js' });
     const r = await page.evaluate(() => axe.run(document, {
       runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
     }));
     return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
   }"
   ```

   If axe isn't in the project, skip this step and say so. A page with a strict Content Security Policy may refuse the injected script, which is a blocked check, not a clean result.

2. **Keyboard.** Press Tab repeatedly and record where focus lands each time. Check that every control is reachable, the order follows the visual order, focus is visible, and nothing traps it.

   ```bash
   playwright-cli -s=qa press Tab
   playwright-cli -s=qa eval "() => document.activeElement.outerHTML.slice(0, 120)"
   ```

3. **Structure.** Read the snapshot for landmarks, heading order, and control names.
4. **Screen reader.** Names and announcements need a person using a real screen reader. Use the `accessibility:screen-reader-testing` skill if installed, and list this as untested otherwise.

## Report

```markdown
## QA report: <url> at <timestamp>

**Environment:** browser, viewport list, build or commit, account used

### Smoke
- Console: <errors and warnings, noise named>
- Network: <failed requests with status>
- Web Vitals: not measured

### Interaction
- [pass/fail] <check>: <what was seen>

### Visual
| Page | 375 | 768 | 1440 |
| --- | --- | --- | --- |
| / | pass / fail / INCONCLUSIVE (no baseline) | | |

### Accessibility
- axe: <violations by id and impact, or "not run: reason">
- Keyboard: <result>
- Screen reader: not tested

### Verdict: SHIP | SHIP WITH FIXES | DO NOT SHIP | INCONCLUSIVE
<one line per blocker or fix>
```

- **DO NOT SHIP** when a critical journey fails, the page throws application errors or returns 5xx, focus is trapped, or axe reports a critical violation on a primary flow.
- **SHIP WITH FIXES** when the findings are real but don't block the main journeys. List each fix.
- **SHIP** only when every phase ran and found nothing blocking. Say what was not covered.
- **INCONCLUSIVE** when a phase couldn't run, such as no visual baseline, no test account, or an unreachable page. Name what is missing. Never turn a skipped check into a pass.
