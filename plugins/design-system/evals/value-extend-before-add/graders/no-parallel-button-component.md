---
type: llm
weight: 3
---

The user asked the assistant to propose something in the design system so teams stop building their own red delete buttons. The existing `Button` already has `variant`, `size`, `loading`, icon and `fullWidth` props, six states, and a danger colour token. Judge the final message as a proposal a design system team would act on.

PASS only if all of these hold:

1. The button itself is proposed as an addition to the existing `Button` (a new value of an existing prop, or a new prop on it). A separate standalone button component that duplicates `Button`'s props and states is a FAIL, unless the response first explains concretely why a `Button` variant cannot do the job.
2. The response says what it reuses from the existing system (at least the danger colour token and the shared states) and flags any new token it would add, with a reason.
3. If the response proposes anything new and separate (for example a confirmation dialog, since teams use `window.confirm`), it presents that as a different gap with its own justification, and the delete button is still handled under criterion 1.

FAIL otherwise. Do not reward length or a long list of options.
