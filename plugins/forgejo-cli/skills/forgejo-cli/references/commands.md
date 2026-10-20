# fj command map

Verified against `fj --help` output of fj v0.7.0. fj is 0.x, so confirm flags with `fj <cmd> --help`. Global options: `-H/--host`, `-C/--cwd`, `--style fancy|minimal`. The remote flags are not global and sit in different places per noun: see the placement table in the forgejo-cli SKILL.md (section 3). In short, `fj <noun> -R <remote> <sub>` (never `fj -R`), and for `fj pr` only at the noun, `fj pr -R <remote> <sub>`.

## Install

Release binaries (Linux x86_64 and aarch64, Windows), `cargo install --locked forgejo-cli`, cargo-binstall, apt (Debian unstable, Ubuntu 25.10), Fedora COPR, Guix, Homebrew, nixpkgs, or the OCI image `codeberg.org/forgejo-contrib/forgejo-cli:latest`. Ask before installing anything. Check with `fj version` and `fj version --check`.

## Top level

`repo`, `issue`, `pr`, `milestone`, `wiki`, `actions`, `whoami`, `auth`, `release`, `tag`, `user`, `org`, `version`, `completion`.

## Issues (`fj issue`)

`create <TITLE>` (`--body`, `--body-file`, `--template`, `--no-template`, `--milestone`, `--web`), `edit <N> title|body|comment|labels|milestone`, `comment <N> [BODY] [--body-file]`, `assign`/`unassign`, `close <N> [-w [MSG]]`, `search [QUERY]`, `view <N> [body|comment|comments|assignees]`, `templates`, `browse`, `depend add|remove|list`, `block add|remove|list`. There is no `reopen`. Details in the `forgejo-issues` skill.

## Pull requests (`fj pr`)

`search`, `create [TITLE]` (`--base`, `--head`, `--body`, `--body-file`, `-A/--autofill`, `--agit`, `--milestone`, `--web`), `view <N> [body|comment|comments|labels|assignees|diff|files|commits]`, `status [N] [--wait]`, `checkout`, `comment`, `assign`/`unassign`, `depend`, `block`, `edit`, `close`, `merge [N] [-M method] [-d] [-t title] [-m msg]`, `browse`, `review [list|request]`.

`create` has no `--draft` (use a "WIP: " title prefix) and does not push. `merge` methods: merge, rebase, rebase-merge, squash, manual, fast-forward-only.

## Releases and tags

`fj release create|edit|delete|list|view|browse|asset`; `fj tag create|delete|list|view`. See the `forgejo-release` skill.

## Repos, milestones, orgs, users

- `fj repo`: create, fork, migrate, view, readme, clone, star/unstar, watch/unwatch, delete, browse, `labels view|create|delete|edit`, edit, units. `repo view` does not show the default branch or merge settings.
- `fj milestone`: search, create (`--state` required), view, edit, delete.
- `fj org`, `fj user`: list, view, members, teams, follow, keys.
- `fj wiki`: contents, view, clone, browse.

## Actions (`fj actions`)

`tasks`, `dispatch <workflow> <ref> [-I key=value]`, `variables` and `secrets` (list, create, delete). No run logs. Secret writes need explicit approval.

## What fj cannot do

JSON output, raw API calls, issue reopen, run logs, a draft PR flag, a label flag on issue create, branch protection, repo merge settings. Use forgejo-mcp tools (`mcp__plugin_forgejo-mcp_forgejo__*`) if present, else the web UI (`fj <cmd> browse`), else ask the user to paste.
