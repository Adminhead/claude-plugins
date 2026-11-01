---
type: llm
focus: { source: file, path: app/src/main/java/com/example/profile/ProfileScreen.kt }
weight: 3
---

Judge only the final ProfileScreen.kt.

PASS only if all hold:
1. A separate composable renders the UI from plain parameters: immutable state (or plain values) plus callbacks for edits and save. It does not take or reference a ViewModel.
2. The ProfileViewModel-taking composable only wires: it passes state and callbacks into that content composable.
3. `vm.load()` is no longer called directly in the composable body; it runs inside an effect such as `LaunchedEffect`, or in the ViewModel's init or an equivalent non-composition place.
4. A `@Preview` composable calls the content composable with sample state.

FAIL otherwise. Do not reward length or extra files.
