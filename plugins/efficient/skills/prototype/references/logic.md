# Logic prototype

A single, self-contained HTML file that lets anyone drive a state model by clicking buttons. Use it when the question is about business logic, state transitions, or data shape: things that look reasonable on paper but feel wrong once real cases go through them. Because it is one file with nothing to install, a designer, product manager, or domain expert can open it and probe the model themselves.

If the question is about appearance, use `ui.md` instead.

## Process

1. **State the question.** Write one visible paragraph at the top of the page saying which state model and which question this explores. A prototype that answers the wrong question is wasted, and a written question lets the user check it later.

2. **Isolate the logic in a portable module.** Put the logic that answers the question in one `<script>` block, written as a small pure module that could move into the real codebase unchanged. Pick the shape that fits the question.
   - A reducer, `(state, action) => state`, when actions are discrete events on one value.
   - An explicit state machine when which actions are legal in a given state is part of the question.
   - A few pure functions over a plain data type when there is no implicit current state.
   - A class with a clear method surface only when the logic truly owns ongoing state.

   Keep it free of the DOM and button handlers. The page calls the module and nothing flows the other way, which is what lets the validated logic outlive the throwaway page.

3. **Build the page.** Use plain HTML, CSS, and JavaScript with everything inline: no framework, bundler, or server, so it still opens when emailed around. Write labels in the user's domain language rather than the code's. Lay it out top to bottom:
   1. A title and one line saying what the demo lets you explore.
   2. The current state as a readable panel with labeled fields (not raw JSON), re-rendered after every click, with what just changed called out.
   3. Free-play buttons, one per action, always available so anyone can try any order.
   4. Guided walkthroughs, one per tab. Each tab describes the scenario in plain words and lists the ordered buttons to press. Starting a walkthrough resets to a known state so it runs the same each time.

   Choose scenarios that expose awkward cases: the happy path, a tricky edge case, and an attempt at something that should be illegal. Keep the styling restrained, with clear type, generous spacing, and one accent color.

4. **Hand it over.** Share the file path or open it for the user. The valuable moments are the ones where someone says "that shouldn't be possible" or "I assumed it worked differently", because each is a bug in the idea, which is what the prototype exists to find. Add actions or scenarios when they ask.

## Avoid

- Wiring it to the real database. Use in-memory state unless persistence is the question.
- Letting the logic module reference the DOM or handlers, which makes it impossible to lift out.
- Reaching for a framework, bundler, or dev server, which defeats "one file you double-click".
- Shipping the HTML shell. The page exists for clicking through by hand, and the logic module behind it is the part worth keeping.
