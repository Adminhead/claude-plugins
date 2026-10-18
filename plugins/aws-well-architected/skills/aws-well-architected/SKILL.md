---
name: aws-well-architected
description: Reviews an AWS workload against the six Well-Architected pillars and finds cost savings, from its IaC (Terraform, CloudFormation, SAM, CDK) and read-only CLI calls on the live account. Rates findings High, Medium or Low. Use when asked for a Well-Architected review, an AWS architecture or cost audit, or right-sizing candidates.
---

# AWS Well-Architected review

Assess a workload's design against the Well-Architected Framework (operational excellence, security, reliability, performance efficiency, cost optimization, sustainability) and find where it spends more than it needs to. The review is a conversation about trade-offs, not a compliance audit, so report evidence and cost of each finding and let the owner decide.

Not for general release readiness (`production-readiness`, if installed), listing resources (`aws-resource-query`, if installed), or incident investigation (`aws-cloudwatch`, if installed). Profile, IAM and sign-in questions go to `aws`.

Adapted from awesome-copilot `aws-well-architected-review` and `aws-cost-optimize` (MIT, Copyright GitHub, Inc.). See `LICENSE` in the plugin root.

This skill reads and reports. It changes infrastructure only when the user asks for the change: state the account, region and resources, show the exact command and wait for approval, use `--dry-run` where supported, confirm destructive or IAM or public-exposure steps explicitly, and verify with a read afterwards. It never creates issues unless the user asks.

## Procedure

1. **Set the scope.** Get the workload name, the repo path for its IaC, the accounts and regions, and the profile. Ask which sources to use if unclear.
   - **IaC only** when the user has no access to the account.
   - **Live only** when the repo has no IaC, or the user wants the deployed state. Say so in the report instead of stopping.
   - **Both** by default when both exist. IaC shows intent and live state shows reality, and the difference is itself a finding (manual changes, drift).

2. **Read the IaC.** Look for `**/*.tf`, CloudFormation and SAM templates (YAML or JSON with `AWSTemplateFormatVersion` or `Transform: AWS::Serverless`), and `cdk.json` with its stack sources. Read CDK sources and an existing `cdk.out` directory. Do not run `cdk synth`, `terraform plan`, or `sam build`, because they can execute project code and call AWS. Treat IaC as the source of truth for design, and read application code only to settle what a resource is for.

3. **Inspect the live account** when it is in scope. Follow the `aws-resource-query` rules if that skill is installed; in any case: `--profile` and `--region` on every command, `sts get-caller-identity` first, read-only verbs only, and no commands that read secret values or data (`secretsmanager get-secret-value`, `ssm get-parameter*`, `kms decrypt`, `logs get-log-events`, `s3api get-object`, `dynamodb scan`, and any `--with-decryption` flag). An unlisted `describe-*` or `list-*` call needs a `--query` naming the fields to print, since many return secrets in full output (Lambda environment variables, ECS task definitions, launch template user data, CloudFormation parameters). Narrow the review to the workload with its tags (`aws resourcegroupstaggingapi get-resources --tag-filters Key=<key>,Values=<value>`) or the stack's resources (`aws cloudformation list-stack-resources --stack-name <name>`). A whole-account sweep needs the user's agreement.

4. **Walk the pillars.** Read `references/pillars.md` and check each item against the IaC and, where in scope, the live resource. Record only items that apply to the workload's services. An item with no evidence either way is "not verified", not a pass.

5. **Find cost candidates.** Read `references/cost.md` for the evidence each candidate needs: utilization from CloudWatch, spend from Cost Explorer, and a saving you can defend.

6. **Rate each finding.**

   | Risk | Meaning |
   | --- | --- |
   | High | A security exposure, a single point of failure, or no backup or recovery path for data that matters |
   | Medium | Weak reliability or performance headroom, or clear waste |
   | Low | Deviation from best practice with little current impact, or a minor optimization |

   Give each finding its pillar, evidence (file and line, resource ARN, or the command and its result), risk, effort (Low, Medium, High), and the fix. Prefer an IaC change as the fix, because a console or CLI change is overwritten by the next deploy. For Terraform changes, the `terraform` skill (if installed) covers writing them.

7. **Report.** Open with the scope and sources, the counts by pillar and risk, and the top High findings. Then list findings by risk, a cost table, and what was not verified and why. Add an architecture sketch (a short Mermaid diagram or list of services and data flows) when it helps the reader see the findings. Keep the report in the conversation unless the user asks for a file.

## Optional issue creation

Create GitHub issues only when the user asks. Use `gh issue create` from the repo. Draft the titles and bodies first and show them. Create one issue per High finding or one checklist issue for the rest, whichever the user picks. Do not create labels or an epic unless the user asks, and check which labels exist with `gh label list` before using any.

## Checking against current AWS guidance

The pillar items and the cost patterns are stable. When a finding depends on a recent service feature, price, or limit, confirm it in current AWS documentation through the `aws-mcp` docs search if installed, or Context7 or Exa if available, and otherwise label it unconfirmed. The framework itself is at docs.aws.amazon.com/wellarchitected/latest/framework/.

## References

- `references/pillars.md`: read in step 4 for the checklist per pillar, with what to check in IaC and live.
- `references/cost.md`: read in step 5 for utilization and Cost Explorer commands and the candidate patterns.
