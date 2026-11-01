# Compose UI tests

Adapted from chrisbanes/skills `compose-ui-testing-patterns` (Apache-2.0, see NOTICE). Test the smallest UI contract that proves the behavior.

## Dependencies and rules

- `androidTestImplementation("androidx.compose.ui:ui-test-junit4")` for instrumented tests, `testImplementation` for Robolectric; `debugImplementation("androidx.compose.ui:ui-test-manifest")` so `ComponentActivity` is declared in the debug manifest. Versions come from the Compose BOM the project already uses.
- `createComposeRule()` hosts content in a stock `ComponentActivity`. `createAndroidComposeRule<MyActivity>()` launches your activity and gives `activity` access. `createEmptyComposeRule()` leaves launching to you (use with `ActivityScenario`).

## Choose the seam

| To prove | Test shape |
| --- | --- |
| Branch of the UI (loading, error, empty), conditional content | plain composable with `setContent` and fixed state |
| Callback wiring from a click or input | plain composable, captured callback |
| Focus or key handling | compose test sending key events; assert focused semantics |
| Hover, pressed, focused, dragged state | inject a `MutableInteractionSource` (below) |
| State holder logic | state holder test on the JVM (`kotlin-testing`) plus one wiring smoke test |
| Navigation, lifecycle, DI | integration test |

If the screen splits into a stateful wrapper and a stateless content composable, test the stateless one:

```kotlin
var saved = false
composeTestRule.setContent {
    ProfileScreen(state = ProfileUiState(name = "Ada", canSave = true), onSaveClick = { saved = true })
}
composeTestRule.onNodeWithTag("save").assertIsEnabled().performClick()
assertThat(saved).isTrue()
```

No ViewModel, repository or navigation graph is built, so nothing asynchronous can leak in. For a captured value, assert directly after the action; use `runOnIdle` when the assertion needs recomposition or queued work to finish.

## Finders and semantics

- Prefer semantics that express behavior: `assertIsEnabled`, `assertIsNotEnabled`, `assertIsSelected`, `assertIsToggleable`, `assertIsOn`, `assertDoesNotExist`.
- Do not assert a label or a string just to see it. Finding a node by its text to click it is fine; asserting the text is the whole point of the test is a copy test.
- Use `Modifier.testTag` for nodes with no stable semantics or with duplicate text. A tag is a test seam, not a first choice for every assertion.
- `onNodeWithText`, `onNodeWithContentDescription` and tags search the merged tree: a `Button` with an `Icon` and `Text` is one node. Pass `useUnmergedTree = true` to reach a child: `onNodeWithText("Ada", useUnmergedTree = true)`. `assertIsDisplayed` may then behave differently, so check the result.
- To see what the tree looks like, `composeTestRule.onRoot(useUnmergedTree = true).printToLog("TREE")` and read logcat or the Robolectric output. Remove it before finishing.

## Waiting without sleeping

Compose synchronizes with its own recomposition and with Espresso on its own. A test only waits explicitly for work Compose cannot see.

```kotlin
composeTestRule.waitUntil(timeoutMillis = 5_000) {
    composeTestRule.onAllNodesWithTag("row").fetchSemanticsNodes().size == 3
}
// or the built-ins:
composeTestRule.waitUntilExactlyOneExists(hasTestTag("detail"), timeoutMillis = 5_000)
composeTestRule.waitUntilDoesNotExist(hasTestTag("spinner"), timeoutMillis = 5_000)
```

- Never `Thread.sleep` or `delay` in a test. A `waitUntil` must wait on a real condition, with a bounded timeout.
- Work done on a background dispatcher (a repository, an image loader) is invisible to Compose. Make it deterministic: a fake repository with fixed data, or register an `IdlingResource` (`composeTestRule.registerIdlingResource(...)`) that reports busy while the work runs. Replacing the dispatcher with a test dispatcher through DI is usually cleaner.
- Animations: for a test that cares about a frame, set `composeTestRule.mainClock.autoAdvance = false`, then `mainClock.advanceTimeBy(ms)` to the point you want to observe and assert there. Otherwise leave auto-advance on. Infinite animations (a spinner) never go idle with auto-advance on a `waitForIdle` in some setups; stop them in the test state or advance the clock manually.
- Fake image loading or other platform services when the content is irrelevant, and assert the requested model if that is the behavior.

## Interaction state

To test hover, press, focus or drag appearance, inject a `MutableInteractionSource` and emit the interaction. Do not simulate pointer events.

```kotlin
val interactionSource = MutableInteractionSource()
composeTestRule.setContent { MyButton(onClick = {}, interactionSource = interactionSource) }

runBlocking { interactionSource.emit(PressInteraction.Press(Offset.Zero)) }
composeTestRule.waitForIdle()
composeTestRule.onNodeWithTag("button").assertIsEnabled()   // assert the observable result
```

- `emit` is a suspend function; call it from a test coroutine (`runBlocking`, `runTest` or a `TestScope`), never from a `LaunchedEffect` in production code.
- The same shape works for `HoverInteraction.Enter`, `FocusInteraction.Focus` and `DragInteraction.Start`.
- Assert a semantic or enabled-state result, not the interaction object. If the result is only visual (a color), the project must already have screenshot tests for it; otherwise it is not worth a test.

## "No compose hierarchies found"

The test queried before any Compose content existed. Check in order:
1. `setContent` is never called, or is called after the first finder. With `createComposeRule()` call it in the test body; with `createAndroidComposeRule<A>()`, `A` already set content in `onCreate`, and calling `rule.setContent` as well throws "Compose content already set".
2. `createAndroidComposeRule<A>()` or `createComposeRule()` with an activity that is not a `ComponentActivity` or is not declared in the manifest. Add `ui-test-manifest` as a `debugImplementation`. For a mixed project, use `createAndroidComposeRule<MyActivity>()`.
3. The rule's activity was not launched yet: with `createEmptyComposeRule()` launch with `ActivityScenario.launch(...)` first, or the screen is a `Fragment` whose `ComposeView` is not attached yet (wait for the fragment, then `waitForIdle`).
4. The Compose content is in a different window (dialog, popup, a second activity): queries target the rule's root. Dialogs and popups from the same content are found; content from another activity is not.
5. Under Robolectric, the test class has no `@RunWith(AndroidJUnit4::class)` or the instrumentation is missing; see [robolectric.md](robolectric.md).
6. A Hilt activity is hosting the content without Hilt test setup, so the activity crashes at launch. Read the first exception in the log: see [hilt.md](hilt.md).
