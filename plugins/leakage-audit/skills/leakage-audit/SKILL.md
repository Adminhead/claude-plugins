---
name: leakage-audit
description: Audits an eval, metric, experiment or benchmark for leakage and reports which independence checks fail, each with a fix. Use when asked "is this A/B actually measuring anything?", "is the grader the same model a problem?", "is this holdout clean?", or when a result looks too clean. Read-only. Not for writing evals or a pre-mortem.
---

# Leakage audit

Check whether a validation is independent: does outside ground truth enter, or are the designer, model and scorer confirming each other? A whole group can confidently agree on something nobody independently produced, and a leaky validation has the same shape.

Adapted from the `mandela` skill in LilMGenius/paperthin (MIT).

## Not for

- Writing or running evals: use the skill-evals skill.
- Stress-testing a plan or claim with a pre-mortem or evidence audit: use `the-fool`.

## Workflow

1. Identify the validation (eval, metric, experiment, holdout, or "how we'll know"). Name its components: what plays model, scorer, designer and dataset.
2. Ask the core question: does external ground truth enter independently?
3. Test the validation against the patterns below. Some apply only to certain components, such as a human subject or a scorer. Report only the ones that fire, each by name.
4. Give the independence fix for each hit: the outside source, blind labeler or separate pool that would break the loop.
5. Name the root. If several hits share one cause, lead with it instead of a laundry list.

## Patterns

1. **Recall, not reason**: a memorized answer is recited instead of derived, so the system already knows the result it is supposedly computing.
2. **Wrong null**: an ablation removes a surface label but not the underlying signal the system exploits, so the control still leaks.
3. **Shared hallucination**: two components verify each other, and the circularity is reported as a number.
4. **Tautology**: a scorer grades buckets it drew itself.
5. **Verifier is designer**: a private, unreproducible recipe dressed as a holdout.
6. **Shared-pool bias**: train and holdout come from one labeler pool, so one bias enters both sides.
7. **Frame injection**: the question hands the subject the hypothesis.
8. **Demand characteristics**: measured subjects know they are being measured.

## Rules

- Blinding the output value does not blind the collection recipe. Check both.
- Read-only. Name the leak and the independence fix; do not rewrite the experiment.
- For high stakes, add one independent fresh-context auditor, handed only the validation design and not this session's reasoning, to run the patterns blind. The default stays same-session.

## Before finishing

1. Run patterns 3 to 5 on yourself: are you scoring buckets you drew, is the verifier the designer, is your verdict a shared hallucination with the design's own claims?
2. A reader who did not run the audit could reach your verdict from the cited evidence alone.
3. The report names the root, not a laundry list.
