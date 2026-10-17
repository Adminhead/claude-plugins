# Externals and scripts

Official documentation reviewed: [include files from elsewhere](https://www.chezmoi.io/user-guide/include-files-from-elsewhere/), [`.chezmoiexternal` format](https://www.chezmoi.io/reference/special-files/chezmoiexternal-format/), [script guide](https://www.chezmoi.io/user-guide/use-scripts-to-perform-actions/), [application order](https://www.chezmoi.io/reference/application-order/), and [`.chezmoiscripts`](https://www.chezmoi.io/reference/special-directories/chezmoiscripts/).

## Externals

`.chezmoiexternal.$FORMAT` entries are always templates. Supported external types include `file`, `archive`, `archive-file`, and `git-repo`. Prefer a release URL plus a SHA-256/384/512 checksum or another immutable version. A branch URL without a checksum changes over time; use `refreshPeriod` deliberately.

```toml
[".local/bin/tool"]
type = "file"
url = "https://example.com/releases/tool"
executable = true
# checksum = "sha256:..." # pin when the source provides a checksum
```

```sh
chezmoi apply
chezmoi --refresh-externals apply
```

`refreshPeriod = "0"` prevents re-download except when refresh is forced. `exact = true` on an archive external removes target entries not in the archive, so review carefully. Archive `include` and `exclude` match archive-member paths; `archive-file.path` must match the member name after `stripComponents`.

## Managed scripts

A script must have a shebang or be an executable binary. chezmoi makes its generated temporary file executable. Whitespace-only rendered script templates do not run. Dry runs do **not** execute scripts.

Application order is:

1. source and destination state are read;
2. target state is computed;
3. `run_before_` scripts run alphabetically;
4. entries update alphabetically by stripped target name (directories before contents);
5. `run_after_` scripts run alphabetically.

`run_` runs each apply; `run_once_` runs once per successfully recorded content; `run_onchange_` runs when content changes for its filename. Chezmoi stores once/onchange tracking persistently. Reset `entryState` or `scriptState` only with intentional user approval:

```sh
chezmoi state delete-bucket --bucket=entryState  # run_onchange
chezmoi state delete-bucket --bucket=scriptState # run_once
```

Scripts must not change source or destination state during the same chezmoi execution; behavior is undefined. A `run_after_` script may depend on externals that were applied in the update phase, but `run_before_` cannot.
