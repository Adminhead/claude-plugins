# Secrets and encryption

Official documentation reviewed: [encryption overview](https://www.chezmoi.io/user-guide/encryption/), [age](https://www.chezmoi.io/user-guide/encryption/age/), [GPG](https://www.chezmoi.io/user-guide/encryption/gpg/), [password managers](https://www.chezmoi.io/user-guide/password-managers/), and the [encryption FAQ](https://www.chezmoi.io/user-guide/frequently-asked-questions/encryption/).

## Choose the right mechanism

- **Password-manager template functions:** Use when the target needs a secret but the source repository must not contain it. The relevant provider CLI must be installed and authenticated on every target machine.
- **Encrypted source files:** Use when a file itself must be versioned in source state. Configure and verify the encryption mechanism before adding a file with `--encrypt`.

Never place plaintext secret values in `.chezmoidata.*`, the config file, shell history, or test fixtures.

## Encrypted files

```sh
chezmoi add --encrypt ~/.ssh/id_rsa
chezmoi edit-encrypted ~/.ssh/id_rsa
```

Supported mechanisms include age, GPG, git-crypt, and transcrypt. For age keys, use `chezmoi age-keygen --output="$HOME/key.txt"` only with an appropriate protected key location and user approval. Built-in age does not support passphrases, symmetric encryption, or SSH keys; use the documented external-age approach if one of those is required.

Test normal rendered target output with `chezmoi diff` and a dry-run apply. Be aware that external age passphrase mode can prompt on `add`, `apply`, `diff`, and `status`.

## Password-manager templates

Provider-specific functions include Proton Pass, 1Password, Bitwarden, AWS Secrets Manager, Azure Key Vault, pass, gopass, KeePassXC, Vault, and others. Use only the provider the user already selected or has installed. For Proton Pass, chezmoi v2.73 defines `protonPass` and `protonPassJSON` (they call `pass-cli`); see the `pass-cli` skill, if installed, for building `pass://` references.

```gotemplate
{{ protonPass "pass://<share-id>/<item-id>/password" }}
```

Expressions are not portable across providers. Consult the provider-specific official page before writing it. Rendered output may contain a secret, so use safe redirection/inspection practices and do not include it in reports.
