# Secrets in a GitOps repo

Git history is permanent and widely copied. A plaintext credential committed to the repo is compromised, even after a history rewrite, so rotate it. Pick one pattern below and keep plaintext Secrets out of the repo.

| Pattern | What lives in Git | Where the value lives | Fits |
| --- | --- | --- | --- |
| External Secrets Operator | An `ExternalSecret` naming a remote key | A secret manager (cloud KMS-backed store, Vault, and similar) | Teams already running a secret manager. Supports rotation through `refreshInterval`. |
| Sealed Secrets | An encrypted `SealedSecret` | The cluster controller's private key | Small clusters with no external manager. Encrypt with `kubeseal` against the cluster's public certificate. |
| SOPS | Encrypted YAML or dotenv files | An age, PGP, or KMS key | Flux users (native decryption). Encrypts values and leaves keys readable. |

## External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: <name>
  namespace: <ns>
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: SecretStore
    name: <store>
  target:
    name: <name>
  data:
    - secretKey: <key>
      remoteRef:
        key: <remote-path>
```

- `external-secrets.io/v1` is the current API. `v1beta1` is the older version, so migrate manifests that still use it.
- The `SecretStore` credentials are themselves a bootstrap secret. Create them out of band or use workload identity where the provider supports it.
- `refreshPolicy` can be `Periodic` (default), `OnChange`, or `CreatedOnce`. `CreatedOnce` needs an immutable target to avoid overwrites on recreation.

## Sealed Secrets

```sh
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
```

- Create `secret.yaml` locally, never commit it, and delete it after sealing. Seal against the target cluster's certificate.
- A sealed secret decrypts only in the cluster (and namespace and name, by default) it was sealed for. Back up the controller's key, since losing it makes every sealed secret unrecoverable.

## SOPS with Flux

Set `spec.decryption` on the Kustomization with `provider: sops` and a Secret holding the age or PGP key (or use a KMS). Encrypt files with `sops` locally before committing, and add a `.sops.yaml` that limits encryption rules by path. Back up the private key out of band.

## Both tools

- Never commit a `Secret` manifest with `data` or `stringData` values.
- Secrets decrypted into the cluster are ordinary Kubernetes Secrets. Enable encryption at rest, and restrict who can `get` them (`infra:kubernetes` references/rbac.md).
- Check for leaks before committing: scan for private keys, tokens, and base64 `data:` blocks in diffs.
