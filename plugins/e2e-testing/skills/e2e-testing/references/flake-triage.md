# E2E failure and flake triage

Read this before changing code or tests in response to a failing or intermittent browser test. Classify the failure first, then fix it where it originates.

| Class | Signal | Fix where |
| --- | --- | --- |
| **Product defect** | The app reaches a wrong user-visible or authorized outcome under valid test conditions. | Application code |
| **Wrong expectation or locator** | The assertion disagrees with the product contract, or the locator matches the wrong element or several elements. | The spec. Tighten the locator; never broaden it. |
| **Data or isolation leak** | Shared, stale, missing, unauthorized, or uncleaned data changes the precondition. Often it passes alone and fails in parallel. | Fixtures, seeding, cleanup, per-test data |
| **Synchronization defect** | The test moves on before its readiness condition is met, or the app has a real race that users can hit too. | Wait on the specific observable condition. If users can hit the race, fix the app. |
| **Environment or infrastructure** | Missing browser binary, app or service startup failure, DNS or network, certificates, resource exhaustion, CI permissions, or a third-party sandbox outage. | Environment or CI config. Report it as a blocker. |
| **Browser- or CI-specific** | The same journey differs by engine, headless mode, viewport, OS, or CI policy. | The affected boundary, within the supported matrix |
| **Unclassified flake** | Intermittent, without enough repeatable evidence. | Keep the artifacts and conditions. Quarantine only under established repo policy, and report it. |

## Rules

- Don't mask a failure with arbitrary delays, blanket retries, broader selectors, disabled assertions, or a production-only exception.
- To estimate how often a failure occurs, repeat the single spec (`--repeat-each=N` in Playwright) rather than rerunning the whole suite.
- A passing retry is not a fix. Report the first failure's artifacts.
