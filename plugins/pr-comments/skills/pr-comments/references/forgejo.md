# Fetching review feedback on Forgejo and Codeberg

Read this at the fetch step when the forge is Forgejo, Codeberg or Gitea. The reads below are the only forge calls; the read-only rule in SKILL.md applies. A Gitea host is treated as Forgejo, but these commands were written against Forgejo only. `fj` is 0.x: confirm any flag with `fj pr --help` and the leaf's `--help` before relying on it. For install, login and host selection, use the `forgejo-cli` skill if installed.

## Resolve the PR

- A number from the arguments is the PR on the remote you picked.
- A URL ending `/pulls/<n>` gives the host and the number. `fj pr view` and `fj pr review` take `-H <host>` but no `-r`, so run them from a checkout whose remote is on that host. If no checkout matches, ask the user.
- No argument: find the open PR for the current branch (`git branch --show-current`) with `fj pr search`, or the forgejo-mcp tool `list_repo_pull_requests` (`mcp__plugin_forgejo-mcp_forgejo__list_repo_pull_requests`). Ask the user if more than one matches.

With several remotes, pass `-R <remote>` after `pr` (`fj pr -R <remote> view 5 comments`) and never assume `origin`. fj rejects a top-level `fj -R`.

## Fetch

Use the forgejo-mcp review tools first when present (`mcp__plugin_forgejo-mcp_forgejo__<tool>`): `list_pull_reviews`, `list_pull_review_comments`, and `list_issue_comments` for the general conversation. Check each tool's schema, since names may change between versions.

Otherwise use fj:

```bash
fj pr -R <remote> view <n> body          # title and description
fj pr -R <remote> view <n> comments      # conversation comments
fj pr -R <remote> review <n> list --comments --all   # reviews with inline comments, including stale and dismissed
```

If neither is available, ask the user to paste the review text from the web UI.

fj has no JSON output, so read the text as printed and page through long output. Keep bodies short in your own working notes and cut long ones at `…`. If a cut hides something the triage needs, mark that row `clarify`.

## State and IDs

- **Resolved and outdated state is unknown.** It is not verified that the API or fj exposes whether an inline thread is resolved or outdated. Show all comments, label every row's state as "resolved/outdated unknown" unless the tool output says otherwise, and say so at the top so the user can discard stale rows. `--all` pulls in stale and dismissed reviews only so nothing is hidden; flag them as such when the output marks them.
- Skip bot chatter with no request (CI and dependency bots).
- IDs: `T<n>` for inline comments, `R<n>` for review summaries and general conversation comments.

## Checking out the head branch

The head branch is shown by `fj pr -R <remote> view <n> body` or the web UI. For a fork or AGit PR, `fj pr checkout <n>` makes a local branch, but it changes the working tree, so ask the user to run it or approve it.

## Gotchas

- Never print or read fj's `keys.json` or any token.
- Codeberg's terms also restrict LLM-generated content, so the user decides what goes up. Replies stay drafts.
