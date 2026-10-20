# Guard improvements: bash-rules and cloud-ops-guard

Source: review of the bash-rules usage log (2026-10-18..20, ~16.3k Bash calls) and cloud-ops-guard fires in transcripts (2026-10-12..20, 72 fires). Items B1-B4 (bash-rules) and C1-C9 (cloud-ops-guard). Open questions resolved with the recommended defaults (see end).

## Done when
- B1-B4 and C1-C9 implemented with must-flag and must-pass tests built from the evidence commands.
- `claude plugin test plugins/bash-rules` passes; `bash plugins/cloud-ops-guard/scripts/tests/check.sh` reports `failed=0` and fuzz "none allowed"; `bun test plugins/cloud-ops-guard/scripts/cloud-ops-guard.spec.ts` passes.
- `python3 scripts/plugins.py check` clean. No change under `scripts/shared/`, `*/shell/`, `*/vendor/`, `*/log/usagelog.ts`.
- Live checks for B2a (Bash description reaches subagents) and B4 (classic-hook deny logged as `denied-later`).
- Both plugins shipped.

## Findings from the code
- B4: `next(e)` in `tool.call` runs the hooks beneath plus core; cloud-ops-guard's classic deny returns as a tool error, not `{deny}`. Log proof: 2026-10-20T02:28:10 `mise run tofu core apply -target=module.forgejo01 -auto-approve ...` logged `decision:"allow", isError:true, ms:18`. So register.tsx:218 logs every classic deny as `allow`. The model sees `PreToolUse:Bash hook error: <reason>`. Harness cannot fire classic events (register.test.tsx:189).
- B2a: 95% of read denies are in subagents (1282/1352, 364 agents, 988 repeats). Mods API offers `tool.describe`, `classic.SubagentStart`/`classic.SessionStart` (`additionalContext`), `prompt.section`.
- B3: `ShellCommand` has no source offsets or quote flags; must not change shared walk.ts.
- C9: bash-rules already denies `kubectl delete ns|--all|-A` and `helm uninstall` everywhere (danger.ts:408-416); cloud-ops-guard adds prod-scoped rules only.
- `marketplace.json` holds both plugins' versions; README catalog is generated. Only slice F touches them.

