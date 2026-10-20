# fj authentication

Checked against fj v0.7.0 (`fj auth --help`). Re-check with `fj auth <cmd> --help`.

## Commands

| Command | Does |
| --- | --- |
| `fj auth list` | Lists the instances you are logged into |
| `fj -H <host> auth login` | OAuth: opens a browser auth page |
| `fj -H <host> auth add-token [TOKEN]` | Stores an application token. With no argument it reads the token from stdin |
| `fj auth logout <host>` | Deletes the stored login for that host |
| `fj -H <host> auth use-ssh [true\|false]` | Chooses SSH instead of HTTPS by default for that host |

Some fj docs mention `add-key`. In v0.7.0 `fj auth --help` lists only `add-token`, so use that and check `fj auth --help` on newer versions.

## OAuth or token

`fj auth login` works only where fj knows an OAuth client ID for the host. IDs come from `~/.config/forgejo-cli/client_ids` and `/etc/fj/client_ids` (plus any built in). A self-hosted instance not covered cannot use `login`. Use an application token:

1. In the Forgejo web UI: Settings, Applications, generate a token with the least scope the task needs (repository read/write, plus issue or organization scopes as needed). Exact scope names vary by version, so read them off the page.
2. The user runs `fj -H git.example.org auth add-token` and pastes the token on stdin. Do not take the token into the conversation or onto a command line.
3. Verify with `fj -H git.example.org whoami`.

An OAuth login is refreshed and rewritten by fj itself.

## Where logins live

Logins are stored per host in `~/.local/share/forgejo-cli/keys.json` (mode 0600). Never read, print, copy or `cat` it. There is no command to print a token and no token environment variable, so do not look for one. To change a login, use `logout` then `login` or `add-token`.

## Not logged in

Without a login for the host, fj makes anonymous calls. Symptoms are "not logged in" messages, empty results for private repos, and 401 or 404 on writes. Steps:

1. `fj auth list`. Is the exact host there, spelled as in the remote URL?
2. If not, log in for that host as above. A host given by `-H` or `-r host/...` must match the stored name.
3. If it is listed, run `fj -H <host> whoami`. A failure means an expired or revoked token: `logout`, then add a fresh one.
4. If the wrong instance answers, check host resolution in the skill body. Pass `-R <remote>` or `-r host/owner/name`.

## Several hosts

One login per host, so Codeberg and a self-hosted instance coexist. fj picks the host from the repo it resolves. `FJ_FALLBACK_HOST` is the last-resort host when nothing else resolves one. A host inside `-r host/owner/name` wins over everything else.
