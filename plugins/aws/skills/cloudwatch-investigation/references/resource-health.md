# Per-resource health

For each type: find the resource, read its state, pull the key metrics (see `metrics.md` for the call), find its logs, and match against usual causes. Add `--profile <profile> --region <region> --no-cli-pager`. Metric namespaces and dimensions are from the AWS service metrics pages (docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/aws-services-cloudwatch-metrics.html).

If several resources match a name, ask for the region or account instead of picking one.

## Lambda

- **Find:** `aws lambda get-function-configuration --function-name <name> --query '{State:State,Reason:StateReason,LastUpdate:LastUpdateStatus,Memory:MemorySize,Timeout:Timeout,Runtime:Runtime}'` (this projection leaves out environment variables, which hold secrets).
- **Metrics:** `AWS/Lambda`, dimension `FunctionName`. `Invocations`, `Errors`, `Throttles`, `Duration` (p99), `ConcurrentExecutions`, and for stream or async sources `IteratorAge`, `AsyncEventAge`, `DeadLetterErrors`.
- **Logs:** `/aws/lambda/<name>`. Use the cold start, OOM, and timeout queries in `logs-insights.md`.
- **Usual causes:** timeout shorter than a downstream call, memory too low (peak memory near 100 percent), reserved or account concurrency exhausted (`Throttles` rise), a deploy that changed code or configuration, a VPC function without a route to its dependency.
- **Proposal, needs approval:** raise memory or timeout, `aws lambda put-function-concurrency`, roll back to the previous version.

## ECS

- **Find:** `aws ecs describe-services --cluster <c> --services <s> --query 'services[0].[status,runningCount,desiredCount,pendingCount,deployments[].[status,rolloutState]]'`, then `aws ecs list-tasks --cluster <c> --service-name <s> --desired-status STOPPED` and then `aws ecs describe-tasks --cluster <c> --tasks <task-arn> --query 'tasks[].[taskArn,lastStatus,stopCode,stoppedReason,containers[].exitCode]'`. Always project, because the full response includes container override environment values.
- **Metrics:** `AWS/ECS`, dimensions `ClusterName` and `ServiceName`. `CPUUtilization`, `MemoryUtilization`. Container Insights adds task-level metrics when it is on.
- **Logs:** the log group in the task definition's `logConfiguration` (read it with a projection, not the whole definition, because it includes environment values).
- **Usual causes:** tasks stopping with exit code 137 (out of memory) or failing health checks, an image that cannot be pulled, a deployment that never reaches steady state, no capacity in the cluster.
- **Proposal, needs approval:** `aws ecs update-service --force-new-deployment`, task size changes, rolling back the task definition revision.

## EC2

- **Find:** `aws ec2 describe-instances --instance-ids <id> --query 'Reservations[].Instances[].[State.Name,InstanceType,LaunchTime]'` and `aws ec2 describe-instance-status --instance-ids <id> --include-all-instances`.
- **Metrics:** `AWS/EC2`, dimension `InstanceId`. `StatusCheckFailed_System` (AWS-side), `StatusCheckFailed_Instance` (guest OS), `CPUUtilization`, and `CPUCreditBalance` on burstable types. Memory and disk need the CloudWatch agent. Without it, say the data is missing.
- **Logs:** only where the agent ships them.
- **Usual causes:** a failed system check (hardware, host, or network) versus a failed instance check (OS hang, full disk, bad configuration), exhausted CPU credits, an instance retirement event.
- **Proposal, needs approval:** reboot, stop and start, replace through the Auto Scaling group.

## RDS and Aurora

- **Find:** `aws rds describe-db-instances --db-instance-identifier <id> --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass,MultiAZ,AllocatedStorage,PerformanceInsightsEnabled]'` and `aws rds describe-events --source-type db-instance --source-identifier <id> --duration 1440`.
- **Metrics:** `AWS/RDS`, dimension `DBInstanceIdentifier`. `CPUUtilization`, `FreeStorageSpace`, `FreeableMemory`, `DatabaseConnections`, `ReadLatency`, `WriteLatency`, `DiskQueueDepth`.
- **Performance Insights**, when enabled: `aws pi get-resource-metrics --service-type RDS --identifier <DbiResourceId> --metric-queries '[{"Metric":"db.load.avg"}]' --start-time <iso> --end-time <iso> --period-in-seconds 300`. The identifier is the resource id (`db-...`), not the instance name.
- **Logs:** `/aws/rds/instance/<id>/<log-type>` when log exports are on.
- **Usual causes:** connections near the engine limit after a deploy or a pool leak, storage nearly full, CPU or I/O saturation from one query (Performance Insights shows top SQL), a failover or maintenance event in `describe-events`.
- **Proposal, needs approval:** scale the class or storage, tune the pool, fail over. Rebooting resets connections but drops every session, so propose it last.

## ALB

- **Find:** `aws elbv2 describe-load-balancers --names <name>`, then `describe-target-groups --load-balancer-arn <arn>` and `describe-target-health --target-group-arn <arn>`.
- **Metrics:** `AWS/ApplicationELB`, dimension `LoadBalancer` (the `app/<name>/<id>` suffix of the ARN), plus `TargetGroup` for target metrics. `HTTPCode_ELB_5XX_Count` (the balancer), `HTTPCode_Target_5XX_Count` (the app), `TargetResponseTime`, `UnHealthyHostCount`, `RejectedConnectionCount`.
- **Logs:** access logs in S3 when enabled. They are not in CloudWatch.
- **Usual causes:** ELB 5XX with healthy targets points at the balancer or a reset connection, target 5XX points at the application, `UnHealthyHostCount` above 0 points at a health check path or security group that changed.

## DynamoDB

- **Find:** `aws dynamodb describe-table --table-name <name> --query 'Table.[TableStatus,BillingModeSummary.BillingMode,ProvisionedThroughput]'`.
- **Metrics:** `AWS/DynamoDB`, dimension `TableName`. `ThrottledRequests`, `ReadThrottleEvents`, `WriteThrottleEvents`, `SystemErrors`, `UserErrors`, `SuccessfulRequestLatency` (by `Operation`), `ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`.
- **Usual causes:** a hot partition key, provisioned capacity too low for a burst, an index that throttles writes to the table, a client retry storm.
- **Proposal, needs approval:** raise capacity or switch billing mode.

## SQS

- **Find:** `aws sqs get-queue-attributes --queue-url <url> --attribute-names All --query 'Attributes.{Visible:ApproximateNumberOfMessages,InFlight:ApproximateNumberOfMessagesNotVisible,Delayed:ApproximateNumberOfMessagesDelayed,Redrive:RedrivePolicy}'`. The attributes include the queue policy, so keep that projection.
- **Metrics:** `AWS/SQS`, dimension `QueueName`. `ApproximateNumberOfMessagesVisible`, `ApproximateAgeOfOldestMessage`, `NumberOfMessagesSent`, `NumberOfMessagesDeleted`, and the same for the dead-letter queue.
- **Usual causes:** consumers down or throttled (visible and age climb), messages failing and cycling to the dead-letter queue, a visibility timeout shorter than processing time, which makes messages reappear.
- Do not call `receive-message` to peek. It hides messages from the real consumers.
