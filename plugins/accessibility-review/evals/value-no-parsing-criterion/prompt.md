---
name: value-no-parsing-criterion
description: Value case. Markup with duplicate ids and mis-nested tags audited against WCAG 2.2 AA; findings must not be filed under the criterion 2.2 removed.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

can you run a WCAG 2.2 AA check on this signup form markup before it goes to QA? give each finding as one line in the form `SC <number>: <problem> -> <fix>` and nothing else, no preamble or summary.

```html
<form id="signup" action="/signup" method="post">
  <div class="field">
    <label for="email">Email</label>
    <input type="text" id="email" name="email" placeholder="you@example.com">
  </div>
  <div class="field">
    <label for="email">Confirm email</label>
    <input type="text" id="email" name="email2">
  </div>
  <p class="hint">Use your work address.<div class="error" id="err"></p></div>
  <button type="submit" class="btn">Create account</button>
</form>
```
