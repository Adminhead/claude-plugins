# Cost candidates

Add `--profile <profile> --region <region> --no-cli-pager`, except `aws ce` and `aws budgets`, which take `--region us-east-1` (Cost Explorer has one endpoint, `ce.us-east-1.amazonaws.com`; AWS General Reference, Billing and Cost Management endpoints). Sample utilization over at least 7 days, and 14 where the load has a weekly rhythm, because a quiet week hides the peak. One-minute metric data is kept 15 days, so hourly periods suit a longer look. Report estimates as estimates, and give the pricing source or label the figure unconfirmed.

## Spend

Each Cost Explorer request is billed (about $0.01 on the primary billing view), so group in a single call. The end date is exclusive.

```bash
aws ce get-cost-and-usage --profile <profile> --region us-east-1 --no-cli-pager \
  --time-period Start=<YYYY-MM-DD>,End=<YYYY-MM-DD> \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' --output table
```

Filter to the workload with `--filter` on a cost allocation tag when the tag is activated. If it is not, say spend can only be shown account-wide.

## Utilization

```bash
# EC2 CPU, hourly average and peak over 7 days
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=<id> --start-time <iso-7d-ago> --end-time <iso-now> \
  --period 3600 --statistics Average Maximum

# Lambda duration and invocations
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Duration \
  --dimensions Name=FunctionName,Value=<name> --start-time <iso-7d-ago> --end-time <iso-now> \
  --period 86400 --statistics Average Maximum
```

`get-metric-statistics` returns at most 1,440 datapoints per call, which fits 7 days at hourly periods. Memory and disk for EC2 need the CloudWatch agent, and without it the right-sizing call rests on CPU alone, which you should say. When Compute Optimizer is enabled, `aws compute-optimizer get-ec2-instance-recommendations` and `get-lambda-function-recommendations` are a better starting point than raw CPU. `aws ce get-rightsizing-recommendation --service AmazonEC2 --region us-east-1` also exists.

## Candidate patterns

| Area | Look for | Evidence needed | Fix |
| --- | --- | --- | --- |
| EC2 | Low average and peak CPU, memory headroom | 7 to 14 days of metrics | Smaller type, Graviton, Savings Plan for the steady part |
| Lambda | Memory far above `@maxMemoryUsed`, or a long, CPU-bound duration | Logs Insights REPORT lines | Tune memory (more memory can cut duration and cost), arm64 after a test |
| RDS | Low CPU and connections, Multi-AZ on non-production | `CPUUtilization`, `DatabaseConnections` | Smaller class, single-AZ for dev, Aurora Serverless v2 for spiky load |
| DynamoDB | Provisioned capacity far above consumed, or on-demand on steady load | `ConsumedRead/WriteCapacityUnits` against provisioned | Switch billing mode or add auto scaling |
| EBS | `available` (unattached) volumes, gp2 volumes | `describe-volumes` | Delete after snapshot approval, move to gp3 |
| S3 | Large Standard buckets with old objects, no lifecycle rules | `get-bucket-lifecycle-configuration`, storage metrics | Lifecycle rules or Intelligent-Tiering |
| Network | NAT gateway data from S3 or DynamoDB, one NAT per AZ in non-production | NAT `BytesOutToDestination`, route tables | Gateway endpoints, fewer NATs where availability allows |
| ECS and EKS | Over-sized tasks or idle nodes, steady Fargate | Service CPU and memory metrics | Right-size tasks, Fargate Spot for tolerant batch and dev |
| Idle | Load balancers with no requests, unused Elastic IPs | `RequestCount`, `describe-addresses` | Remove after the owner confirms |

## Ranking

Rank candidates by monthly saving, then by risk, then by effort, and show all three. Do not invent a single score. A candidate with no utilization evidence stays in an "unverified" list.

Deleting or resizing is a change the user approves and applies through IaC. List the rollback beside each candidate.
