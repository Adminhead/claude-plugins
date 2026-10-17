# Terratest module tests

Read this when a repo already tests modules with Terratest (Go `_test.go` files importing `github.com/gruntwork-io/terratest/modules/terraform` or `.../modules/terraform/v2`), or when the user asks for Go-based module tests. For new tests in a repo without Go, prefer native `terraform test` (see SKILL.md, "Testing and scanning"): it needs no extra toolchain.

Adapted from the "Terratest Module Testing" agent in github/awesome-copilot (MIT, Copyright GitHub, Inc.). API names checked against the Terratest source at `modules/core/v2.0.0` (2026-09), 2026-10.

## Versions

Terratest v2 (September 2026) is 16 Go modules under `/v2` import paths (`github.com/gruntwork-io/terratest/modules/terraform/v2`, `.../modules/teststructure/v2`, `.../modules/core/v2/random`). It removed the v1 helpers that had no context argument: call `terraform.InitAndApplyContext(t, ctx, opts)` rather than `terraform.InitAndApply(t, opts)`, with `ctx := t.Context()`. `test-structure` became `teststructure`, and `random.UniqueId` became `random.UniqueID`. v1 is frozen at v1.0.1 (security fixes only until September 2027), where the old names still compile with deprecation warnings. Match the version in the repo's `go.mod`, and use v2 for new tests. The migration guide is at terratest.gruntwork.io/docs/migrating-to-v2/overview/.

## Pick the test intent first

| Intent | Terraform calls | Cloud credentials | Where it runs |
| --- | --- | --- | --- |
| Static contract (inputs validate, plan has the right shape) | `InitAndValidateContext`, `InitAndPlanAndShowWithStructContext` | Usually none, or read-only | Every PR |
| Negative path (bad input is rejected with a clear message) | `InitAndPlanContextE` or `InitAndApplyContextE`, assert the error | None when a `validation` block rejects at plan time | Every PR |
| Apply and verify (real resources, outputs, behaviour) | `InitAndApplyContext`, `OutputContext`, then `DestroyContext` | Yes, in a sandbox account | Scheduled or on demand |
| Staged end-to-end (setup, deploy, validate, teardown reused across runs) | `teststructure.RunTestStage` | Yes | On demand |

Default to the first two. Write apply-based tests only when the user asks for integration tests, because they create real infrastructure and cost money.

## Layout and running

- Put tests under `test/` or `tests/terraform/`, one `_test.go` per module or example, with its own `go.mod` (or the repo's), so module consumers do not pull Go deps.
- Point `TerraformDir` at an `examples/<name>` directory that calls the module, not at the module itself. The example is the contract users copy.
- Run with `go test -v -count=1 -timeout 30m ./...` from the test directory. `-count=1` disables Go's test cache (an apply test must never be served from cache), and the default 10-minute timeout kills apply tests partway, leaving resources behind.
- For OpenTofu set `TerraformBinary: "tofu"` in the options.

## Patterns

Plan-only contract test:

```go
func TestBucketPlan(t *testing.T) {
	t.Parallel()
	opts := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: "../examples/basic",
		Vars:         map[string]interface{}{"name": "plan-" + random.UniqueID()},
		PlanFilePath: filepath.Join(t.TempDir(), "tfplan"),
	})
	plan := terraform.InitAndPlanAndShowWithStructContext(t, t.Context(), opts)
	terraform.RequirePlannedValuesMapKeyExists(t, plan, "module.bucket.aws_s3_bucket.this")
}
```

Negative test, asserting a stable substring of the validation message rather than the full output:

```go
_, err := terraform.InitAndPlanContextE(t, t.Context(), opts)
require.Error(t, err)
require.Contains(t, err.Error(), "name must be 3-63 characters")
```

Apply test: register cleanup before apply, so a failed apply still destroys what it created.

```go
ctx := t.Context()
defer terraform.DestroyContext(t, ctx, opts)
terraform.InitAndApplyContext(t, ctx, opts)
require.Equal(t, "expected", terraform.OutputContext(t, ctx, opts, "bucket_region"))
```

## Rules

- `t.Parallel()` for independent tests, and never share a working directory between parallel tests. Copy the example with `teststructure.CopyTerraformFolderToTemp` when two tests use the same one, since `.terraform/` and local state collide.
- Give globally unique resources (bucket names, DNS records) a `random.UniqueID()` suffix so parallel and repeated runs don't clash.
- Use the `E` variants (`InitAndApplyContextE`, `OutputContextE`) when a failure is the expected result; the plain ones call `t.Fatal`.
- `WithDefaultRetryableErrors` retries known transient provider errors. Don't widen the retry list to hide real failures.
- Idempotency check where it matters: after apply, `terraform.InitAndPlanWithExitCodeContext` should return 0 (no changes).
- Staged tests: wrap each stage in `teststructure.RunTestStage(t, "deploy", func() {...})`. Setting `SKIP_deploy=true` skips that stage during local iteration; save options between stages with `teststructure.SaveTerraformOptions` and `LoadTerraformOptions`.
- Keep apply-test cleanup explicit and never skip it silently. If a test is interrupted, say so and list what may be left (`terraform state list` in the example directory).
- Don't add cloud secrets to CI for PR tests. Plan-only and negative tests should run without them; gate apply tests behind a manual or scheduled workflow with a sandbox account.
- In CI, emit JUnit (for example `go test -v ... 2>&1 | go-junit-report`) and publish the summary with `if: always()` so failures are readable.
