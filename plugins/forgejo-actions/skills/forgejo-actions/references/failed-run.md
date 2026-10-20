# Failed run

## 1. Parse the URL

`https://<host>/<owner>/<repo>/actions/runs/<n>[/jobs/<j>]`. Keep host, owner/repo and `<n>`. The `<n>` in the web URL is the run number shown in the UI, which is not the database run ID that the API and forgejo-mcp use. The trailing job number is, as far as we know, a job index within the run (hedge: confirm against the job list). Without a URL, use the current repo's Forgejo remote (see the gate in SKILL.md).

## 2. Read the failure

Preferred, when `mcp__plugin_forgejo-mcp_forgejo__*` tools are present (check each tool's schema before calling):

1. `list_workflow_runs`: find the entry whose `run_number` equals `<n>` and use its ID for later calls. `get_workflow_run` gives event, commit and conclusion.
2. `list_action_run_jobs` for that run; pick the failed job.
3. `get_action_job_logs` for that job. This needs Forgejo v16 or later and fails on older instances.

Without the MCP server, or on a pre-v16 instance: `fj actions tasks` lists tasks (check `fj actions tasks --help`), but fj has no run-log command. Ask the user to paste the failing step's log from the web UI. Do not guess a cause without a log line.

If the web UI log is incomplete, the runner's own logs on the runner host may hold more (troubleshooting page). That is the runner admin's access, not yours.

Also note which commit and event failed (push, PR, schedule). A fork PR run waiting for approval is not a failure; see [security](security.md).

## 3. Classify

Quote the log line, then name one class:

| Class | Typical sign | Fix |
| --- | --- | --- |
| Waiting, never starts | Job queued, no log | No online runner has the `runs-on` label, or a fork PR awaits approval. See [runners](runners.md). |
| Schema error | Failure in "Set up job"; warning icon on the workflow in the Actions list (Forgejo 13+) | Fix the YAML key; run `forgejo-runner validate`. |
| Action not found or clone fails | `uses:` fetch error | A short ref resolved against the wrong default host; use a full URL. Check the tag exists. |
| Missing tool or image | `command not found`, `node: not found` | The default image is minimal Debian with Node; install the tool or set `container.image`. |
| Missing secret or variable | Empty value, auth error | The user's call; tell them which name is expected. |
| Wrong credentials | Cannot access another repo | Checkout's persisted credentials win over a custom token; set `persist-credentials: false`. |
| Fork PR limits | No secrets, read-only token | Expected on `pull_request` from forks. |
| Flaky | Network timeout, passes on rerun | Rerun once. |
| Code failure | Test, build or lint fails | Fix the code, not the workflow. |

## 4. Fix, rerun, watch

Workflow edits follow "Before any edit" in SKILL.md. After the fix is pushed, a new run starts from the push event. For an unchanged flaky failure, one rerun from the web UI (or the forgejo-mcp tools, with the user's approval) is acceptable; do not loop. Watch a PR's checks with `fj pr status <n> --wait`, or poll `list_workflow_runs`, and report each cycle's class and result. Do not rerun, cancel or dispatch without the user's approval.
