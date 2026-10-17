# State and backends

Read when choosing or migrating a backend, setting up locking, or touching state directly.

## Backend choice

| Situation | Choice |
| --- | --- |
| Solo, throwaway | Local state, kept out of git (`*.tfstate*` in `.gitignore`) |
| Team on AWS | S3 backend with `use_lockfile = true`, `encrypt = true`, bucket versioning on |
| Team on another cloud | That cloud's object-store backend (GCS, azurerm) with its native locking and encryption |
| Managed runs and policy | HCP Terraform, or another remote-run service |

S3 specifics, from the S3 backend docs:

```hcl
terraform {
  backend "s3" {
    bucket       = "<state-bucket>"
    key          = "<env>/<component>/terraform.tfstate"
    region       = "<region>"
    use_lockfile = true
    encrypt      = true
  }
}
```

- `use_lockfile` stores the lock in S3. DynamoDB locking (`dynamodb_table`) is deprecated and will be removed in a future minor version. Use it only while migrating.
- Turn on bucket versioning so an accidental overwrite or delete is recoverable. The docs call this highly recommended.
- With `kms_key_id`, the identity running Terraform needs `kms:Encrypt`, `kms:Decrypt`, and `kms:GenerateDataKey`.
- Bucket and lock-table creation is a bootstrap problem. Create the bucket once by hand or in a separate tiny root module with local state, and never manage it from the state it stores.

## Credentials and partial configuration

Leave bucket credentials out of the file. Supply them through the provider's environment variables or credential files. Environment-specific, non-secret values can go in a partial configuration: `terraform init -backend-config=env/prod.backend.hcl`. A secret passed with `-backend-config` ends up in `.terraform/` and in plan files.

Terraform's `backend` block accepts no variables or locals. OpenTofu does (see `opentofu.md`).

## Changing backends

`terraform init -migrate-state` copies state to the new backend after prompting. Back up first (`terraform state pull > backup.tfstate`, stored securely and deleted afterwards), run it with no other runs in flight, and confirm with a clean `plan` that shows no changes.

## Workspaces

CLI workspaces share one backend configuration and one config, with separate state per workspace. They suit short-lived copies of the same stack (feature environments). For long-lived prod and staging, use separate root modules and backends, so access control, provider versions, and blast radius differ per environment.

## Locking

- Never bypass locks with `-lock=false` in CI or routine work.
- A stuck lock after a crashed run: confirm no run is active, then `terraform force-unlock <LOCK_ID>`. Ask the user first, since unlocking during a live apply corrupts state.

## State surgery

Prefer config blocks (`moved`, `import`, `removed`). When the CLI is unavoidable:

- `terraform state list` is read-only and prints addresses only. Treat `terraform state show <addr>` as a secret-reading command, since it has no field filter and prints every attribute, including secrets. Prefer `terraform show -json | jq` on named, non-sensitive paths.
- `state mv`, `state rm`, and `state push` write state. Ask first, take a `state pull` backup, and run `plan` afterwards to confirm the result.
- `plan -refresh-only` previews drift and changes nothing. `apply -refresh-only` updates state to match reality without touching infrastructure, and needs approval because it writes state.
