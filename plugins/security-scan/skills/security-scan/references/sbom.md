# SBOMs: generate, scan, gate, attest

Read this when the user asks for an SBOM, wants a vulnerability gate in CI, wants to scan a container image rather than the branch, or asks how to sign or verify an SBOM. The step 1 scanner does not produce SBOMs; these commands are separate and run only when the user asks. Use the tools only if they are installed; never install them during an audit.

Adapted from the `generating-and-analyzing-sboms` skill in https://github.com/mukul975/Anthropic-Cybersecurity-Skills (author: mahipal), Apache License 2.0. Modified: condensed, keyless Cosign updated to current behaviour, verification flags added. See the plugin's LICENSE and NOTICE.

Treat an SBOM as sensitive inventory: it lists exactly which vulnerable versions an attacker could target.

## Formats

| | CycloneDX | SPDX |
| --- | --- | --- |
| Steward | OWASP | Linux Foundation, ISO/IEC 5962 |
| Strength | Security use: vulnerabilities, VEX, dependency graph | Licensing and provenance |
| Syft `-o` values | `cyclonedx-json`, `cyclonedx-xml` | `spdx-json`, `spdx` (tag-value) |
| Cosign `--type` | `cyclonedx` | `spdxjson`, `spdx` |

Pick CycloneDX for vulnerability work and SPDX when a customer or regulator asks for it. Syft can write both in one pass.

## Generate with Syft

```sh
syft dir:. -o cyclonedx-json=sbom.cdx.json                    # source checkout
syft registry:ghcr.io/org/app:1.4.2 -o spdx-json=sbom.spdx.json   # image straight from a registry
syft ghcr.io/org/app:1.4.2 -o cyclonedx-json=app.cdx.json -o spdx-json=app.spdx.json -o table
```

Source prefixes: `dir:`, `file:`, `registry:` (no Docker daemon), `docker:`, `oci-archive:`; without a prefix Syft auto-detects (an existing path is read from disk, otherwise the argument is tried as an image, daemons first, then the registry). `--scope all-layers` includes packages deleted in later layers. A source-directory SBOM lists what manifests declare; an image SBOM lists what actually shipped, so prefer the image for release artifacts.

## Scan and gate with Grype

```sh
grype sbom:app.cdx.json -o table
grype sbom:app.cdx.json -o json > app.vulns.json        # for tooling; sarif also works
grype sbom:app.cdx.json --fail-on high                  # exit 2 at or above high
grype sbom:app.cdx.json --only-fixed --fail-on critical  # ignore findings with no fix yet
```

- `--fail-on` sets exit code 2 when any match is at or above the severity (`negligible`, `low`, `medium`, `high`, `critical`). That is the CI gate.
- `--only-fixed` drops vulnerabilities with no released fix, which keeps a gate actionable. Pair it with a scheduled run without the flag so unfixed issues stay visible.
- Scanning a stored SBOM needs no rebuild. Rescan release SBOMs on a schedule so newly published CVEs against shipped artifacts surface.
- A `.grype.yaml` in the repository can set `only-fixed`, `fail-on-severity` and `ignore` entries. Every `ignore` should name the CVE and a reason in a comment; an ignore with no reason is a finding in review.
- `--vex <file>` applies an OpenVEX document so components marked not affected stop failing the gate.
- Prioritize with EPSS and the CISA KEV list over raw severity when the list is long.

## Attest with Cosign

An attestation binds the SBOM to an image digest with a signature, so consumers can check that the SBOM describes the image they pulled.

```sh
# Keyless (Sigstore Fulcio + Rekor), the default when no --key is given. In CI it uses the job's OIDC token.
cosign attest --yes --predicate app.cdx.json --type cyclonedx ghcr.io/org/app@sha256:<digest>

# Key-based
cosign attest --key cosign.key --predicate app.spdx.json --type spdxjson ghcr.io/org/app@sha256:<digest>
```

- Attest by digest, not tag, so the attestation cannot be moved to another image.
- `COSIGN_EXPERIMENTAL=1` is no longer needed for keyless signing; older guides that set it predate Cosign 2.
- Current Cosign stores attestations as Sigstore bundles through the OCI referrers API by default. A registry without referrers support needs the older tag-based format; check `cosign attest --help` for the installed version.
- In GitHub Actions, keyless signing needs `permissions: id-token: write` on that job only.

## Verify

```sh
cosign verify-attestation --type cyclonedx \
  --certificate-identity 'https://github.com/org/app/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/org/app@sha256:<digest>

cosign verify-attestation --type spdxjson --key cosign.pub ghcr.io/org/app@sha256:<digest>
```

Keyless verification requires both an identity and an issuer. A `--certificate-identity-regexp` like `.*` or one matching any workflow in the org accepts signatures from anyone who can run a workflow there; report it like an OIDC `sub` wildcard.

## Review checklist

- SBOM generated from the shipped image for release artifacts, not only from source.
- CI gates on `--fail-on` at an agreed severity, with `--only-fixed` or documented ignores.
- Stored SBOMs are rescanned on a schedule.
- Attestations are made by digest, keyless identities are pinned to a workflow and ref, and consumers verify before deploy (for example an admission policy).
