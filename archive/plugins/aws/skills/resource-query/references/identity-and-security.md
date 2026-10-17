# Identity and security

Append `--profile <profile> --region <region> --no-cli-pager` to every command. IAM is account-wide.

## IAM

```bash
aws iam list-users --query 'Users[].[UserName,CreateDate,PasswordLastUsed]' --output table
aws iam list-roles --query 'Roles[].[RoleName,CreateDate]' --output table
aws iam get-role --role-name <name> --query 'Role.[RoleName,Arn,AssumeRolePolicyDocument]'
aws iam list-attached-role-policies --role-name <name> --query 'AttachedPolicies[].[PolicyName,PolicyArn]' --output table
aws iam list-role-policies --role-name <name>
aws iam list-groups --query 'Groups[].[GroupName,CreateDate]' --output table
aws iam list-policies --scope Local --query 'Policies[].[PolicyName,AttachmentCount,DefaultVersionId]' --output table
aws iam get-policy-version --policy-arn <arn> --version-id <v>
aws iam list-mfa-devices --user-name <user>
aws iam list-access-keys --user-name <user> --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output table
aws iam get-account-password-policy
aws iam get-account-summary
# "can this role do X?" (evaluates policies, changes nothing)
aws iam simulate-principal-policy --policy-source-arn <role-arn> --action-names <service:Action> --resource-arns <arn>
```

`list-access-keys` shows key IDs and status only, never the secret. `iam create-*`, `generate-credential-report`, and every `update-*` verb are denied.

## KMS

```bash
aws kms list-aliases --query 'Aliases[].[AliasName,TargetKeyId]' --output table
aws kms describe-key --key-id <id> --query 'KeyMetadata.[KeyId,Description,KeyState,KeyUsage,KeyManager,Enabled]'
aws kms get-key-rotation-status --key-id <id>
```

`decrypt`, `encrypt`, `re-encrypt`, and `generate-data-key*` are denied.

## Secrets Manager and SSM Parameter Store (metadata only)

```bash
aws secretsmanager list-secrets \
  --query 'SecretList[].[Name,LastChangedDate,LastAccessedDate,RotationEnabled]' --output table
aws secretsmanager describe-secret --secret-id <name> \
  --query '{Name:Name,RotationEnabled:RotationEnabled,LastRotatedDate:LastRotatedDate,KmsKeyId:KmsKeyId}'
aws ssm describe-parameters --query 'Parameters[].[Name,Type,LastModifiedDate]' --output table
aws ssm describe-parameters --parameter-filters 'Key=Path,Values=<path>' --query 'Parameters[].[Name,Type]' --output table
```

`secretsmanager get-secret-value`, `batch-get-secret-value`, and every `ssm get-parameter*` call are denied, with or without `--with-decryption`. A secret or parameter name can itself reveal something sensitive, so list names only when asked.

## ACM

```bash
aws acm list-certificates --query 'CertificateSummaryList[].[CertificateArn,DomainName,Status]' --output table
aws acm describe-certificate --certificate-arn <arn> --query 'Certificate.[DomainName,Status,NotAfter,InUseBy]'
```

## GuardDuty, Security Hub, Config

```bash
aws guardduty list-detectors --query 'DetectorIds'
aws guardduty list-findings --detector-id <id> --max-items 20
aws securityhub get-findings --max-items 20 \
  --query 'Findings[].[Title,Severity.Label,Workflow.Status,UpdatedAt]' --output table
aws configservice describe-config-rules --query 'ConfigRules[].[ConfigRuleName,ConfigRuleState]' --output table
aws configservice describe-compliance-by-config-rule \
  --query 'ComplianceByConfigRules[].[ConfigRuleName,Compliance.ComplianceType]' --output table
```
