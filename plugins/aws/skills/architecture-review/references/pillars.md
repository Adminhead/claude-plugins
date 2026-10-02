# Pillar checklists

Source: the six pillars of the AWS Well-Architected Framework (docs.aws.amazon.com/wellarchitected/latest/framework/). Each item says what to look for. Check IaC first, then the live resource when in scope. Skip items for services the workload does not use.

## Operational excellence

- All infrastructure comes from IaC, and the live account matches it. Drift shows up as resources the IaC does not define (compare `aws cloudformation detect-stack-drift` results only if the user agrees, since it starts a drift run).
- A deployment pipeline exists, with a way to roll back.
- Resources carry a consistent tag set (owner, environment, service, cost center).
- Alarms cover the workload's key signals, and each alarm has an action or a clear owner.
- CloudTrail is on, ideally a multi-region trail with log file validation (`aws cloudtrail describe-trails`).
- A runbook or operations note exists for the on-call path.

## Security

- IAM policies grant specific actions and resources. Flag `"Action": "*"` or `"Resource": "*"` paired with write actions, and flag `iam:PassRole` without a resource.
- No credentials in IaC, task definitions, Lambda environment variables, or user data. Secrets come from Secrets Manager or SSM Parameter Store and reach the workload by reference. Check the IaC for literal values. Live, list key names only (for example `aws lambda get-function-configuration --function-name <name> --query 'Environment.Variables | keys(@)'`). Report the file and line or the resource and the key name, and never repeat a value.
- S3: Block Public Access on, default encryption on, and a bucket policy that denies requests with `aws:SecureTransport` false.
- Data stores are encrypted at rest (RDS `StorageEncrypted`, EBS, DynamoDB, SQS, SNS) and use customer-managed KMS keys where the data's sensitivity calls for it.
- Databases and internal services sit in private subnets. Security groups open no administrative port (22, 3389, database ports) to `0.0.0.0/0`.
- TLS is enforced on load balancers and API endpoints, and certificates come from ACM with renewal.
- Internet-facing APIs and CloudFront distributions have AWS WAF or a documented reason for none.
- GuardDuty is on in the account and Region (`aws guardduty list-detectors`). Security Hub or Config rules cover the baseline where the organization uses them.
- Versioning, and Object Lock where policy requires immutability, protect data that must not be deleted.

## Reliability

- Production databases run Multi-AZ (RDS `MultiAZ`, Aurora with replicas in more than one AZ). DynamoDB uses global tables only where cross-Region failover is a stated need.
- Compute spans at least two AZs and sits behind a load balancer or an Auto Scaling group with health checks.
- Backups are on with a retention period that matches the recovery need: RDS `BackupRetentionPeriod`, DynamoDB point-in-time recovery, and S3 versioning with lifecycle rules.
- Restores are tested, or the report says the restore path is unproven.
- Asynchronous work has a dead-letter queue and an alarm on it (Lambda async, SQS, SNS, EventBridge targets).
- Timeouts and retries are set on calls between services, and retries have backoff.
- Reserved concurrency on critical Lambda functions guarantees capacity or protects a downstream, but it also caps the function. Note which one is intended.
- Service quotas that the workload approaches are known. Route 53 health checks and failover exist where the design needs DNS failover.

## Performance efficiency

- Instance, Lambda memory, and database class suit measured load (see `cost.md`), not a guess.
- Caching sits where reads repeat: CloudFront for static content, API Gateway caching, ElastiCache or DAX for hot data.
- Variable load uses a model that scales with it: Aurora Serverless v2, DynamoDB on-demand, Lambda, or Auto Scaling policies.
- Latency-critical synchronous Lambda paths consider provisioned concurrency or SnapStart where the runtime supports it.
- Databases have the indexes the access patterns need, and DynamoDB keys spread load across partitions.

## Cost optimization

- Steady baseline compute is covered by Savings Plans or Reserved Instances, and the rest runs on demand or spot.
- S3 lifecycle rules or Intelligent-Tiering move cold data to cheaper classes.
- gp2 EBS volumes move to gp3, which AWS prices up to 20 percent lower per GB with a 3,000 IOPS baseline.
- Lambda and EC2 use arm64 or Graviton where the code and dependencies support it. AWS cites better price performance, so measure the workload before committing.
- VPC gateway endpoints serve S3 and DynamoDB traffic that would otherwise pay NAT gateway data charges.
- Non-production environments shut down or scale to zero outside working hours.
- AWS Budgets and Cost Anomaly Detection exist. Unattached volumes, idle load balancers, and unused Elastic IPs are cleaned up.

## Sustainability

- Managed and serverless services replace always-on servers where load is spiky.
- Auto Scaling avoids standing over-provision. Right-sizing and Graviton lower energy per unit of work.
- Data retention policies delete data that has no use, and storage classes match access.
- Region choice weighs latency, data residency, and the provider's published carbon data.
