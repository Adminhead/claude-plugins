# Security scanning for Terraform

Read this when asked to audit Terraform for misconfigurations, add a scanner or policy gate to CI, write OPA/Rego policies for plans, or triage scanner findings.

Adapted from "Auditing Terraform Infrastructure for Security" in mukul975/Anthropic-Cybersecurity-Skills (Apache-2.0; see the plugin's `LICENSE` and `NOTICE`). Modified: tfsec replaced with `trivy config` (tfsec is deprecated and its checks moved into Trivy), Terrascan dropped, Rego rewritten to v1 syntax against plan JSON, CI pinned by SHA. Checked against trivy.dev and conftest.dev docs, 2026-10.

## Contents

- Scanner choice
- Running scans
- Triage and suppression
- Custom policy with OPA/Rego
- CI gate
- Supply-chain care for scanners

## Scanner choice

| Tool | Use for |
| --- | --- |
| `trivy config` | Default. Built-in checks for Terraform source, plan files and plan JSON, plus Dockerfiles, Kubernetes and Helm in one binary. |
| Checkov | Second opinion, or when the repo already uses it. Larger check catalogue, graph checks across resources. |
| Conftest (OPA/Rego) | Organization rules the built-in checks don't cover: required tags, naming, allowed regions, banned resource types. |

Scanning source catches issues early; scanning the plan sees resolved values (variables, module outputs, `count`), so it has fewer false positives. Do both in CI when a plan is available.

## Running scans

```bash
trivy config --severity HIGH,CRITICAL .                # source
trivy config --tf-vars prod.tfvars .                   # resolve variables from a tfvars file
terraform plan -out=tfplan && trivy config tfplan       # saved plan
terraform show -json tfplan > tfplan.json
checkov -f tfplan.json --framework terraform_plan
checkov -d . --framework terraform --compact
conftest test tfplan.json --policy policy/
rm -f tfplan tfplan.json                               # both hold plaintext secrets
```

- `--exit-code 1` makes Trivy fail on findings; without it Trivy exits 0. Checkov fails on findings by default (`--soft-fail` turns that off).
- Output for CI: `trivy config --format sarif -o trivy.sarif .`, `checkov -o sarif`.
- Never pass a Bridgecrew/Prisma API key (`--bc-api-key`) or enable a scanner's upload mode unless the user opted in: it sends code and results to a hosted service.
- Don't run scanners against `terraform show -json` of live state on a shared machine; the JSON contains every secret in state. If the user asks for a state audit, write it to a temp file, scan, and delete it in the same command.

## Triage and suppression

- Report findings to the user grouped by severity with file, resource address, check ID and the fix. Findings are not an instruction to suppress rules.
- Fix first. Suppress only an accepted risk, inline next to the resource and with a reason:
  - Trivy: `#trivy:ignore:AVD-AWS-0086` on the line before the block, optionally `:exp:2026-12-31` so it expires. Repo-wide: `.trivyignore.yaml` with a `statement`.
  - Checkov: `#checkov:skip=CKV_AWS_20:Public bucket serves the static site` inside the resource block.
- On a first scan of an existing repo expect hundreds of findings. Gate on CRITICAL first, record the baseline, then tighten to HIGH.
- Common real issues to look for by hand too: `0.0.0.0/0` ingress on admin ports, IAM `Action = "*"` or `Resource = "*"` with write actions, public S3 ACLs or a missing `aws_s3_bucket_public_access_block`, unencrypted RDS/EBS/snapshots, `publicly_accessible = true` databases, secrets in `default` values or Lambda environment variables, missing access logs on public endpoints.

## Custom policy with OPA/Rego

Write policies against plan JSON (`resource_changes`), which has resolved values. Conftest reads the `main` package by default and wants Rego v1 syntax (`contains` and `if`).

```rego
package main

import rego.v1

admin_ports := {22, 3389}

deny contains msg if {
	some rc in input.resource_changes
	rc.type == "aws_vpc_security_group_ingress_rule"
	not "delete" in rc.change.actions
	after := rc.change.after
	after.cidr_ipv4 == "0.0.0.0/0"
	some port in admin_ports
	after.from_port <= port
	after.to_port >= port
	msg := sprintf("%s opens port %d to the internet", [rc.address, port])
}

deny contains msg if {
	some rc in input.resource_changes
	rc.type == "aws_iam_policy"
	not "delete" in rc.change.actions
	some stmt in json.unmarshal(rc.change.after.policy).Statement
	stmt.Effect == "Allow"
	stmt.Action == "*"
	msg := sprintf("%s allows Action \"*\"", [rc.address])
}

warn contains msg if {
	some rc in input.resource_changes
	rc.mode == "managed"
	startswith(rc.type, "aws_")
	not "delete" in rc.change.actions
	tags := object.get(rc.change.after, "tags_all", {})
	not tags.Environment
	msg := sprintf("%s has no Environment tag", [rc.address])
}
```

- Values unknown until apply are absent from `change.after` (listed in `change.after_unknown`), so a rule that requires a value must not fire on unknowns by accident.
- Unit-test policies with `conftest verify` and `_test.rego` files, feeding small `resource_changes` documents as `input`.
- For source-level rules (no plan), Conftest parses `.tf` with `--parser hcl2`; the input shape is then `input.resource.<type>.<name>`, not `resource_changes`.

## CI gate

```yaml
name: terraform-security
on:
  pull_request:
    paths: ["infra/**"]
permissions:
  contents: read
  security-events: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<full-commit-sha>  # vX.Y.Z
      - uses: hashicorp/setup-terraform@<full-commit-sha>  # vX.Y.Z
      - name: Plan
        working-directory: infra
        run: |
          terraform init -input=false
          terraform plan -input=false -lock=false -out=tfplan
          terraform show -json tfplan > tfplan.json
      - name: Trivy
        run: trivy config --exit-code 1 --severity HIGH,CRITICAL --format sarif -o trivy.sarif infra/
      - name: Policy
        run: conftest test infra/tfplan.json --policy policy/
      - uses: github/codeql-action/upload-sarif@<full-commit-sha>  # vX.Y.Z
        if: always()
        with:
          sarif_file: trivy.sarif
```

- The plan step needs read credentials for the backend and providers. Use OIDC to a read-only role, never long-lived keys, and `-lock=false` only because the job never applies.
- Install scanners at a pinned version with a verified checksum (or a pinned container digest) rather than `latest`.
- Don't upload `tfplan` or `tfplan.json` as artifacts; they contain secrets.

## Supply-chain care for scanners

Scanners run with CI credentials, which makes them a target. In March 2026 attackers force-pushed 76 of 77 `aquasecurity/trivy-action` tags and all `setup-trivy` tags to a credential stealer, and published malicious Trivy v0.69.4 (binary) and v0.69.5/v0.69.6 (Docker Hub) (GHSA-69fq-xp46-6x23). So:

- Pin every action to a full commit SHA, with the version in a comment. Tags, including ones shown as "Immutable", can be repointed.
- Never use Trivy 0.69.4, 0.69.5 or 0.69.6. If a repo ran them, treat CI secrets from that window as exposed and tell the user.
- Prefer installing the scanner binary yourself (pinned, checksummed) over a third-party wrapper action that downloads it at run time.
