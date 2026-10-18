# IAM edge cases

Read when writing or reviewing a policy that uses conditions, boundaries or cross-account roles, or when an STS call fails in an unexpected way. Each entry names the AWS doc it was checked against.

## Contents

- Set operators and missing keys
- Resource policies and permissions boundaries
- STS sessions and Regions
- Confused deputy
- PassRole
- Not carried over

## Set operators and missing keys

The two rules are in SKILL.md. Details beyond them:

- For a `Deny` on `ForAnyValue`, add a second `Deny` statement with `"Null": {"<key>": "true"}` to catch requests that lack the key.
- A key is multivalued if the service authorization reference types it `ArrayOf...` (for example `aws:TagKeys`). On a single-valued key a set operator can make a policy too permissive.
- Multivalued keys with a wildcard or variable need `StringLike`.

Source: IAM User Guide, "Single-valued vs. multivalued context keys".

## Resource policies and permissions boundaries

Same account only:

- A resource policy that grants to an IAM **user** ARN is not limited by an implicit deny in that user's identity policy or permissions boundary.
- A resource policy that grants to an IAM **role** ARN is limited by the role's boundary or session policy.
- A resource policy that grants to a role **session** ARN grants to the session directly and is not limited by the identity policy, boundary or session policy.
- A resource policy that grants to a `GetFederationToken` federated-user session ARN (`...:federated-user/<name>`) also grants to the session directly and is not limited. If it grants to the ARN of the IAM user who federated, the session's requests are limited by the boundary or session policy.
- An explicit deny anywhere still wins.

Do not use `NotPrincipal` with `Deny` for principals that have a boundary; use `ArnNotEquals` on `aws:PrincipalArn`.

Source: IAM User Guide, "Permissions boundaries for IAM entities".

## STS sessions and Regions

The role-chain, `GetSessionToken` and opt-in Region rules are in SKILL.md. Details beyond them:

- A chained `AssumeRole` with `DurationSeconds` over 3600 fails; it is not clamped.
- `GetSessionToken` sessions for IAM users run 15 minutes to 36 hours (default 12 hours); root sessions are capped at 1 hour.
- Example of the opt-in rule: a caller in account A assuming a role in account B through `sts.ap-southeast-3.amazonaws.com` needs `ap-southeast-3` enabled in B; A need not have it.
- Tokens from the legacy global STS endpoint are valid only in default-enabled Regions unless the account changes the token version. Prefer Regional STS endpoints.
- `sts get-caller-identity` needs no permission, and an explicit deny on it does not block it.

Sources: IAM User Guide "Roles terms and concepts" and "Manage AWS STS in an AWS Region"; STS API reference for `GetSessionToken` and `GetCallerIdentity`.

## Confused deputy

AWS recommends `aws:SourceArn`, `aws:SourceAccount`, `aws:SourceOrgID` or `aws:SourceOrgPaths` wherever a service principal is granted access to your resource (bucket policy, key policy, role trust policy). `sts:ExternalId` covers third-party accounts assuming a role.

Source: IAM User Guide, "The confused deputy problem".

## PassRole

- `iam:PassRole` is a permission, not an API call, and CloudTrail does not log it. Look at the create or update call that received the role (for example `CreateFunction`).
- It works only for services in the same account.
- Do not control PassRole by tagging the role and testing `aws:ResourceTag`; AWS says the results are unreliable.
- Narrow with `Resource` role ARNs or a path, and `iam:PassedToService`.

Source: IAM User Guide, "Grant a user permissions to pass a role to an AWS service".

## Actions that let a principal grant itself more access

Treat these as admin-equivalent when reviewing a policy, and scope them tightly (resource ARNs, a permissions-boundary condition) or leave them out:

- Writing or attaching policies: `iam:PutUserPolicy`, `PutRolePolicy`, `PutGroupPolicy`, `AttachUserPolicy`, `AttachRolePolicy`, `AttachGroupPolicy`, `CreatePolicyVersion`, `SetDefaultPolicyVersion`.
- Taking over another user: `iam:CreateAccessKey`, `CreateLoginProfile`, `UpdateLoginProfile` on a user other than yourself.
- Changing who can assume a role: `iam:UpdateAssumeRolePolicy`.

Evidence: the permissions-boundaries page's delegation example has to constrain `AttachUserPolicy`, `PutUserPolicy`, `DetachUserPolicy`, `CreatePolicyVersion` and `SetDefaultPolicyVersion` (and denies edits to the boundary policy), and says the delegate can reset passwords and create access keys for other users. The role and group variants are inferred as the same operation on another identity type, as is `UpdateAssumeRolePolicy` (the PassRole page shows it replacing a role's trust policy). Not a complete list.

## Not carried over

Upstream claims that could not be confirmed against the pages above, so left out: a fixed count of escalation actions, `aws login` credentials refreshing every 15 minutes, `aws login` being unavailable in GovCloud and China, and the Organizations, SAML, MFA, SigV4 and SDK trivia in the upstream edge-case list. Check the AWS docs before relying on any of these.
