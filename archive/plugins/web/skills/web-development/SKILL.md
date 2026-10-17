---
name: web-development
description: "Build or repair a browser-facing web feature end to end: semantic HTML and forms, responsive CSS, keyboard/focus behavior, request/response contracts, server-side validation, error mapping, and measured delivery performance, verified in a real browser. Use for a form, page, or flow that must work for real users, HTTP API contract changes, or browser/network bugs. Not for React/TanStack internals, visual design decisions, or auth/session logic (auth:auth, if installed)."
---

# Efficient Web Development

Deliver a small working vertical slice, from the browser entry point through its server boundary. Keep the existing product intent and conventions, and change the smallest boundary that produces the required behavior.

Hand off what this skill does not own:

- React component and state mechanics go to `coding-js:react`, if installed.
- TanStack routing and server state go to `coding-js:tanstack`, if installed.
- Visual hierarchy, variants, and interaction intent go to `web:web-design`. Implement its acceptance criteria rather than inventing them.
- Login, sessions, tokens, and authorization rules go to `auth:auth`, if installed.
- Unit and regression test scope goes to `testing:unit`. Browser suites go to `testing:e2e`.

## 1. Establish the user contract

- State the user action, visible result, network or data effect, required states (loading, empty, error, success, disabled, recovery), and what evidence will show it is done.
- Assign each concern an owner. The browser owns semantics, forms, interaction, responsive CSS, browser APIs, and accessibility. The server owns authentication and authorization decisions, validation, durable mutation, status codes, and error shape.
- If the product decision, API contract, or auth model is unknown, read the authoritative local source before editing. Don't fabricate one, and don't add a compatibility path without evidence.
- **When adding, changing, or diagnosing an HTTP API contract, read [references/api-contract-review.md](references/api-contract-review.md).**

## 2. Trace the full path first

Follow the input from markup and event handler through request construction, server validation and authorization, response mapping, and rendered state. Record the method, URL, payload, credentials mode, success result, and user-safe failure.

Check these only when they affect the requested path:

- direct entry
- refresh
- back/forward
- slow or offline network
- duplicate submit
- cancellation

## 3. Prefer the platform

- Use landmarks, headings in order, native links, buttons, and inputs, `<label>`, `fieldset`/`legend`, and native validation where they fit.
- Use ARIA only to fill a native gap. When you add ARIA, implement its keyboard, focus, name, state, and update behavior together.
- Use normal flow, flexible layout, and content-driven breakpoints. Use media queries for viewport and user preferences. Use container queries only when a reusable component must respond to its parent's width. Read [references/responsive-css.md](references/responsive-css.md) for container-query syntax and pitfalls, fluid type, `svh`/`dvh`, and overflow fixes.
- Don't add custom controls, client state, dependencies, or API layers unless the existing boundary can't meet the contract.

## 4. Forms as recoverable operations

- Give every control a visible or programmatic label, and state format and constraint information before submit. A placeholder is never the only label.
- Keep entered values after a recoverable failure.
- On submit, prevent duplicate mutations, show a clear pending state, and restore usable controls afterward.
- Leave focus in place for inline feedback. Move it deliberately to a new context, an error summary, or the first actionable error when that helps the user continue.
- Don't make people retype information they already gave in the same process. Auto-populate it or let them select it, except where re-entry is essential, a security check (confirming a new password), or the earlier value is no longer valid (WCAG 2.2 SC 3.3.7 Redundant Entry, Level A).
- Never rely on color alone. Never make a non-control clickable as if it were a control.

## 5. Server boundary

- Treat every browser value as untrusted, including hidden fields and results of client-side validation.
- Authenticate the request, authorize the specific action on the specific resource, and validate shape, range, and ownership on the server. Use parameterized queries or the established data layer.
- Keep the repo's existing session, CSRF, origin, cookie, upload, redirect, and content-handling controls. Never weaken one to make a flow work.
- If a cross-origin, credentialed, redirect, upload, or HTML-rendering path has no established policy, stop and get a security or API decision.
- Keep secrets, tokens, and internal diagnostics out of markup, URLs, client logs, and responses.

## 6. Explicit, browser-safe responses

- Map each expected outcome to a stable status and body, and render each one deliberately. Distinguish correctable input errors from 401, 403, 404, 409, and unexpected failures.
- Never expose stack traces. Never turn a failed mutation into apparent success.
- Make repeated mutations safe per the server's contract. If the contract says nothing, surface the failure and ask. Don't invent idempotency.
- Handle cancellation and stale responses so an older response can't overwrite newer user intent. Use `AbortController` or a request-sequence check.

## 7. Responsive and accessible behavior

- Keep source, reading, and focus order aligned.
- Check the page at narrow width and 200% zoom, with no avoidable horizontal scroll and every control reachable.
- Keyboard users must be able to reach and operate everything, see focus, dismiss transient UI with Escape, and get focus back after a temporary context closes.
- Give images appropriate alternatives, make link purpose clear in context, and announce meaningful async status or errors through live regions without flooding.
- An automated score is not conformance.

## 8. Performance only when measured

- Take a baseline for the changed flow with browser tooling (Network, Performance, Lighthouse) under representative conditions.
- Inspect requests, payload sizes, render-blocking work, image, font, and script delivery, and user-visible timing.
- Judge field and lab results against the Core Web Vitals "good" thresholds, measured at the 75th percentile: LCP within 2.5 s, INP within 200 ms, and CLS within 0.1 (<https://web.dev/articles/vitals>). TTFB is a diagnostic rather than a Core Web Vital, with a good value of 0.8 s or less (<https://web.dev/articles/ttfb>). Thresholds change, so confirm them at the source when a number decides something.
- Fix the measured bottleneck with the smallest change, then rerun the same measurement.
- Record each before and after run in a table (Metric, Before, After, Delta, Verdict) with the same page, device profile, and throttling. Treat bundle-size or timing budgets as examples to compare against, not targets to hit without a measured user impact.
- Don't add caching, preloading, code splitting, compression, service workers, or telemetry because they are customary. When you change delivery, keep cache correctness, privacy, and invalidation intact.

## 9. Validate the integrated journey

- Run the narrowest checks that reach the change, then exercise the real journey in a browser. Cover the success path and each required failure or recovery state.
- For accessibility or responsive changes, also walk the keyboard path, inspect the accessibility tree, and check the narrow and zoomed layouts.
- For a bug, reproduce the symptom before fixing it when practical. Keep a regression test or durable reproduction.
- **When browser evidence or failure diagnosis is needed, read [references/browser-diagnostics.md](references/browser-diagnostics.md).** It covers the Playwright MCP (web), `playwright-cli:playwright-cli` (if installed), the claude-in-chrome skill, and what to capture.

Stop when the requested journey has direct evidence at the affected boundaries. Don't broaden the change into a framework migration, redesign, cleanup, or unmeasured optimization.
