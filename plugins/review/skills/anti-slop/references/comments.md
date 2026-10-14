# Comments and declaration docs

Read this when the artifact is code and the candidates include comments, doc comments, TODO markers, or commented-out code. Write for a maintainer reading the repository at HEAD months later, with no access to this conversation, the diff, or the review.

The default is no comment. A comment earns its place when it carries information a competent maintainer cannot recover from the code, names, types, tests, or config. Correct, polite, and already there are not reasons to keep one.

## Necessity test

Remove the comment in your head and ask whether a maintainer loses non-obvious information. If not, delete it. If unsure, delete it unless the repository shows the information matters (a test, an ADR, an issue, upstream docs).

Do not keep a comment because it sounds serious. "Important", "Never", "Security", and "Required" add no information; judge the content.

## Decision order

Decide whether a comment should exist before deciding how it reads. Take the first option that fits.

1. **Delete** when the code already says it.
2. **Express in code** when a small local change removes the need: a clearer name, a named boolean for a condition, a flatter branch. Keep it behavior-preserving and tied to the comment.
3. **Shorten** when it is needed but wordy.
4. **Rewrite** when it is needed but unclear, inaccurate, or stale.
5. **Move to declaration docs** when it describes the declaration's contract, such as semantics, side effects, units, or error behavior.
6. **Keep** when it is already necessary, minimal, accurate, and durable.

Never polish a comment that should be deleted.

## Keep

- Why intentionally surprising code exists, and why the simpler version would be wrong.
- External constraints, compatibility requirements, and workarounds, with the reason.
- Invariants, ordering, timing, concurrency, and security constraints.
- Units, formats, ranges, and cross-field relationships.
- Non-obvious coupling between files or modules.

## Remove

- Prose that restates or narrates the next line: "fetch the user", "return early".
- Text that repeats a name, type, or signature.
- Section banners and decorative separators.
- Change history ("now", "previously", "no longer") and notes to the reviewer or to a conversation.
- Bare rules with no reason: "do not change this".

## Never invent a rationale

Keep or write a reason only when the repository, tests, config, official docs, or a tracker supports it. Do not make up a security, performance, compatibility, or historical reason to justify a comment. If you cannot support the reason, remove the comment or ask.

## Declaration docs

Doc comments are not a coverage target. Add them where callers need contract information that the signature does not carry: preconditions, errors, side effects, lifecycle, concurrency, deprecation. Do not add `@param` or `@returns` tags that repeat the types. Plain DTOs, records, and internal helpers usually need none. Published libraries and external APIs deserve more.

Python docstrings and similar runtime-visible docs can feed generated documentation or introspection. Check the supported contract before removing or rewording one.

## TODO, FIXME, HACK

Treat markers like any comment. Check each is still true and actionable. Remove stale, done, or empty ones. Follow the repository's convention for owners or issue links only if it has one. Do not add a marker to make a plain comment look important, and do not do unrelated work to clear a valid one.

## Commented-out code

Delete it. Version control keeps the history. Keep it only for a current purpose: a copyable example, a documented fallback that maintainers re-enable under a named condition, or syntax that tooling requires.

## Protected constructs

Leave these alone unless you verify they are obsolete: shebangs, lint, formatter, type-checker, and coverage directives, build tags and pragmas, generated-file markers, encoding lines, source-map comments, required annotations, and license headers. For a suppression, check whether it is still needed before removing it, never broaden one, and treat legal headers as off limits without project authority.

Text that only looks like a comment (inside strings, regexes, snapshots, fixtures, templates) is data.

## Acceptance check

- Every remaining ordinary comment carries information the code does not.
- Narration, labels, banners, and bare warnings are deleted, not reworded.
- Declaration docs add contract detail beyond the signature.
- No rationale or history was invented.
- Stale markers and unjustified commented-out code are gone.
- Protected constructs and runtime-visible docs are intact.
- The diff holds no unrelated changes, and the project's checks still pass.

If most original comments survived a cleanup that mostly rewrote wording, reapply the necessity test. Do not aim for a comment count. Stop when more deletion would remove useful information.
