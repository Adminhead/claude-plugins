# Operations and cost

Append `--profile <profile> --region <region> --no-cli-pager` to every command.

## Alarms, dashboards, logs, trails

```bash
aws cloudwatch describe-alarms --state-value ALARM \
  --query 'MetricAlarms[].[AlarmName,Namespace,MetricName,StateReason]' --output table
aws cloudwatch describe-alarms --alarm-name-prefix <prefix> \
  --query 'MetricAlarms[].[AlarmName,StateValue,Threshold,EvaluationPeriods]' --output table
aws cloudwatch list-dashboards --query 'DashboardEntries[].[DashboardName,LastModified]' --output table
aws logs describe-log-groups --query 'logGroups[].[logGroupName,retentionInDays,storedBytes]' --output table
aws cloudtrail describe-trails \
  --query 'trailList[].[Name,S3BucketName,IsMultiRegionTrail,LogFileValidationEnabled]' --output table
aws ecr describe-repositories --query 'repositories[].[repositoryName,repositoryUri,createdAt]' --output table
```

`describe-alarms` returns metric alarms and, with `--alarm-types`, composite alarms. Reading log lines and querying logs belong to `aws:cloudwatch-investigation`.

## Messaging and events

```bash
aws sqs list-queues --query 'QueueUrls' --output table
aws sqs get-queue-attributes --queue-url <url> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible ApproximateAgeOfOldestMessage RedrivePolicy
aws sns list-topics --query 'Topics[].TopicArn' --output table
aws sns list-subscriptions-by-topic --topic-arn <arn> --query 'Subscriptions[].[Protocol,Endpoint,SubscriptionArn]' --output table
aws events list-rules --query 'Rules[].[Name,State,ScheduleExpression]' --output table
aws events list-event-buses --query 'EventBuses[].[Name,Arn]' --output table
aws kinesis list-streams --query 'StreamNames' --output table
aws firehose list-delivery-streams --query 'DeliveryStreamNames' --output table
```

`sqs receive-message`, `purge-queue`, and `sns publish` are denied. Subscription output can include subscriber addresses, so show endpoints only when asked.

## API Gateway and Step Functions

```bash
aws apigateway get-rest-apis --query 'items[].[id,name,createdDate]' --output table
aws apigatewayv2 get-apis --query 'Items[].[ApiId,Name,ProtocolType,ApiEndpoint]' --output table
aws stepfunctions list-state-machines --query 'stateMachines[].[name,stateMachineArn,type]' --output table
aws stepfunctions list-executions --state-machine-arn <arn> --max-items 20 \
  --query 'executions[].[name,status,startDate,stopDate]' --output table
```

`apigateway get-api-keys --include-values` returns key values and is denied.

## Search by tag

```bash
aws resourcegroupstaggingapi get-resources --tag-filters Key=<key>,Values=<value> \
  --query 'ResourceTagMappingList[].[ResourceARN]' --output table
```

This API is regional and returns only resources that are or were tagged, so an empty result does not mean nothing exists. For a full inventory by type use the service's own `describe-*` call or `configservice list-discovered-resources --resource-type <AWS::Service::Type>` when Config is on.

## Cost and billing

Each Cost Explorer API request is billed (about $0.01 on the primary billing view), so run few of them, group in one call, and say so before looping. End dates are exclusive.

```bash
aws ce get-cost-and-usage --time-period Start=<YYYY-MM-01>,End=<YYYY-MM-DD> \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' --output table
aws budgets describe-budgets --account-id <account-id> \
  --query 'Budgets[].[BudgetName,BudgetType,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount]' --output table
```

Take `<account-id>` from the earlier `sts get-caller-identity` call. Cost Explorer must be enabled in the account.
