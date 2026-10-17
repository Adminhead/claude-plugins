# Issue forms, PR template, and community files

Read when the plan includes any file under `.github/` or a root policy file. Write each file in the repo's existing language and voice. Diff against what exists and ask before replacing customized files.

## Issue forms

Forms live in `.github/ISSUE_TEMPLATE/<name>.yml`. A form needs `name`, `description`, and a `body` list. Keep `labels:` values equal to labels that exist, or the form applies nothing. Format reference: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms

```yaml
name: Bug report
description: Something is broken
labels: [bug]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened, and what did you expect?
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
```

Add `config.yml` in the same directory to point questions elsewhere. Use `blank_issues_enabled: false` only when forms cover every legitimate report, and list real URLs under `contact_links` (Discussions, the security advisory page).

Start with bug and feature forms. Add a question form only when the repo has nowhere else for questions.

## PR template

`.github/PULL_REQUEST_TEMPLATE.md` holds headings the author fills in. Keep it short: what changed and why, how it was verified, and a linked issue (`Closes #<n>`). A template with ten checkboxes gets ticked without reading. For body content that helps reviewers beyond the template, see `github:pr`.

## CODEOWNERS

Place at `.github/CODEOWNERS` (also valid at the root or `docs/`). Last matching pattern wins. Use real handles (`@<user>` or `@<org>/<team>`) that have write access, or the rule is ignored. Ask who owns what instead of guessing. Check syntax errors afterwards with `gh api repos/{owner}/{repo}/codeowners/errors`.

## SECURITY.md

State supported versions, how to report privately, and what response to expect. Prefer GitHub private vulnerability reporting (`https://github.com/<owner>/<repo>/security/advisories/new`) over an email address, and turn the feature on in settings. Enabling it is a settings write, so route it through `github-admin:code-security`.

## CONTRIBUTING.md

Cover setup, how to run tests, branch and commit conventions (point to the repo's real convention, such as Conventional Commits when release-please or commitlint is configured), and the review process. Link to existing docs instead of copying them.
