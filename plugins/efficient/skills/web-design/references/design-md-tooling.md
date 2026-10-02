# DESIGN.md format and tooling

Read this only when the repo has adopted the Google Labs `DESIGN.md` format, or when a request asks to validate, compare, or look up that format. The format is alpha, so verify the resolved tool version and the spec before relying on details.

## Specification

- Canonical spec (tracks upstream `main`): <https://github.com/google-labs-code/design.md/blob/main/docs/spec.md>
- The spec for the package version that `npx` resolves:

  ```bash
  npx @google/design.md spec
  npx @google/design.md spec --rules
  ```

When the two sources differ in a way that affects a decision, record which one you used.

## Optional checks

Run these only when the project already uses this CLI or the request asks for format validation. `npx` downloads and executes a package, so ask first if the project hasn't approved it. These checks are never a prerequisite for ordinary design review.

```bash
# Lint one file. Output is JSON; nonzero exit means errors.
npx @google/design.md lint DESIGN.md
npx @google/design.md lint --format json DESIGN.md

# Compare a prior copy with the revision.
npx @google/design.md diff DESIGN-before.md DESIGN.md
```

Lint and diff output is evidence about format and tokens only. It says nothing about whether the rendered interface serves users. Resolve errors before claiming format validity. Weigh warnings in product context rather than mechanically adding tokens, sections, or components.