## Approach per item
- **B1** Deterministic write deny for stdin scripts whose body writes authored content (open w/a/x/+, `write_text`/`write_bytes`, `writeFile`/`appendFile`, `createWriteStream`, `File.write`, `file_put_contents`, perl `open >`). Tool Edit when READ_CODE also matches, else Write. Stays unsure: only `shutil.copy|move`/`os.rename|replace`, or every literal `open()` target is `/dev/null|stdout|stderr`. No scratch exemption (model allowed 0 of 126).
- **B2a** Append a constant primer to the Bash description via `on('tool.describe', { tool: 'Bash' })`. Fallback if subagents don't receive it: `classic.SubagentStart` + `classic.SessionStart` `additionalContext`.
- **B2b** Read deny names the offending segment (<=80 chars); compound commands get "drop that part, run the rest, use parallel Read calls"; multi-file `cat a b` / multi-range `sed -n 'a,bp;c,dp'` get "one Read per file or range"; state that every shell file viewer is denied.
- **B3** New pure `expandLiteralVars(command, commands)`: a var assigned once (or always the same value) at depth 0 to a literal matching `^[\w./=:@,+%-]+( [\w./=:@,+%-]+)*$` is substituted textually (`$NAME`, `${NAME}`, not `${NAME:-}`, not after `\`, not in single quotes, only after first `NAME=`); if result <= MAX_PARSE, `analyze()` and `askRule()` scan it instead. Computed values whose subs are all path finders (find, which, `command -v`, `type -P`, realpath, readlink, dirname, mktemp, `mise which`, `git rev-parse`, filtered by head/tail/sort) are program paths, not scripts. Still denied: echo/printf/decoder sources, eval / `-c` of a non-literal, metacharacters.
- **B4** In `classic.PreToolUse`, store `v.deny` in an Lru keyed by `e.tool_use_id`; in `tool.call` after `next(e)`, use it or match `out.isError && /^PreToolUse:\S+ hook error/` and log `denied-later` with the message (<=300 chars). Pure classifier in a new non-shared file.
- **C1** Drop the blanket `nesting > 0` ask (:374). Ask only when a guarded-tool command itself has `nesting > 0` (except aws read-only ops `describe-|list-|get-`, `filter-log-events`), when a substitution supplies the aws service/op, or when a tf non-flag word holds a substitution and nothing denied.
- **C2** For shells and python*/perl/ruby/node, ask only when an argument literally names a tool or the code argument / script operand is an expansion. eval, xargs, ssh, su, source keep the any-`$` rule.
- **C3** VALUE_FLAGS gains `working-dir`, `terragrunt-working-dir`, `log-level`, `terragrunt-log-level`, `config`, `terragrunt-config`, `download-dir`, `tf-path`, `iam-assume-role`, `queue-include-dir`, `queue-exclude-dir`, `log-format`. New SAVED_PLAN regex (basename `tfplan`, `*.tfplan`, `*.plan`, `plan.bin`) used only by `savedPlan`; allowlist PLANFILE stays strict. Variable plan path: literal same-command value is substituted and checked; `$S/x.tfplan` with literal no-space S is a saved plan (gate); anything else asks. Flag after plan file: deny with "Put flags before the plan file: apply -no-color tfplan."
- **C4** Subagents: console, `state pull`, `state show`, show, output, refresh get `gate` (`tfForm` returns gate for `state show`/`state list`... `state list` stays allowed). Main: `output -json|-raw`, `show -json`, `state pull` ask; output leaves QUIET_SUBS; console and refresh stay ask.
- **C5** At :246 / :259, deny when wrapped TF args classify deny. Path-like wrapper returns the wrapped findings; bare `$K` stays ask; DATA_CMDS keep today's ask.
- **C6** Heredoc check (:361) looks at the command word after `stripWrappers` (plus next word for xargs/busybox). For python/perl/ruby/node, ask only if the body has an exec call and a tool name.
- **C7** No opinion for `providers [schema|lock|mirror]`, graph, version, metadata; terragrunt `hclfmt`, `hcl fmt|validate`, list, find, dag, info, render, `--version`; `terragrunt run [--all] [flags] -- <sub>` classified by `<sub>`; `mise which|where|ls` is a lookup. `tofu test` stays ask.
- **C8** Main session aws asks on `delete-*`, `terminate-*`, `remove-*`, `deregister-*`, `revoke-*`, `detach-*`, `disassociate-*`, `disable-*`, `stop-*`, `put-*-policy`, `s3 rm|rb|mv`, `s3 sync --delete`. Skip global value flags (`--profile`, `--region`, `--output`, `--endpoint-url`, `--query`) before taking service/op.
- **C9** Extend cloud-ops-guard (stays one classic hook). kubectl, helm, talosctl, omnictl checked only as the command word after `stripWrappers`; separate K8S path, never the generic TF asks. Prod detection: `--context`/`--kube-context`; then `--kubeconfig`, `KUBECONFIG=` prefix or earlier `export KUBECONFIG=`; else `current-context:` from first `$KUBECONFIG` file or `~/.kube/config` (mutating verbs without explicit context only, 1 MB cap, regex, unreadable = not prod). Prod = `/(^|[^a-z0-9])prod(uction)?([^a-z0-9]|$)/i`. Prod deny: `kubectl delete` of pv/pvc/persistentvolume(claim)s/crd/node. Prod ask: apply, create, replace, patch, edit, other deletes, scale, `rollout restart|undo`, drain, cordon, taint, label, annotate, set, exec, cp, unknown verbs, helm install/upgrade/rollback. Subagents get `gate`. talosctl `reset|upgrade|apply-config|reboot|shutdown|etcd remove-member` and omnictl `delete|apply` ask in any context.

## Slices
Stream A touches only `plugins/bash-rules/**` (not the `plugin.json` version). Stream G touches only `plugins/cloud-ops-guard/scripts/**`. Each stream runs in order. Stage explicit paths. Commits: `feat(bash-rules): ...`, `fix(cloud-ops-guard): ...`.

Per-slice checks:
- A: `claude plugin test plugins/bash-rules && claude plugin validate plugins/bash-rules && python3 scripts/plugins.py check`
- G: `bash plugins/cloud-ops-guard/scripts/tests/check.sh | tail -3` (`failed=0`, fuzz none allowed), `bun test plugins/cloud-ops-guard/scripts/cloud-ops-guard.spec.ts`, `python3 scripts/plugins.py check`
- Both: `git diff --stat -- scripts/shared plugins/*/hooks/shell plugins/*/hooks/vendor plugins/*/scripts/shell plugins/*/scripts/vendor plugins/*/hooks/log/usagelog.ts .claude-plugin README.md` empty.

### A1. B4 later-deny logging
Files: `hooks/register.tsx`, new `hooks/rules/outcome.ts` (`laterDeny(out, stored)`), `tests/register.test.tsx`.
Tests: tool.call stub returning `{isError:true, text:'PreToolUse:Bash hook error: Save a plan with -out=tfplan...'}` for `mise run tofu core apply -target=module.forgejo01 -auto-approve -no-color` logs `denied-later`; `{isError:true, text:'exit 1'}` logs `allow` + `isError:true`.
Live check (slice F): `claude -p --allowedTools Bash --plugin-dir plugins/cloud-ops-guard "Run exactly: tofu apply -auto-approve"` in a scratch dir, then the row shows in today's log with `denied-later`.

### A2. B1 stdin write deny + B2b read message
Files: `hooks/rules/hygiene.ts` (:416-421, Finding `seg`/`compound`/`multi`, `nudge`), `tests/hygiene.test.ts`, `tests/register.test.tsx`.
- Deny write/Edit: `python3 - <<'EOF'\np='src/Vm.cs'; s=open(p).read(); s=s.replace('a','b'); open(p,'w').write(s)\nEOF` (also `python3 -I -`).
- Deny write/Write: `pathlib.Path('docs/x.md').write_text('hi')`; `with open("db/migrations/x.sql","w") as f: f.write(s)` after `cd x &&`; `open("/tmp/claude-1000/x/scratchpad/pr-patch.json","w").write("{}")`.
- Unsure: `import shutil; shutil.copy('a','b')`; `open('/dev/stdout','w').write('x')`.
- Pass: `import json; print(json.load(open('a.json'))['v'])`; `python3 /tmp/s/gen.py`.
- Messages: `rg -n foo src; sed -n 1,40p src/a.cs` names the sed segment and says "parallel Read"; `cat atlas.hcl db/scratch.sh sqlc.yaml` says one Read per file; `sed -n '440,560p;600,640p' docs/p.md` names the ranges; every read deny < 350 chars and matches `/Read tool .*offset and limit/`; B1 deny says to save a computed script with Write and run it as a file.
- Replay: all 126 "python3 script on stdin that writes files" rows in the usage log become write denies; no other row changes category.

### A3. B2a primer
Files: `hooks/rules/hygiene.ts` (export `PRIMER`, <=600 chars), `hooks/register.tsx` (`tool.describe` appends PRIMER), `.claude-plugin/plugin.json` userConfig `primer` (boolean, default true), `README.md`.
PRIMER: cat/head/tail/`sed -n`/awk prints of files are denied, also inside `;`/`&&` chains; use parallel Read calls; piping program output through head/grep is fine; write files with Write/Edit, including `python - <<EOF` that writes; grep, rg, find, ls, git stay in Bash.
Live check: a subagent quotes the bash-rules paragraph of its Bash description; else fall back to SubagentStart/SessionStart.
Metric after a week: read-repeat rate (baseline 988/1352 = 73%).

### A4. B3 literal variable expansion (loosens denies)
Files: new `hooks/danger/expand.ts`, `hooks/danger/rules.ts`, `hooks/rules/hygiene.ts` (`assignments()` keeps `subs`, PATH_FINDERS in `scriptVar`), `tests/hygiene.test.ts`, `tests/danger.test.tsx`.
- Pass: `cd w && H="dotnet run --no-build --project src/Tools.Headless -- --content content"; $H --scenario content/scenarios/smoke.json --ticks 1200`; `S=/tmp/claude-1000/x/scratchpad/setstatus.sh; bash $S 153 "In review"`; `C="kubectl --context omni-dev"; $C get ns`; `P="kubectl --context omni-dev -n isktel-dev exec isktel-db-1 -c postgres -- psql -U postgres -d isktel -At -c"; $P "select count(*) from sde.types"`; `Z=$(find /home/u/.local/share/mise/installs/zizmor -type f -name zizmor | head -1); "$Z" --offline .github/`; `export KUBECONFIG=~/.kube/dev.yaml; k="mise exec -- kubectl"; $k get ns`.
- Deny: `P="psql -c"; $P "DROP TABLE users"` (db-drop); `K="kubectl --context omni-prod"; $K delete ns foo`; `X='rm -rf /'; $X`; `S="-c reboot"; bash $S` (must not pass silently); `X=$(echo "rm -rf /"); $X` (smuggle); `PY=$(ls .venv/bin/python || echo /usr/bin/python3); $PY -c "print(1)"` (smuggle); hygiene.test.ts :248, :250, :251 stay smuggle; `S="print(1)"; python3 -c "$S"` stays smuggle.
- Unsure: `bash -c "$CMD"` (unassigned).
- Intended flips to pass (update with a comment): hygiene.test.ts :244-:247, :283.
- Replay: every deny->non-deny row is a variable-smuggle row with a literal or path-finder value; zero danger/sql rows lose their deny.

### G1. C6, C1, C2 precision
Files: `scripts/cloud-ops-guard.ts` (`check()` :361/:374, `classify()` :247-253), `scripts/tests/check.sh`.
- None: `cat > docs/x.md <<'EOF'\nrun tofu plan\nEOF\ngit add .`; `python3 - <<'EOF'\nopen('docs/a.md','w').write('tofu plan')\nEOF`; `mise run tofu omni apply -no-color tfplan; for i in $(seq 1 15); do sleep 1; done`; `S=$(date -u -d '-6 hours' +%FT%TZ); aws cloudwatch get-metric-statistics --namespace AWS/RDS --start-time $S`; `RID=$(aws rds describe-db-instances --output text)`; `timeout 240 bash -c "until [ \$(curl -s localhost/x | wc -l) -ge 7 ]; do sleep 10; done"; tofu fmt -check`; `for f in a b; do python3 -I -c "import json,sys; json.load(open(sys.argv[1]))" $f.json; done; tofu validate`.
- Ask: `bash <<'EOF'\ntofu apply\nEOF`; `python3 - <<'EOF'\nimport subprocess; subprocess.run(['tofu','destroy'])\nEOF`; `X="tofu apply -auto-approve"; bash -c "$X"`; `aws ec2 $(echo terminate-instances) --instance-ids i-1`; `ssh h "$C"; tofu plan`.
- Deny: `echo $(tofu apply -auto-approve)`; `tofu $(echo destroy)`; `RID=$(aws rds describe-db-instances)` as subagent without token.

### G2. C3, C7 saved plans and read-only subcommands
Files: `cloud-ops-guard.ts` (VALUE_FLAGS, SAVED_PLAN, `savedPlan`, `tfSub`/`classifyTf`, `stripWrappers` for `mise which`), `check.sh`.
- None (main): `terragrunt apply --working-dir live/pg -lock-timeout=5m -no-color tfplan`; `terragrunt apply --working-dir /abs/live/pg -no-color /abs/live/pg/pg.tfplan`; `tofu apply core.plan`; `tofu apply plan.bin`; `S=/tmp/x; tofu apply -lock-timeout=15m $S/slice52.tfplan`; `P=core.tfplan; tofu apply $P`; `tofu providers schema -json`; `tofu graph`; `terragrunt hclfmt`; `terragrunt hcl fmt`; `terragrunt list`; `terragrunt --version`; `terragrunt run --all -- show tfplan`; `mise which tofu`.
- Ask: `tofu apply "$P"` (unassigned); `S=$(mktemp -d); tofu apply $S/x.tfplan`; `tofu test`.
- Deny: `P=-auto-approve; tofu apply $P`; `tofu apply $P -auto-approve`; `mise run tofu grafana apply tfplan -no-color` (reason "flags before the plan file"); `terragrunt run -- apply -auto-approve`; existing `terragrunt --working-dir plan destroy -auto-approve`.
- Allowlist stays strict: `tofu plan -out=x.plan` is not `allow`; fuzz stays 0.

### G3. C4, C5, C8 gating, wrappers, aws
Files: `cloud-ops-guard.ts` (FORMS/`tfForm`, QUIET_SUBS/ASK_SUBS, `classify` :246/:256-261, new `awsFindings`), `check.sh`.
- Subagent without token, deny: `tofu console`; `echo 'jsonencode(local.x)' | mise run tofu cloudflare console`; `tofu state pull`; `tofu state show module.x`; `tofu show tfplan`; `tofu output -json`; `tofu refresh`; `$S/locked.sh tofu-core mise run tofu core apply tfplan`. With token: allow/none.
- Main, ask: `tofu output -json`; `tofu output -raw db_password`; `tofu show -json tfplan`; `tofu state pull`; `aws ec2 terminate-instances --instance-ids i-1`; `aws rds delete-db-instance --db-instance-identifier x`; `aws s3 rm s3://b/k --recursive`; `aws s3 rb s3://b --force`; `aws s3api put-bucket-policy --bucket b --policy file://p.json`; `aws --profile prod iam delete-user --user-name x`; `aws s3 sync . s3://b --delete`; `$K apply` and `echo tofu apply -auto-approve` unchanged.
- Main, none: `tofu output`; `tofu show`; `aws s3 ls`; `aws s3 cp a s3://b/a`; `aws logs filter-log-events --log-group-name g`; `$S/locked.sh tofu-core mise run tofu core apply tfplan`. Allow: `aws iam delete-user help`.
- Deny: `$S/locked.sh tofu-core mise run tofu core apply -auto-approve`; `/abs/wrapper.sh mise run tofu core apply -auto-approve`.
- Flips (same commit): check.sh:90 `tofu output -json` none->ask; check.sh:167 `aws iam delete-user --user-name help` none->ask; check.sh:92 `state show` stays allow in main.

### G4. C9 Kubernetes prod guard
Files: `cloud-ops-guard.ts` (K8S set/regex, `prodTarget()`, `k8sFindings()`), `check.sh` (fixtures `$root/kube-prod.yaml` with `current-context: omni-prod`, `$root/kube-dev.yaml`; `guard()` exports `KUBECONFIG` to a fixture for every case, never reads `~/.kube`).
- Deny: `kubectl --context omni-prod -n lh-backup-test delete pvc/data pv/pv-1`; `kubectl --context=omni-prod delete pv pv-1`; `KUBECONFIG=~/.kube/prod-kubeconfig.yaml kubectl -n x delete pvc d`; `[ "$(kubectl config current-context)" = omni-prod ] && kubectl -n lh-backup-test delete pvc data` with prod fixture; `kubectl --context omni-prod apply -f x.yaml` as subagent without token.
- Ask: `kubectl --context omni-prod -n longhorn-system delete volume v1`; `kubectl --context omni-prod -n longhorn-system delete backupvolumes.longhorn.io b1`; `kubectl --context omni-prod apply -f x.yaml`; `kubectl --context omni-prod -n isktel scale deploy/worker --replicas=0`; `helm --kube-context omni-prod upgrade x chart`; `talosctl -n 10.0.0.1 reset`; `omnictl delete cluster x`.
- None: `kubectl --context omni-dev -n isktel-dev scale deploy/worker --replicas=0`; `kubectl --context omni-prod get pods -A`; `kubectl --context omni-prod logs x`; `kubectl --context omni-prod describe pv`; `export KUBECONFIG=~/.kube/prod-kubeconfig.yaml; mise exec -- kubectl -n flux-system get ks`; `K="kubectl --context omni-prod"; $K get pods`; `talosctl get members`; `kubectl -n x delete pvc d` with dev fixture.

### F. Integration (coordinator)
Bump bash-rules and cloud-ops-guard versions in `plugin.json` and `.claude-plugin/marketplace.json`; update cloud-ops-guard description (kubectl/helm/talos prod, aws destructive asks); `python3 scripts/plugins.py catalog` and `check`; A1 and A3 live checks; ship both plugins.

## Risks
- Loosened: B3 (literal and path-finder vars), C1 (unrelated `$(...)`), C2 (literal scripts with `$`), C3 (`*.plan`, variable plans, terragrunt value flags), C5 (path wrapper of non-deny), C7 (read-only subcommands). Each has a must-flag counter-test; B3, C1, C3 have replay diffs that must lose no danger or apply deny.
- Tightened: B1, C4, C5, C8, C9 — expect more prompts in rovitracker and homelab.
- B3 rewrite also rewrites double-quoted data and quoted heredoc bodies; outcomes are stricter.
- B4 text prefix may change across versions; Lru path covers it.
- Rollback: one commit per slice; revert and re-ship.

## Decisions (open questions, defaults taken)
1. B3 path-finder variables accepted.
2. C3 unresolvable variable plan path asks.
3. C4 `state list` stays allowed in subagents.
4. C9 prod test is the whole-word `prod(uction)?` regex; env override only if needed later.
5. C9 flux out of scope.
6. B2a primes the main session too.
7. Allowlist relaxation for `cd X && ... | tail` is a separate follow-up.
