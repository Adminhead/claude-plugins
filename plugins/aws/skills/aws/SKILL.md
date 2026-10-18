---
name: aws
description: Works out which AWS account, region and identity is in use when that is unknown, unclear or wrong, guides sign-in with SSO or aws login, and covers IAM: AccessDenied debugging, policy and trust-policy writing, STS session limits, and cost-query habits. Use when the user mentions AWS credentials, profile, SSO, expired tokens, an unclear region or account, writing or debugging an IAM policy or role, AccessDenied, or what AWS costs. Not for listing or inspecting resources (aws-resource-query), incidents (aws-cloudwatch), architecture or cost reviews (aws-well-architected), CLI flags and scripting (aws-cli), or infrastructure as code (terraform).
---

# AWS

General AWS habits: know which account and region you are in, get signed in without touching credential files, write IAM that fails closed, and query costs without arithmetic mistakes. Detail that does not fit here is in `references/`.

Adapted from the AWS agent-toolkit skills `aws-iam`, `signing-in-to-aws` and `aws-billing-and-cost-management` and the Hugging Face skill `hf-cloud-aws-context-discovery` (Apache-2.0). See `NOTICE`.

## Context first

When the account, region or identity is unknown, unclear or looks wrong, settle these before acting and keep them for the session. If the user already named them and calls work, skip this.

1. **Profile.** The profile the user names, else `AWS_PROFILE`, else `default`. `aws configure list-profiles` shows what exists.
2. **Region.** Take the first that gives a value: the region the user named, `AWS_REGION`, `AWS_DEFAULT_REGION`, `aws configure get region --profile <profile>`. Then ask. Never fall back to `us-east-1`. IAM, Route 53 and CloudFront are account-wide, so region does not matter for them.
3. **Identity.** Run `aws sts get-caller-identity --profile <profile> --region <region>`. It needs no permission, so it works even when other calls are denied.
4. **Report one line**, for example: `Profile dev, eu-west-1, account 123456789012, assumed-role AWSReservedSSO_PowerUser_...`. Do not ask the user to confirm a region you read from their config.

Read the caller `Arn` for the principal type:

| Arn contains | Meaning |
| --- | --- |
| `:user/` | IAM user. Rights depend on attached policies. |
| `:assumed-role/AWSReservedSSO_<PermissionSet>_.../` | IAM Identity Center (SSO). Rights are the permission set's. `AdministratorAccess` can manage IAM; narrower sets such as `PowerUserAccess` often cannot. |
| `:assumed-role/<role>/<session>` | Assumed role. Rights depend on the role. |

For an SSO principal, say early that creating IAM roles may fail. Look for an existing role before planning to create one, and if none fits, name the missing permission for whoever administers access.

Do not run `aws configure list` (it masks keys to their last four characters but still shows part of them) or `aws configure export-credentials` (it prints them in full). Never read ~/.aws/credentials, ~/.aws/config or the SSO cache. Never print an access key, secret key or session token, in output or in an example.

## Signing in

The user runs every login. A login opens a browser, so tell them the exact command and wait. In Claude Code the user can run it in this session by typing `! aws sso login --profile <profile>`. Afterwards re-run `get-caller-identity`.

| Situation | Command |
| --- | --- |
| Profile uses IAM Identity Center (SSO) | `aws sso login --profile <profile>`. Do not steer an SSO user to `aws login`. |
| No SSO: IAM user, root, or IAM federation | `aws login` (CLI 2.32.0 or later; check `aws --version`). Sessions last up to 12 hours. Add `--profile <name>` to keep an existing default, and `--remote` when no browser is available. |
| Permission error right after `aws login` | The identity needs the `SignInLocalDevelopmentAccess` managed policy. Root does not. |
| CI or automation | OIDC federation or an IAM role, never a person's login or long-lived keys. |

Offer `aws configure` with long-term access keys only if the user declines `aws login` and has no SSO. Say that keys never expire on their own. The user runs `aws configure` themselves; never ask for keys in chat.

An expired or missing session shows as `ExpiredToken`, `Unable to locate credentials` or "token has expired". Ask for a login. Do not switch profiles or roles to work around it.

## IAM habits

Debug AccessDenied from the message first: it names the action and resource. Then check, in order: wrong account or role (`get-caller-identity`), an explicit deny, or an allow missing from the permissions boundary, SCP or session policy, and missing required actions (`dynamodb:BatchExecuteStatement` needs the PartiQL actions). Read-only helpers: `aws iam simulate-principal-policy`, `aws iam get-role`, `aws iam list-attached-role-policies`.

Writing policies:

- Look up IAM action names in the service authorization reference. API operation names and action names differ (`dynamodb:Query`, not `QueryItems`).
- Scope `Resource` to ARNs. Add conditions only for sensitive actions, tag-based access, or org requirements.
- `iam:PassRole` on `*` combined with a create or update on a compute service (EC2 `RunInstances`, Lambda `CreateFunction`, ECS `RegisterTaskDefinition`) lets the caller run code as any passable role. Scope it to role ARNs or a path, and add `iam:PassedToService`.
- `ForAllValues` is true when the key is absent, so in an `Allow` pair it with `"Null": {"<key>": "false"}`. `ForAnyValue` is false when the key is absent, so a `Deny` on it misses requests without the key. Use these only with multivalued keys such as `aws:TagKeys`.
- A trust policy for an AWS service principal carries `aws:SourceAccount` or `aws:SourceArn`. Third parties assuming the role get `sts:ExternalId`.
- A role chain (a role assuming a role) caps the session at one hour, whatever the role's maximum.
- `GetSessionToken` credentials cannot call IAM APIs unless MFA was supplied, and can call only `AssumeRole` and `GetCallerIdentity` among STS operations.
- Assuming a role in an opt-in Region needs that Region enabled in the account that owns the role, not the caller.

Read `references/iam-edge-cases.md` for the same-account resource-policy bypass of boundaries, STS Region details, and what was checked.

## Costs

Cost data is easy to get plausibly wrong. Read `references/cost.md` before the first Cost Explorer, Budgets or Compute Optimizer call. The short form:

1. Get today's date from the shell (`date -u +%F`) before choosing any `--time-period`. Do not assume the year.
2. Do sums, averages and percentages in a script, not in your head.
3. `End` is exclusive: one month is `Start=<first-of-month>,End=<first-of-next-month>`.
4. Filter on `RECORD_TYPE`, not `CHARGE_TYPE`. Pass `--region us-east-1`.
5. `compute-optimizer update-enrollment-status` opts the account in. It is a change, so ask first.

Spend analysis and savings reviews of a whole workload go to `aws-well-architected`.

## Routing

| The user wants | Use |
| --- | --- |
| What exists, how a resource is configured | `aws-resource-query` |
| An alarm fired, errors, latency, what changed | `aws-cloudwatch` |
| A Well-Architected or cost review of a workload | `aws-well-architected` |
| CLI flags, pagination, waiters, scripting, write habits | `aws-cli` |
| Terraform or other IaC | `terraform` |

If a named skill is not installed, say so and carry on with the AWS CLI.
