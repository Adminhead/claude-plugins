# Metrics and metric math

Checked against the CloudWatch metric math and concepts pages (docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html and cloudwatch_concepts.html).

## Pulling metrics

Use `get-metric-data` for anything beyond a single series. It takes up to 100,800 datapoints per call and supports metric math. `get-metric-statistics` caps at 1,440 datapoints and has no math.

```bash
aws cloudwatch get-metric-data --profile <profile> --region <region> \
  --start-time <iso-start> --end-time <iso-end> --scan-by TimestampAscending \
  --metric-data-queries '[
    {"Id":"errors","ReturnData":false,"MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Errors","Dimensions":[{"Name":"FunctionName","Value":"<function>"}]},"Period":60,"Stat":"Sum"}},
    {"Id":"invocations","ReturnData":false,"MetricStat":{"Metric":{"Namespace":"AWS/Lambda","MetricName":"Invocations","Dimensions":[{"Name":"FunctionName","Value":"<function>"}]},"Period":60,"Stat":"Sum"}},
    {"Id":"errorRate","Expression":"100 * errors / invocations","Label":"Error rate %"}
  ]' \
  --query 'MetricDataResults[].[Label,Timestamps,Values]' --output json
```

- Ids start with a lowercase letter. Function names are uppercase (`SUM`, `FILL`, `IF`).
- `ReturnData: false` hides the inputs so only the expression comes back.
- Timestamps in the result mark the start of each period.
- Pick a period that matches how the metric is stored. Sub-minute periods work only for high-resolution custom metrics, and EC2 basic monitoring publishes every five minutes.
- Percentile stats use `"Stat":"p99"`. Lambda, ALB, API Gateway, EC2, and RDS metrics support them.
- Check the raw output once before adding a `--query` projection, since the result is large.

## Metric math rules that matter

- Missing values count as 0 in arithmetic. A division by zero drops that datapoint instead of failing, so a gap in `errorRate` means no traffic in that period.
- `FILL(errors, 0)` fills gaps with a value, `REPEAT`, or `LINEAR`. Use it when Lambda publishes no `Errors` point for idle periods.
- `IF(condition, trueValue, falseValue)` filters or collates series, for example `IF(p99 > 2000, 1, 0)` marks breach periods.
- `RATE(m1)` gives per-second change, `DIFF(m1)` the change since the previous point, and `SORT(METRICS(), AVG, DESC, 5)` the top five series by average.
- `SERVICE_QUOTA(m1)` returns the quota for a usage metric in `AWS/Usage`. Use it for headroom instead of assuming an account limit, which varies by account and Region. Check the limit directly with `aws lambda get-account-settings --query AccountLimit` for Lambda.
- There is no time-shift function. For a baseline, run the same query over the same window one week earlier and compare the two outputs.

## Patterns

**Error rate.** The query above. Compare against a week-earlier run before calling a rate abnormal.

**Latency regression.** Query `Duration` (Lambda), `TargetResponseTime` (ALB), or `Latency` (API Gateway) with `Stat: p99` for the incident window and the baseline window. A clear rise over the baseline calls for a log query by operation.

**Throttling pressure.** Sum the throttle signals that apply, each with `FILL(..., 0)`: Lambda `Throttles`, DynamoDB `ThrottledRequests`, API Gateway 4XX (`4XXError`, with 429 distinguished in logs). A rise that lines up with the first error is a capacity or quota cause.

**Queue backlog growth.** `ApproximateNumberOfMessagesVisible` rising while `NumberOfMessagesDeleted` stays flat means consumers stopped or slowed. `ApproximateAgeOfOldestMessage` shows how far behind.

**Retention.** One-minute data is kept 15 days, five-minute data 63 days, and hourly data 455 days. For older windows ask for `Period: 300` or `3600` or the call returns nothing useful.
