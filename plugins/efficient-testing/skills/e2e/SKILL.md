---
name: e2e
description: "Write, run, and diagnose browser end-to-end tests (Playwright, Cypress, etc.) for critical user journeys: accessible locators, condition-based waits, isolated test data and accounts, trace/screenshot artifacts, and flake classification. Use when adding or fixing an e2e spec, triaging a flaky or CI-only browser failure, or proving a journey works in a real browser. Not for installing a runner, unit/API tests (efficient:testing), or ad-hoc browser driving (playwright-cli:playwright-cli)."
---

# Efficient E2E Testing

Add, update, run, or diagnose a few browser-level tests that prove a critical user journey through the real rendered app. Test what a user can do and see, not component internals or implementation order.

Use the repo's installed runner and browser matrix. Don't install a runner, add dependencies, chase coverage targets, or rewrite the suite. Before relying on a runner API, look it up through Context7 (Playwright and Cypress APIs change across versions).

Related skills:

- `efficient:testing` covers non-browser tests.
- `efficient:web-development` covers fixing the browser-facing behavior itself.
- `efficient:react` covers component-level issues.
- `playwright-cli:playwright-cli`, if installed, covers driving a browser interactively without writing a spec.

## 1. Define the journey and harness

- Read the acceptance criteria or defect report, the affected route, the closest existing specs, the runner config, the CI workflow, and the local prerequisites.
- State the actor, the entry condition, the user actions, the expected visible outcomes, and the server effects the browser must reach.
- Choose the smallest critical path that proves the behavior. Add error, recovery, authorization, or cross-browser cases only when the requirement, the incident, or the changed boundary calls for them.

## 2. Keep identity and data safe

- Use a dedicated non-production environment and test-only accounts. Load credentials from the established secret mechanism, such as env vars or a stored auth state. Never commit, print, or screenshot passwords, session cookies, tokens, personal data, or production IDs.
- Seed data through existing test-only, authorized paths (API fixtures, DB seeds). Create data through the UI only when that setup flow is itself under test.
- Give each test unique, traceable, disposable data. Isolate tenant, user, storage, cookies, downloads, and server state from tests running in parallel. Clean up through a test-only mechanism, even after failure.
- Never mutate production, shared staging data, or resources the test didn't create. If safe isolation isn't available, stop and report the missing boundary.

## 3. Locate and act like a user

- Prefer role plus accessible name (`getByRole`), then the associated label, then visible text when that text is the product contract. Use a stable domain identifier only when accessible attributes can't tell equivalent controls apart.
- Assert that a locator is unique before relying on it. Avoid CSS classes, DOM position, generated IDs, and broad text matches.
- If the UI has no stable accessible identity, ask for a small, stable, semantic test hook on the user-facing element.
- Drive the journey through navigation, keyboard, pointer, forms, and real browser behavior.
- Assert visible content, accessible state, URL and history, downloads, or durable authorized outcomes. Don't assert private state or arbitrary request counts.

## 4. Wait on conditions, never time

- Before each step, name the condition that makes it valid. Examples are a route rendered, a control enabled, a dialog exposed, a request-backed status resolved, or navigation completed.
- Use the runner's auto-waiting locators, web-first assertions (`await expect(locator).toBeVisible()`), and `waitForResponse`/`waitForURL`-style primitives tied to that specific operation.
- Never use fixed sleeps (`waitForTimeout`), blind polling, unconditional retries, or inflated global timeouts.
- For a nondeterministic external dependency, use the environment's controlled substitute only if it still represents the product contract at that boundary. Otherwise classify the dependency as a blocker.

## 5. Keep browser boundaries explicit

- Run against the supported app command, base URL, browser binaries, services, and env vars, and record each prerequisite.
- Treat each of these as a separate boundary and exercise it only when the journey requires it, using test-environment mechanisms rather than real external accounts:
  - permissions
  - multiple tabs
  - downloads and uploads
  - cross-origin redirects
  - email, SMS, and payment providers
  - third-party widgets
  - native dialogs
- Never bypass auth, CSRF, origin, or browser security to make a test pass.
- Results can differ by engine, viewport, OS, headless mode, or CI network policy. Identify the supported matrix and target the affected boundary. A local pass doesn't prove CI or every browser.

## 6. Run proportionately and keep evidence

- Run the single spec or project first (for example `npx playwright test path/to/spec --project=chromium`), then rerun after each relevant change. Broaden only when repo policy, a shared-harness change, or the affected browser boundary warrants it.
- On failure, keep the runner report plus the relevant trace, screenshot, video, console output, network log, and server log. Redact or restrict artifacts that could hold credentials or personal data.

## 7. Diagnose from artifacts and classify

- Reproduce with the same spec, browser project, commit, data, and environment when safe.
- Compare expected and actual visible state using the trace timeline (`npx playwright show-trace`), console, network, and screenshot. Don't add retries.
- **Before changing anything, read [references/flake-triage.md](references/flake-triage.md) and classify the failure.**
- Change one cause at a time and rerun the smallest affected journey. Fix product, isolation, locator, or synchronization causes where they originate.

## Report

Cover the journey and outcomes, the test location, the exact command and browser project run, the data-isolation and cleanup approach, the locator and wait strategy for key steps, the boundaries not exercised, the artifacts kept, and the failure classification with its evidence.

Stop when the journey has direct browser evidence. Don't expand into coverage maximization, a runner migration, a suite rewrite, or destructive production checks.
