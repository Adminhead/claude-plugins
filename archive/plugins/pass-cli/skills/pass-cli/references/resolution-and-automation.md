# Resolution and automation

Read before resolving a secret into a process, file, or terminal.

## Run a non-interactive program

Put bare references in the environment or a dotenv file, then run the child after `--`:

```bash
DB_PASSWORD="pass://$SHARE_ID/$ITEM_ID/password" pass-cli run -- ./my-app
pass-cli run --env-file .env.secrets -- ./my-app
```

- `run` resolves values for the child only and masks them in stdout and stderr. Never add `--no-masking` while output reaches the transcript.
- Later `--env-file` files override earlier ones.
- A dotenv file of references holds no values, but keep it out of version control if its IDs or names are sensitive.
- `run` suits scripts, not full TTY apps. A TTY app needs the user to run it themselves.

## Render a file

`inject` resolves double-braced references:

```text
password: {{ pass://<share-id>/<item-id>/password }}
```

```bash
pass-cli inject -i config.yaml.template -o config.yaml
```

- Always pass `-o`. Without it the rendered secrets go to stdout.
- Output defaults to mode `0600`. Don't relax `--file-mode` or use `-f`/`--force` to overwrite without approval.
- Make sure the output path is gitignored before writing.

## Raw retrieval

`pass-cli item view "pass://$SHARE_ID/$ITEM_ID/password"` prints the value. Use it only when the user explicitly asks, and send the output to a safe sink rather than the transcript:

```bash
umask 077; pass-cli item view "$REF" > "$SECRET_FILE"
```

## Sources

- [`item view`](https://protonpass.github.io/pass-cli/commands/item/#view)
- [`run`](https://protonpass.github.io/pass-cli/commands/contents/run/)
- [`inject`](https://protonpass.github.io/pass-cli/commands/contents/inject/)
