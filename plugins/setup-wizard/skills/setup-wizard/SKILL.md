---
name: setup-wizard
description: Generates an interactive bash wizard that walks a human through setup steps only they can do, such as creating API keys in a dashboard, entering secrets with hidden input, writing a gitignored .env and setting GitHub secrets. Manual command.
argument-hint: "[what to set up, e.g. Stripe and Sentry keys for local dev and CI]"
disable-model-invocation: true
---

# Setup wizard

A wizard is a bash script that walks a human, stage by stage, through a manual procedure that's tedious to do by hand and tedious to re-explain to an AI each time: configuring third-party services, collecting credentials, a one-off migration or cutover. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, GitHub secrets), confirms before irreversible steps, and shows how many stages are left.

Use it only for steps the agent can't do itself. Request: $ARGUMENTS

Adapted from mattpocock/skills `engineering/wizard` (MIT, Copyright (c) 2026 Matt Pocock; see `LICENSE`). The template was audited and hardened; see "What the library guarantees".

[template.sh](template.sh) already solves the UX and the secret handling. Your job is to scope the procedure and author its stages. The library above the `STAGES` marker is the same in every wizard; never hand-edit it.

A wizard is ephemeral by default: built for one run, saved to the scratchpad or `scripts/`, deleted when done. Commit it only when the user wants a repeatable setup path in the repo.

## 1. Scope the procedure

Read the repo before asking:

- Setup: `.env`, `.env.example`, `.env.*`, README, `docker-compose*`, framework config, and `.github/workflows/*` (every `secrets.*` or `vars.*` reference is a value the wizard must produce).
- Migration or cutover: the current state, the target state, and the irreversible actions between them.

Show the user the ordered stages and the values each produces, and let them add, drop or reorder.

**Done when** every stage is named in order and, for each captured value, you know (a) where the human gets it, (b) where it's written (`.env`, a GitHub secret, both, or nowhere), and (c) whether it's secret (hidden entry) or public.

## 2. Map each stage's journey

Write the precise path a human follows: the URL, what to do there, where the value appears, which variable it fills ("Dashboard → Developers → API keys → Reveal test key → copy"). Where you don't know the current UI or command, say so and check the vendor docs or ask. Never invent steps.

**Done when** every stage traces to instructions a stranger could follow.

## 3. Author the wizard

Copy `template.sh` to the target path. Replace the example stage with one `stage` per step, in dependency order, and set `TOTAL_STAGES` to match. Helpers: `stage`, `say`/`step`/`note`/`warn`, `open_url`, `ask`/`ask_secret`, `write_env`, `set_secret`/`set_var`, `pause`/`confirm`.

- Open the URL before asking for its value.
- `ask_secret` for anything secret; `ask` only for public values (input is visible).
- `write_env` every persisted value; `set_secret` only the values CI needs, with names that exactly match the workflow's `secrets.*` references.
- `set_var` only for public values: it passes the value on the command line.
- `confirm` before any irreversible action.
- Keep each stage to one focused task, since `stage` clears the screen.
- Variable names are plain identifiers (`STRIPE_SECRET_KEY`); the library refuses others and reserved names like `PATH`.

Never put a secret in the script, a command-line argument, an `echo`, a log line, or a `set -x` trace. Never read a secret with plain `read` or pass one to a command as an argument.

## 4. Verify and hand off

- `bash -n <script>`, then `shellcheck <script>` if available.
- `chmod +x <script>`.
- Don't run it yourself: it opens browsers and blocks on human input. Trace it statically: every value from step 1 is captured and lands where step 1 said, and every `set_secret` name matches CI.
- Tell the user how to run it (`./scripts/setup.sh`, or `ENV_FILE=.env.local ./scripts/setup.sh`). If it's a repeatable setup path, link it from the README.

## What the library guarantees

Checked line by line against the upstream template:

- **Hidden entry.** `ask_secret` uses `read -rs` and never prints the value or the existing one. An EXIT trap restores terminal echo if the user hits Ctrl-C mid-entry.
- **No echo or history leaks.** Values are read from the terminal, never taken from argv. `set +x` at the top disables xtrace even under `bash -x`. `finish` names keys, never values. `set_secret` pipes the value to `gh secret set` on stdin.
- **`.env` stays out of git.** Before the first write, a tracked `ENV_FILE` needs an explicit yes, and an unignored one is added to the `.gitignore` beside it (or the wizard stops). A new `.env` is created at mode 0600; an existing one keeps its mode, with a warning if others can read it.
- **Safe quoting.** Values are written single-quoted with `'` escaped, and multi-line values are refused. Names are validated before `printf -v` or `grep -E` see them; upstream let a name like `x[$(cmd)]` run a command through `printf -v`.
- **No stray copies.** The temp file for the upsert is created 0600 next to `ENV_FILE` (not in shared `/tmp`) and removed on exit, including on Ctrl-C.

`tests/template.spec.sh` exercises these without a terminal (`bash tests/template.spec.sh`). Run it after any change to the library.
