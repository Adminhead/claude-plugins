# Logs Insights

Syntax checked against the CloudWatch Logs Insights query syntax pages (docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html). Commands are separated by `|`. A `sort` or `limit` must come after the last `stats`. Group by time with `bin(<n>m)`, and alias it (`bin(5m) as t`) so you can sort on it.

## Running a query

`--start-time` and `--end-time` are epoch seconds. `date -u -d '1 hour ago' +%s` works on GNU `date`; on macOS use `date -u -v-1H +%s`.

```bash
QID=$(aws logs start-query --profile <profile> --region <region> \
  --log-group-names <log-group> \
  --start-time <epoch-start> --end-time <epoch-end> \
  --query-string '<query>' --limit 200 \
  --query queryId --output text)

# poll until status is Complete (other terminal states: Failed, Cancelled, Timeout)
aws logs get-query-results --profile <profile> --region <region> --query-id "$QID" \
  --query '{status:status,stats:statistics,rows:results}'
```

- `--limit` accepts up to 100,000 events for Logs Insights QL, but one `get-query-results` call returns at most 10,000 and the rest page through `nextToken`. Set a small `--limit` (20 to 100) on any query that returns raw `@message` text, so less log content reaches your context.
- Never use the `unmask` command. It reveals content that a data protection policy masked.
- Log lines can hold tokens, keys, and personal data. Redact them before quoting a line in the report, and quote the shortest fragment that shows the point.
- A `Running` status returns partial results. Poll again before trusting totals.
- Use `--log-group-identifiers` with ARNs when querying log groups in other accounts.
- Wrap the query in single quotes, and escape any single quote inside it.
- Fields starting with `@` are discovered automatically. Lambda log groups expose `@requestId`, `@duration`, `@billedDuration`, `@type`, `@maxMemoryUsed`, and `@memorySize`. Other fields come from JSON logs (dot notation) or `parse`.

## Templates

**Error spike by time and stream**

```
fields @timestamp, @message, @logStream
| filter @message like /(?i)(error|exception|fatal|critical)/
| stats count(*) as errorCount by bin(5m) as t, @logStream
| sort t desc
| limit 50
```

**Top error messages**

```
filter @message like /(?i)(error|exception)/
| stats count(*) as n, earliest(@timestamp) as firstSeen, latest(@timestamp) as lastSeen by @message
| sort n desc
| limit 20
```

Messages with ids or timestamps rarely group, and the output repeats raw log text. Prefer to extract an error class and group by it:

```
filter @message like /(?i)(error|exception)/
| parse @message /(?<errClass>[A-Za-z.]*(Error|Exception))/
| stats count(*) as n by errClass
| sort n desc
| limit 20
```

Use the `@message` form above only to see example text, with a small limit.

**Latency percentiles by operation** (structured logs with an `operation` and a duration field; replace `durationMs`)

```
filter ispresent(durationMs)
| stats avg(durationMs) as avgMs, pct(durationMs, 50) as p50, pct(durationMs, 95) as p95,
        pct(durationMs, 99) as p99, count(*) as n by operation
| sort p99 desc
| limit 15
```

**Lambda duration summary**

```
filter @type = "REPORT"
| stats count(*) as invocations, avg(@duration) as avgMs, pct(@duration, 99) as p99Ms,
        max(@duration) as maxMs by bin(5m) as t
| sort t desc
```

**Lambda cold starts**

```
filter @type = "REPORT" and ispresent(@initDuration)
| stats count(*) as coldStarts, avg(@initDuration) as avgInitMs, max(@initDuration) as maxInitMs by bin(5m) as t
| sort t desc
```

`@initDuration` is not in the discovered-fields table for Lambda, but AWS's own query samples use it (serverlessland.com/snippets/cloudwatch-insight-lambda-cold-starts-count-and-duration). If it returns nothing on a log group that has cold starts, extract the value from the REPORT line instead: `parse @message "Init Duration: * ms" as initMs`.

**Lambda out-of-memory**

```
filter @message like /Runtime exited|out of memory|OOMKilled|Cannot allocate memory|MemoryError/
| stats count(*) as oomEvents by @logStream, bin(10m) as t
| sort t desc
| limit 20
```

Memory pressure before the failure:

```
filter @type = "REPORT"
| stats max(@maxMemoryUsed / @memorySize * 100) as peakMemPct, avg(@maxMemoryUsed / @memorySize * 100) as avgMemPct by bin(5m) as t
| sort t desc
```

The ratio holds whatever unit the two fields use.

**Lambda timeouts**

```
filter @message like /Task timed out/
| stats count(*) as timeouts by @logStream, bin(5m) as t
| sort t desc
```

To find near-misses, add `filter @type = "REPORT" and @duration > <0.9 x timeout in ms>`. Take the timeout from `aws lambda get-function-configuration --function-name <name> --query Timeout`.

**First occurrence of each error** (for the timeline)

```
filter @message like /(?i)(error|warn|timeout|refused|denied)/
| parse @message /(?<errClass>[A-Za-z.]*(Error|Exception|Timeout))/
| stats earliest(@timestamp) as firstSeen, latest(@timestamp) as lastSeen, count(*) as n by errClass
| sort firstSeen asc
| limit 20
```

**Follow one request**

```
filter @message like /<request-id>/
| fields @timestamp, @logStream, @message
| sort @timestamp asc
| limit 50
```

Case-insensitive matching uses `like /(?i)text/`. `filter field = value` and `field in [...]` can use field indexes, but `like` always scans every event.
