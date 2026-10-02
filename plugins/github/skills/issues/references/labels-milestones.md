# Labels and milestones

## Labels

Labels belong to a repository. Creating one and applying it are separate steps, so list the existing set before using a name.

```bash
gh label list --limit 1000 --json name,color,description     # read; default limit is 30
gh label create "needs-triage" --color FBCA04 --description "Awaiting maintainer review"
gh label create "needs-triage" --color FBCA04 --force        # create or update, repeatable
gh label edit "old-name" --name "new-name" --color 0E8A16
gh label delete "old-name" --yes
gh label clone OWNER/SOURCE-REPO                             # copy a label set into the current repo
```

Color is six hex digits without `#`. Descriptions are 100 characters or fewer. Creating an existing label fails unless you pass `--force`. Deleting a label removes it from every issue, so name the blast radius when you ask for approval.

Apply or remove labels on issues with `gh issue edit N --add-label "a,b" --remove-label "c"`.

## Milestones

gh has no milestone command. Use REST. `gh issue create --milestone` and `gh issue edit --milestone` take the milestone title, while the REST paths use its number.

```bash
gh api "repos/OWNER/REPO/milestones?state=all&per_page=100" --paginate \
  --jq '.[] | {number, title, state, open_issues, closed_issues, due_on}'
gh api repos/OWNER/REPO/milestones -X POST -f title="v2.0" -f description="..." -f due_on="2026-12-01T00:00:00Z"
gh api repos/OWNER/REPO/milestones/3 -X PATCH -f state=closed
gh api repos/OWNER/REPO/milestones/3 -X DELETE
```

`due_on` is an ISO 8601 timestamp. Deleting a milestone detaches its issues but leaves them open.
