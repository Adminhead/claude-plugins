# Cost query habits

Read before the first Cost Explorer, Budgets or Compute Optimizer call. These are the mistakes that produce a plausible but wrong number.

## Steps

1. **Date.** Run `date -u +%F` and derive every `--time-period` from it. Do not use the year from memory.
2. **Query.** Last month, grouped by service (fill the placeholders from step 1):

   ```bash
   aws ce get-cost-and-usage --region us-east-1 --no-cli-pager \
     --time-period Start=<first-of-month>,End=<first-of-next-month> \
     --granularity MONTHLY --metrics UnblendedCost \
     --group-by Type=DIMENSION,Key=SERVICE \
     --filter '{"Not":{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit","Refund"]}}}' \
     --output json > /tmp/ce.json
   ```

3. **Arithmetic in a script.** Totals, month-over-month change and percentages come from a short script over the saved JSON (`jq`, or Python reading `ResultsByTime[].Groups[].Metrics.UnblendedCost.Amount`), never from adding numbers in your head.
4. **Report** the period with its dates, the metric, whether credits and refunds are excluded, and the account.

## Facts

| Habit | Why | Source |
| --- | --- | --- |
| `End` is exclusive | An `End` of the first of next month stops on the last day of the month | CLI reference, `ce get-cost-and-usage` |
| Filter or group on `RECORD_TYPE` | `CHARGE_TYPE` is not a valid dimension key | same page |
| Call Cost Explorer with `--region us-east-1` | Its only endpoint is `ce.us-east-1.amazonaws.com` | AWS General Reference, Billing and Cost Management endpoints |
| Pass `--region us-east-1` to `aws budgets` | Budgets endpoints are listed for us-east-1, us-west-2 and ca-central-1, all resolving to the same `budgets.amazonaws.com`; us-east-1 is the safe choice | same page |
| Do not read `Total` on a grouped query | The grouped example in the CLI reference returns `Total` as `{}`; sum `Groups[]` in a script, or run a second call without `--group-by` | CLI reference |
| `UsageQuantity` sums across units | Filter by `UsageType` or `UsageTypeGroups` first | CLI reference |
| `UnblendedCost` is the default metric | Use `AmortizedCost` only when asked about commitments | CLI reference lists the valid metrics |

## Changes

- `aws compute-optimizer update-enrollment-status --status Active` opts the account in (`Inactive` opts out and deletes recommendations). It is a write: show it and wait for approval, with `--include-member-accounts` only if the user wants the org enrolled.
- Creating budgets or anomaly subscriptions is a write too. Use the `aws-cli` write habits.

## Hand-off

A whole-workload cost audit, right-sizing candidates, or Savings Plans analysis belongs to `aws-well-architected`.

## Not carried over

From the upstream billing skill: the Cost Explorer and Savings Plans workflows, billing-view API support table, and CUR and Athena patterns were not rechecked, so they are not here. Search the AWS Cost Management docs when needed.
