# Recording Playwright Actions

Read this only when the user explicitly asks for generated Playwright action code. This is a CLI recording workflow, not guidance for creating or running a generic Playwright Test suite.

1. Start from a clean, authorized page state and inspect a snapshot before acting.
2. Start recording before the actions to preserve:

   ```bash
   playwright-cli -s=recording recording-start
   ```

3. Perform the smallest representative sequence using current snapshot refs. Do not record credentials or an irreversible final action unless explicitly authorized.
4. Stop recording and preserve the CLI's emitted Playwright action code:

   ```bash
   playwright-cli -s=recording recording-stop
   ```

5. Report the recorded scenario, any setup assumptions, and the generated output location or capture method. Review generated code before using it: page structure and locators can change, and recording alone does not prove the intended outcome.

To author, run, or maintain a Playwright Test suite, use the `efficient-testing:e2e` skill if installed instead. `generate-locator <ref>` gives a Playwright locator for one element.
