# Triage rubric and reply drafts

Read at step 1 when a thread's action isn't obvious (a bot suggestion, a design opinion, two reviewers disagreeing), and at step 3 when drafting replies. Everything here produces text for the user. Posting, resolving, and requesting reviews stay with the user.

## Reviewer type

| Reviewer | Default action |
| --- | --- |
| Human | `clarify` or `push back` goes to the user as an open question, never as a settled decision. Recommend `fix` only when the request is clear and local |
| Security or code-scanning bot (for example `github-advanced-security`) | Surface to the user. Follow the repo's documented suppression or fix convention if there is one, and cite it |
| Other review bots (Copilot and similar) | Triage with the rubric below, since their suggestions are often generic |

A human thread left unanswered reads as ignored, so every human row ends with a draft reply, even when the action is `push back`.

## Value against risk

Score each request on value (what the fix gains, minus the cost to make and review it) and risk (blast radius, reversibility, effect on unrelated code).

| Value | Risk | Action |
| --- | --- | --- |
| Clear gain | Low | `fix` |
| Marginal | Low | `fix` if it is a few lines, otherwise `push back` with the reason |
| Clear gain | High or irreversible | `clarify`: put the proposal to the user before touching code |
| Marginal | High | `push back` |
| Negative (over-engineering for a hypothetical) | Any | `push back` |

## Fix when the request is

- A real correctness bug: lifetime or race that loses data, an off-by-one, a null dereference, an unhandled error path, a check that skips legitimate cases.
- A cross-cutting concern with a clean local fix, such as widening a lock's scope or pulling a duplicated check into a helper.
- Drift between a code comment or the test plan in the repo and the code. When the PR description drifted, editing it is a write on GitHub, so the row is `clarify` and the report includes corrected text for the user to paste.

## Push back when the request is

- A hypothetical race or failure you can rule out, in which case cite the interleaving or input that cannot occur.
- Style, naming, or formatting the repo's formatter and linter already decide.
- A new abstraction that doesn't pay for itself at this scale.
- Against an established convention in the surrounding code.
- A micro-optimization off the hot path.

## Check repo policy before a generic fix

Some findings are settled by project convention rather than general reasoning. Look at `CLAUDE.md`, `CONTRIBUTING`, `.github/` instructions, linter and spell-check config, and neighboring files before deciding.

- Spell-check findings follow the repo's own mechanism (reword, dictionary entry, or inline ignore).
- Lint suppressions need the inline rationale the repo expects.
- License headers and test frameworks copy the neighboring files. Don't add a framework because a reviewer suggested one.

Cite the config or file in the row's reason.

## Conflicting requests

When two threads disagree, or a request would undo an earlier edit:

1. Re-derive from the function's contract and the surrounding code, not from which comment came last.
2. Prefer the position with a concrete failure mode (security, correctness, data loss) over a stylistic one.
3. Prefer a human reviewer over a bot when they conflict directly.
4. If it is still unclear, mark `clarify` and put both positions side by side in the row.

If a fix would revert a change made earlier in this review, stop and ask. That pattern is how review loops oscillate.

## Escalate to the user

Mark the row `clarify` and don't fix when the request is a design trade-off with several reasonable answers, a large or cross-cutting change, or something risky or irreversible (deleting data, touching credentials, rewriting history).

## Cite the rule

Each row's reason names the rule that decided it in a few words, such as "style, repo formatter owns it" or "security bot, follows documented suppression". "Looks small" is not a reason.

## Reply drafts

Drafts are for the user to paste. Lead with the reasoning, keep each to a few lines, and use no commit hash until the user has committed the fix. Replace placeholders in angle brackets.

**Fix**

```text
<one sentence acknowledging the finding>. <one or two sentences on what changed and why>. Fixed in <commit>.
```

**Decline**

```text
Considered this and not changing it: <concrete reason from the code or design>. <the scenario ruled out, or the cost of the alternative>. Happy to revisit if <specific trigger>.
```

**Drift (comment or test plan in the repo)**

```text
Good catch. Updated the <comment in `<file>` | test plan> to match the behavior: <the corrected statement>.
```

For PR-description drift, draft the corrected paragraph for the user to paste into the description, and a reply such as "Good catch, I'm updating the description to say <the corrected statement>."

**Partial fix**

```text
Fixed <the immediate part> in <commit>. The broader <concern> would need <larger change>, which I'd rather land separately because <reason>. Tracking in <issue link>.
```
