# OpenTofu differences

Read when the repo uses `tofu`, is considering migrating, or needs a feature only one tool has. Checked against OpenTofu 1.13 docs.

## Compatibility

OpenTofu aims to run existing Terraform configurations unchanged. The migration guide's steps are: back up state and code, install OpenTofu, `tofu init` and verify, then test with a small change and a `tofu plan` that shows no unexpected diff. Take the version-specific path from opentofu.org/docs/intro/migration for the Terraform release you are leaving. Configurations that read each other through `terraform_remote_state` need extra care and have their own guide.

Both tools read `.tf` files. OpenTofu also reads `.tofu` files, and when `foo.tf` and `foo.tofu` both exist OpenTofu loads only `foo.tofu`. Put OpenTofu-only syntax in a `.tofu` file with a `.tf` twin, so Terraform still loads the portable version.

## Features OpenTofu has

| Feature | Notes |
| --- | --- |
| Client-side state and plan encryption | `terraform { encryption { ... } }` block, introduced in OpenTofu 1.7. Key providers: PBKDF2, AWS KMS, GCP KMS, Azure Key Vault, OpenBao, external. Method: AES-GCM. |
| Variables and locals in backend config | Allowed as long as they resolve at `tofu init`, with no references to state or provider functions. Terraform does not allow this. |
| `lifecycle { enabled = <bool> }` | OpenTofu 1.11. Replaces `count = var.x ? 1 : 0` and returns `null` when disabled. Cannot be combined with `count` or `for_each`. Existing `count` conditionals migrate without `moved` blocks. |
| Registry | Providers and modules resolve through the OpenTofu registry by default. The registry supplies `zh:` and `h1:` checksums for lock files. |

Terraform has features OpenTofu may lack or implement differently (HCP Terraform integration, some newer language features). Check the OpenTofu docs for the specific feature before assuming parity.

## State encryption

```hcl
terraform {
  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}
```

- Supply the passphrase through `TF_VAR_state_passphrase` or a KMS key provider. A passphrase written in the config defeats the encryption.
- `enforced = true` refuses to read unencrypted state, which blocks tampering with a plaintext replacement.
- To roll keys or methods, add a `fallback` block with the old method, apply, then remove the fallback. To enable encryption on existing state, use the `unencrypted` method as a fallback during migration only.
- Lose the key and you lose the state. Store key material separately from the backend.
- Encrypted state files cannot be read by Terraform. Moving back means decrypting first.

## Commands

The CLI mirrors Terraform with `tofu` in place of `terraform`: `tofu init`, `plan`, `apply`, `test`, `providers lock`. Lock files stay at `.terraform.lock.hcl`. Commit it, and use `tofu providers lock` with multiple `-platform` flags when using mirrors, since mirrors may carry fewer checksums.
